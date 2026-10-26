/**
 * Chamada de premissas (FR-001): o pipeline pede premissas ao LLM uma vez por ideia,
 * com cache próprio, e registra a correção em issues quando a fonte não existe.
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

const QUIET = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

function harness(answer: (system: string) => string | null): {
  llm: LlmClient;
  search: SearchClient;
  calls: { premises: number };
} {
  const mock = new LlmMock();
  const calls = { premises: 0 };
  const llm: LlmClient = {
    generateText: (system, user) => {
      const premade = answer(system);
      if (premade !== null) {
        calls.premises += 1;
        return Promise.resolve(premade);
      }
      return mock.generateText(system, user);
    },
    usage: () => ({ calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }),
  };
  const search: SearchClient = {
    search: () => Promise.resolve([]),
    usage: () => ({ calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }),
  };
  return { llm, search, calls };
}

async function runStudy(llm: LlmClient, search: SearchClient, dirPrefix: string, numIdeas = 2) {
  const handle = openMigratedDatabase(":memory:");
  const cfg = {
    ...resolveStudyConfig({ niche: "depositos de bebidas", city: "Cabo Frio", numIdeas, mock: true }),
    outputDir: mkdtempSync(join(tmpdir(), dirPrefix)),
  };
  const result = await generateStudy(cfg, {
    llm,
    decider: new DeciderMock(),
    search,
    cache: new StudyCache(new SqliteCacheStore(handle.db)),
    logger: QUIET,
  });
  handle.sqlite.close();
  return result;
}

function premisesAnswer(source: string): string {
  return JSON.stringify({
    fatores: [
      { nome: "horas perdidas", valor: 20, unidade: "horas/mês", fonte: source },
      { nome: "custo da hora", valor: 140, unidade: "R$", fonte: "INFERENCE" },
    ],
    recuperacao: 0.5,
  });
}

describe("chamada de premissas", () => {
  test("FR-001: o pipeline pede premissas ao LLM uma vez por ideia", async () => {
    const { llm, search, calls } = harness((system) =>
      system.includes("PALAVRA-CHAVE: PREMISSAS") ? premisesAnswer("INFERENCE") : null,
    );
    await runStudy(llm, search, "goodbizz-premises-acc-");
    expect(calls.premises).toBe(2);
  });

  test("FR-001: fonte E42 inexistente vira INFERENCE com correção em issues", async () => {
    const { llm, search } = harness((system) =>
      system.includes("PALAVRA-CHAVE: PREMISSAS") ? premisesAnswer("E42") : null,
    );
    const result = await runStudy(llm, search, "goodbizz-premises-orphan-", 1);
    expect(
      result.issues.some((issue) => issue.includes("E42") && issue.includes("INFERENCE")),
    ).toBe(true);
  });
});
