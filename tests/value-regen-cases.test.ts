import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StudyCache } from "../src/application/cache.ts";
import { generateStudy } from "../src/application/generate-study.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import type { LlmClient } from "../src/domain/ports.ts";
import type { StudyConfig } from "../src/domain/types.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { SearchMock } from "../src/infrastructure/search-mock.ts";
import { silentLogger } from "./helpers.ts";

/**
 * Casos da task 1.7 (FR-007): regeração única com lista de violações.
 * RED: sem a regeração, o LLM que inventa na primeira resposta tem o texto gravado.
 */

function mockLlm(first: string, second: string): LlmClient {
  let docCalls = 0;
  const inner = {
    generateText: async (system: string) => {
      if (system.includes("IDEIAS")) return JSON.stringify([{ nome: "Ideia A", setor: "S", descricao: "Faz X." }]);
      if (system.includes("PREMISSAS")) {
        return JSON.stringify({
          fatores: [
            { nome: "f1", valor: 20, unidade: "u", fonte: "INFERENCE" },
            { nome: "f2", valor: 4, unidade: "u", fonte: "INFERENCE" },
          ],
          recuperacao: 0.5,
        });
      }
      if (system.includes("consultor solo") || system.includes("consultor de negócios")) {
        docCalls += 1;
        return docCalls === 1 ? first : second;
      }
      return "texto";
    },
    countTokens: () => ({ input: 0, output: 0 }),
  } as unknown as LlmClient;
  return inner;
}

function config(overrides: Partial<StudyConfig> = {}): StudyConfig {
  return {
    ...resolveStudyConfig({ niche: "bebidas", numIdeas: 1, mock: true }),
    outputDir: mkdtempSync(join(tmpdir(), "regen-")),
    ...overrides,
  };
}

function deps(llm: LlmClient) {
  const handle = openMigratedDatabase(":memory:");
  const cache = new StudyCache(new SqliteCacheStore(handle.db));
  return {
    handle,
    args: {
      llm,
      decider: new DeciderMock(),
      search: new SearchMock(),
      cache,
      logger: silentLogger(),
    },
  };
}

const BASE_DOC = [
  "## 1. Resumo executivo",
  "## 2. Indicadores coletados",
  "## 3. Como funciona",
  "## 4. Estratégia de venda",
  "## 5. Estratégia de marketing",
  "## 6. Precificação e economia unitária",
  "## 7. SWOT",
  "## 8. Business Model Canvas",
  "## 9. Ferramentas complementares",
  "## 10. Próximos passos",
  "## 11. Proposta de valor e retorno",
  "Tier X SWOT Business Model Canvas Porter Próximos passos",
];

describe("FR-007: regeração única com lista de violações", () => {
  test("primeira versão com R$ 3.000 por ano pede segunda com a lista e grava a segunda", async () => {
    const invented = [...BASE_DOC, "O plano rende R$ 3.000 por ano."].join("\n").padEnd(6000, "x");
    const fixed = [...BASE_DOC, "A perda mensal é 2800 [INFERENCE]."].join("\n").padEnd(6000, "x");
    const { handle, args } = deps(mockLlm(invented, fixed));
    const result = await generateStudy(config(), args);
    handle.sqlite.close();
    const docs = Object.values(result.documents);
    expect(docs.length).toBe(1);
    expect(String(docs[0])).toContain("2800");
    expect(String(docs[0])).not.toContain("3.000");
  });

  test("violação restante na segunda versão entra em issues com o nome da ideia", async () => {
    const invented = [...BASE_DOC, "O plano rende R$ 3.000 por ano."].join("\n").padEnd(6000, "x");
    const { handle, args } = deps(mockLlm(invented, invented));
    const result = await generateStudy(config(), args);
    handle.sqlite.close();
    expect(result.issues.some((issue) => issue.includes("3.000"))).toBe(true);
  });
});
