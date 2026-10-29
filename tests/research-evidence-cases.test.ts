/**
 * Casos de borda da extração (FR-003): busca vazia (EC-001), JSON inválido com uma retentativa
 * (EC-002) e a mesma URL em duas buscas (EC-003).
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StudyCache } from "../src/application/cache.ts";
import { generateStudy } from "../src/application/generate-study.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import type { LlmClient, SearchClient } from "../src/domain/ports.ts";
import type { SearchResult } from "../src/domain/types.ts";

const QUIET = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

interface Scenario {
  results: Record<string, SearchResult[]>;
  extractor: (user: string, attempt: number) => string;
}

async function run(scenario: Scenario) {
  const mock = new LlmMock();
  const prompts: string[] = [];
  const llm: LlmClient = {
    generateText(system, user) {
      if (system.includes("PALAVRA-CHAVE: BUSCAS")) {
        return Promise.resolve(JSON.stringify(["b1", "b2", "b3", "b4", "b5", "b6"]));
      }
      if (system.includes("PALAVRA-CHAVE: EVIDENCIAS")) {
        prompts.push(user);
        return Promise.resolve(scenario.extractor(user, prompts.length));
      }
      return mock.generateText(system, user);
    },
  };
  const search: SearchClient = { search: (query) => Promise.resolve(scenario.results[query] ?? []) };
  const handle = openMigratedDatabase(":memory:");
  const cfg = {
    ...resolveStudyConfig({ niche: "padaria", numIdeas: 1, mock: true }),
    outputDir: mkdtempSync(join(tmpdir(), "goodbizz-evidence-cases-")),
    evaluateOnly: true,
    concurrency: 1,
  };
  const result = await generateStudy(cfg, {
    llm,
    decider: new DeciderMock(),
    search,
    cache: new StudyCache(new SqliteCacheStore(handle.db)),
    logger: QUIET,
  });
  handle.sqlite.close();
  return { result, prompts };
}

const PAGE: SearchResult = {
  title: "Pão",
  url: "https://padaria.test/pao",
  content: "O pão francês custa R$ 18 o quilo.",
};
const LITERAL = JSON.stringify([
  {
    tipo: "preco",
    afirmacao: "preço do pão",
    trecho: "O pão francês custa R$ 18 o quilo.",
    url: PAGE.url,
    valor: 18,
    unidade: "R$/kg",
  },
]);

describe("extração de evidências", () => {
  test("FR-003 / EC-002: JSON inválido é extraído de novo uma vez e a segunda resposta vale", async () => {
    const { result, prompts } = await run({
      results: { b1: [PAGE] },
      extractor: (_user, attempt) => (attempt === 1 ? "sem json aqui" : LITERAL),
    });
    expect(prompts).toHaveLength(2);
    expect(result.evidences.map((evidence) => evidence.trecho)).toEqual([
      "O pão francês custa R$ 18 o quilo.",
    ]);
  });

  test("FR-003 / EC-002: duas respostas inválidas deixam a busca sem evidência e registram em issues", async () => {
    const { result, prompts } = await run({ results: { b1: [PAGE] }, extractor: () => "{ quebrado" });
    expect(prompts).toHaveLength(2);
    expect(result.evidences).toEqual([]);
    expect(result.issues.some((issue) => issue.includes('"b1"') && issue.includes("JSON"))).toBe(true);
  });

  test("FR-003 / EC-003: a mesma URL em duas buscas entra uma vez antes da extração", async () => {
    const other: SearchResult = {
      title: "Café",
      url: "https://padaria.test/cafe",
      content: "O café custa R$ 6.",
    };
    const { prompts } = await run({
      results: { b1: [PAGE], b2: [{ ...PAGE, url: `${PAGE.url}/` }, other] },
      extractor: () => "[]",
    });
    const mentions = prompts.join("\n").split("https://padaria.test/pao").length - 1;
    expect(mentions).toBe(1);
    expect(prompts.some((prompt) => prompt.includes("https://padaria.test/cafe"))).toBe(true);
  });

  test("FR-003 / EC-001: busca sem resultado segue o estudo e vira aviso", async () => {
    const { result } = await run({ results: { b1: [PAGE] }, extractor: () => LITERAL });
    expect(result.evidences).toHaveLength(1);
    expect(result.issues.filter((issue) => /a busca "b\d" não trouxe resultado/.test(issue))).toHaveLength(5);
  });
});
