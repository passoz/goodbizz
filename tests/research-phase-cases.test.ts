/**
 * Casos de borda da fase de pesquisa (FR-002): resposta do planejador sem JSON e buscas repetidas.
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

async function queriesFor(plannerAnswer: string): Promise<{ queries: string[]; issues: string[] }> {
  const mock = new LlmMock();
  const llm: LlmClient = {
    generateText: (system, user) =>
      system.includes("PALAVRA-CHAVE: BUSCAS") ? Promise.resolve(plannerAnswer) : mock.generateText(system, user),
  };
  const queries: string[] = [];
  const search: SearchClient = {
    search(query) {
      queries.push(query);
      return Promise.resolve([]);
    },
  };
  const handle = openMigratedDatabase(":memory:");
  const cfg = {
    ...resolveStudyConfig({ niche: "pet shop", city: "Niterói", numIdeas: 1, mock: true }),
    outputDir: mkdtempSync(join(tmpdir(), "goodbizz-research-cases-")),
    evaluateOnly: true,
  };
  const result = await generateStudy(cfg, {
    llm,
    decider: new DeciderMock(),
    search,
    cache: new StudyCache(new SqliteCacheStore(handle.db)),
    logger: QUIET,
  });
  handle.sqlite.close();
  return { queries, issues: result.issues };
}

describe("planejamento das buscas", () => {
  test("FR-002: resposta sem JSON vira as 6 buscas padrão do nicho, com aviso", async () => {
    const { queries, issues } = await queriesFor("não sei responder em JSON");
    expect(queries).toHaveLength(6);
    expect(queries.every((query) => query.includes("pet shop"))).toBe(true);
    expect(issues.some((issue) => issue.includes("0 buscas"))).toBe(true);
  });

  test("FR-002: buscas repetidas e objetos com a chave busca são normalizados", async () => {
    const answer = JSON.stringify([
      "preço sistema pet shop",
      "Preço   sistema pet shop",
      { busca: "reclamações banho e tosa Niterói" },
      "",
      "custos de ração pet shop",
      "pet shops em Niterói",
      "licença sanitária pet shop",
      "concorrentes agenda pet shop",
    ]);
    const { queries, issues } = await queriesFor(answer);
    expect(queries).toEqual([
      "preço sistema pet shop",
      "reclamações banho e tosa Niterói",
      "custos de ração pet shop",
      "pet shops em Niterói",
      "licença sanitária pet shop",
      "concorrentes agenda pet shop",
    ]);
    expect(issues.some((issue) => issue.includes("completei"))).toBe(false);
  });
});
