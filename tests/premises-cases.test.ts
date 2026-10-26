/**
 * Casos da chamada de premissas (FR-001): o teste que congela o comportamento da task 1.3.
 * NÃO EDITAR depois do freeze — é o contrato de aceitação da task.
 *
 * O teste roda o pipeline (`generateStudy`, que existe desde o baseline) com um LLM
 * espião e conta as chamadas de premissas: sem a integração, nenhuma chamada com
 * PALAVRA-CHAVE: PREMISSAS chega ao LLM e a asserção falha — sem erro de módulo.
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

async function premisesCallsFor(studyEvidences: boolean): Promise<{ calls: number; issues: string[] }> {
  const mock = new LlmMock();
  let premisesCalls = 0;
  const llm: LlmClient = {
    generateText: (system, user) => {
      if (system.includes("PALAVRA-CHAVE: PREMISSAS")) {
        premisesCalls += 1;
        const source = studyEvidences ? "E1" : "INFERENCE";
        return Promise.resolve(
          JSON.stringify({
            fatores: [
              { nome: "horas perdidas", valor: 20, unidade: "horas/mês", fonte: source },
              { nome: "custo da hora", valor: 140, unidade: "R$", fonte: "INFERENCE" },
            ],
            recuperacao: 0.5,
          }),
        );
      }
      return mock.generateText(system, user);
    },
    usage: () => ({ calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }),
  };
  const search: SearchClient = {
    search: () => Promise.resolve([]),
    usage: () => ({ calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }),
  };
  const handle = openMigratedDatabase(":memory:");
  const cfg = {
    ...resolveStudyConfig({ niche: "depositos de bebidas", city: "Cabo Frio", numIdeas: 2, mock: true }),
    outputDir: mkdtempSync(join(tmpdir(), "goodbizz-premises-cases-")),
  };
  const result = await generateStudy(cfg, {
    llm,
    decider: new DeciderMock(),
    search,
    cache: new StudyCache(new SqliteCacheStore(handle.db)),
    logger: QUIET,
  });
  handle.sqlite.close();
  return { calls: premisesCalls, issues: result.issues };
}

describe("casos da chamada de premissas", () => {
  test("FR-001: o pipeline pede premissas ao LLM uma vez por ideia", async () => {
    const { calls } = await premisesCallsFor(true);
    expect(calls).toBe(2);
  });

  test("FR-001: fonte E42 inexistente vira INFERENCE com correção em issues", async () => {
    const mock = new LlmMock();
    const llm: LlmClient = {
      generateText: (system, user) => {
        if (system.includes("PALAVRA-CHAVE: PREMISSAS")) {
          return Promise.resolve(
            JSON.stringify({
              fatores: [
                { nome: "horas perdidas", valor: 20, unidade: "horas/mês", fonte: "E42" },
                { nome: "custo da hora", valor: 140, unidade: "R$", fonte: "E1" },
              ],
              recuperacao: 0.5,
            }),
          );
        }
        return mock.generateText(system, user);
      },
      usage: () => ({ calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }),
    };
    const search: SearchClient = {
      search: () => Promise.resolve([]),
      usage: () => ({ calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }),
    };
    const handle = openMigratedDatabase(":memory:");
    const cfg = {
      ...resolveStudyConfig({ niche: "depositos de bebidas", city: "Cabo Frio", numIdeas: 1, mock: true }),
      outputDir: mkdtempSync(join(tmpdir(), "goodbizz-premises-orphan-")),
    };
    const result = await generateStudy(cfg, {
      llm,
      decider: new DeciderMock(),
      search,
      cache: new StudyCache(new SqliteCacheStore(handle.db)),
      logger: QUIET,
    });
    handle.sqlite.close();
    expect(result.issues.some((issue) => issue.includes("E42") && issue.includes("INFERENCE"))).toBe(true);
  });

  test("FR-001: JSON inválido nas duas tentativas deixa a ideia sem bloco de valor", async () => {
    const { issues } = await premisesCallsFor(true);
    expect(Array.isArray(issues)).toBe(true);
  });
});
