/**
 * Casos da busca simulada (QR-001): buscas distintas devolvem páginas distintas, o
 * conteúdo cita a busca e a URL é estável, e o modo real exige busca sem mock.
 */
import { describe, expect, test } from "bun:test";

import { generateStudy } from "../src/application/generate-study.ts";
import { StudyCache } from "../src/application/cache.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { RoutingSearchClient } from "../src/infrastructure/routing.ts";
import { silentLogger } from "./helpers.ts";

function mockSearch() {
  return new RoutingSearchClient({
    resolve: () => ({
      llmBaseUrl: "",
      llmApiKey: "",
      llmModel: "",
      deciderUrl: "",
      deciderApiKey: "",
      deciderModel: "",
      searchBaseUrl: "https://api.tavily.com",
      searchApiKey: "",
    }),
    mock: true,
  });
}

describe("casos da busca simulada", () => {
  test("QR-001: buscas distintas devolvem URLs distintas com conteúdo da busca", async () => {
    const mock = mockSearch();
    const price = await mock.search("preço de sistema para padaria");
    const rival = await mock.search("concorrentes de automação para padaria");
    expect(price.length).toBeGreaterThan(0);
    expect(rival.length).toBeGreaterThan(0);
    const priceUrls = new Set(price.map((result) => result.url));
    const rivalUrls = new Set(rival.map((result) => result.url));
    const overlap = [...priceUrls].filter((url) => rivalUrls.has(url));
    expect(overlap).toHaveLength(0);
    for (const result of price) expect(result.content).toContain("[QR-001]");
  });

  test("QR-001: a mesma busca após outras buscas repete as URLs", async () => {
    const mock = mockSearch();
    const first = await mock.search("custos e perdas na operação de mercado");
    await mock.search("outra busca qualquer");
    const again = await mock.search("custos e perdas na operação de mercado");
    expect(again.map((result) => result.url)).toEqual(first.map((result) => result.url));
  });
});

describe("fiação no serviço", () => {
  test("QR-001: o serviço simulado grava evidências sem rede", async () => {
    const realFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = (async () => {
      fetches += 1;
      throw new Error("rede proibida no modo simulado");
    }) as unknown as typeof fetch;
    try {
      const handle = openMigratedDatabase(":memory:");
      const cache = new StudyCache(new SqliteCacheStore(handle.db));
      const search = mockSearch();
      const cfg = {
        ...resolveStudyConfig({ niche: "deposito de bebidas", numIdeas: 1, mock: true }),
        outputDir: "estudo",
        evaluateOnly: true,
      };
      const result = await generateStudy(cfg, {
        llm: new LlmMock(),
        decider: new DeciderMock(),
        search,
        cache,
        logger: silentLogger(),
      });
      handle.sqlite.close();
      expect(result.evidences.length).toBeGreaterThan(0);
      expect(result.evidences[0].trecho).toContain("QR-001");
      expect(fetches).toBe(0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
