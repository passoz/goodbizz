/**
 * Busca simulada determinística (QR-001): com GOODBIZZ_MOCK=1 ou GOODBIZZ_MOCK_SEARCH=1
 * o serviço usa a busca simulada, não abre rede e repete as evidências para a mesma entrada.
 */
import { describe, expect, test } from "bun:test";

import { generateStudy } from "../src/application/generate-study.ts";
import { StudyCache } from "../src/application/cache.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { SearchMock } from "../src/infrastructure/search-mock.ts";
import { RoutingSearchClient } from "../src/infrastructure/routing.ts";
import { silentLogger } from "./helpers.ts";

const QUIET = silentLogger();

function cfg() {
  return {
    ...resolveStudyConfig({ niche: "deposito de bebidas", numIdeas: 1, mock: true }),
    outputDir: "estudo",
    evaluateOnly: true,
  };
}

describe("busca simulada determinística", () => {
  test("QR-001: dois serviços simulados geram as mesmas evidências sem fetch de rede", async () => {
    const realFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = (async () => {
      fetches += 1;
      throw new Error("rede proibida no modo simulado");
    }) as unknown as typeof fetch;
    try {
      const run = async () => {
        const handle = openMigratedDatabase(":memory:");
        const cache = new StudyCache(new SqliteCacheStore(handle.db));
        const search = new RoutingSearchClient({
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
        const result = await generateStudy(cfg(), {
          llm: new LlmMock(),
          decider: new DeciderMock(),
          search,
          cache,
          logger: QUIET,
        });
        handle.sqlite.close();
        return result.evidences;
      };
      const first = await run();
      const second = await run();
      expect(first.length).toBeGreaterThan(0);
      expect(second).toEqual(first);
      expect(fetches).toBe(0);
      for (const evidence of first) expect(evidence.url).toContain("mock.busca.test");
      for (const evidence of first) expect(evidence.trecho).toContain("[QR-001]");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("QR-001: o mock repete os resultados para a mesma busca", async () => {
    const mock = new SearchMock();
    const first = await mock.search("preço de sistema para deposito de bebidas");
    const second = await mock.search("preço de sistema para deposito de bebidas");
    expect(second).toEqual(first);
    expect(first.length).toBeGreaterThan(0);
    expect(mock.usage().calls).toBe(2);
  });
});
