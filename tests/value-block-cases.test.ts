/**
 * Casos da task 1.4 (FR-004): o dataBlock traz o bloco VALOR e o plano ganha a seção 11.
 * NÃO EDITAR depois do freeze — é o contrato de aceitação da task.
 *
 * Sem a impl, `dataBlock` não menciona "VALOR" e o documento simulado não tem
 * "## 11. Proposta de valor e retorno" — as asserções falham por comportamento.
 * RED 1.4: sem bloco VALOR a primeira asserção falha.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StudyCache } from "../src/application/cache.ts";
import { dataBlock } from "../src/application/generation.ts";
import { generateStudy } from "../src/application/generate-study.ts";
import { DOC_SECTIONS } from "../src/application/prompts.ts";
import { calculateValue } from "../src/application/value.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import type { SearchClient } from "../src/domain/ports.ts";

const QUIET = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
const SEARCH: SearchClient = {
  search: () => Promise.resolve([]),
  usage: () => ({ calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }),
};

function valueArgs() {
  return {
    premises: [
      { nome: "horas perdidas", valor: 20, unidade: "horas/mês", fonte: "INFERENCE" },
      { nome: "custo da hora", valor: 140, unidade: "R$", fonte: "INFERENCE" },
    ],
    value: calculateValue({ factors: [20, 140], recovery: 0.5, setupFee: 1500, monthlyTicket: 350 }),
    setupFee: 1500,
  };
}

describe("FR-004: bloco VALOR e seção 11", () => {
  test("FR-004: dataBlock lista as premissas com fonte e os números calculados", () => {
    const handle = openMigratedDatabase(":memory:");
    try {
      const cfg = resolveStudyConfig({
        niche: "depositos de bebidas",
        city: "Cabo Frio",
        numIdeas: 1,
        mock: true,
      });
      const evaluations = [
        {
          name: "Ideia X",
          sector: "operacao",
          description: "descricao",
          indicators: {
            fit: 1,
            fitConf: 0.5,
            sale: 1,
            saleConf: 0.5,
            disruption: 1,
            disruptionConf: 0.5,
            pain: "perda",
            painProbs: { perda: 1 },
            painConf: 0.5,
            solo: 1,
          },
          business: { wtp: 0.5, meta30: 0.5, price: 1, priceConf: 0.5 },
          algorithm: {
            label: "forte",
            painScore: 1,
            internalScore: 1,
            margin: 0,
            deviation: 0,
            probes: {},
            byParaphrase: [],
          },
          index: 1.5,
          tier: "A",
        } as never,
      ];
      const block = dataBlock(evaluations[0]!, cfg, valueArgs() as never);
      expect(block).toContain("VALOR");
      expect(block).toContain("horas perdidas");
      expect(block).toContain("INFERENCE");
      expect(block).toContain("2800");
    } finally {
      handle.sqlite.close();
    }
  });

  test("FR-004: o plano simulado tem as 11 seções com as 6 subseções da seção 11", async () => {
    expect(DOC_SECTIONS).toContain("11. Proposta de valor e retorno");
    const handle = openMigratedDatabase(":memory:");
    try {
      const cfg = {
        ...resolveStudyConfig({ niche: "depositos de bebidas", city: "Cabo Frio", numIdeas: 1, mock: true }),
        outputDir: mkdtempSync(join(tmpdir(), "goodbizz-valor-cases-")),
      };
      const result = await generateStudy(cfg, {
        llm: new LlmMock(),
        decider: new DeciderMock(),
        search: SEARCH,
        cache: new StudyCache(new SqliteCacheStore(handle.db)),
        logger: QUIET,
      });
      const docs = Object.values(result.documents);
      expect(docs.length).toBeGreaterThan(0);
      const doc = docs[0] as string;
      expect(doc).toContain("## 11. Proposta de valor e retorno");
      for (const sub of ["11.1", "11.2", "11.3", "11.4", "11.5", "11.6"]) {
        expect(doc).toContain(sub);
      }
    } finally {
      handle.sqlite.close();
    }
  });

  test("FR-004: sem evidência, a conta é estimativa a confirmar", async () => {
    const handle = openMigratedDatabase(":memory:");
    try {
      const cfg = {
        ...resolveStudyConfig({ niche: "depositos de bebidas", city: "Cabo Frio", numIdeas: 1, mock: true }),
        outputDir: mkdtempSync(join(tmpdir(), "goodbizz-valor-noev-")),
      };
      const result = await generateStudy(cfg, {
        llm: new LlmMock(),
        decider: new DeciderMock(),
        search: SEARCH,
        cache: new StudyCache(new SqliteCacheStore(handle.db)),
        logger: QUIET,
      });
      const docs = Object.values(result.documents);
      expect(docs.length).toBeGreaterThan(0);
      expect(docs[0] as string).toContain("estimativa a confirmar");
    } finally {
      handle.sqlite.close();
    }
  });
});
