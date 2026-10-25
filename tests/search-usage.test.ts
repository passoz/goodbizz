/**
 * Consumo de busca (FR-010): o `usage` do estudo conta as chamadas ao provedor de busca e o custo
 * soma `GOODBIZZ_PRICE_SEARCH_PER_1K` por mil chamadas.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StudyCache } from "../src/application/cache.ts";
import { estimateCost, pricesFromEnv } from "../src/application/costs.ts";
import { generateStudy } from "../src/application/generate-study.ts";
import { resetEnv } from "../src/config/env.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import type { SearchClient } from "../src/domain/ports.ts";
import type { ProviderUsage } from "../src/domain/types.ts";

const QUIET = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
const ZERO: ProviderUsage = { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

/** Busca que mede as próprias chamadas desde o início do processo, como o cliente real. */
function meteredSearch(alreadyMade: number): SearchClient & { made: () => number } {
  let calls = alreadyMade;
  return {
    made: () => calls - alreadyMade,
    search(query) {
      calls += 1;
      return Promise.resolve([{ title: query, url: `https://b.test/${calls}`, content: `Página ${calls}.` }]);
    },
    usage: () => ({ ...ZERO, calls }),
  };
}

afterEach(() => {
  delete Bun.env.GOODBIZZ_PRICE_SEARCH_PER_1K;
  resetEnv();
});

describe("consumo de busca", () => {
  test("FR-010: usage.search.calls conta só as buscas deste estudo", async () => {
    const handle = openMigratedDatabase(":memory:");
    const search = meteredSearch(40);
    const cfg = {
      ...resolveStudyConfig({ niche: "deposito de bebidas", numIdeas: 2, mock: true }),
      outputDir: mkdtempSync(join(tmpdir(), "goodbizz-usage-")),
      evaluateOnly: true,
    };
    const result = await generateStudy(cfg, {
      llm: new LlmMock(),
      decider: new DeciderMock(),
      search,
      cache: new StudyCache(new SqliteCacheStore(handle.db)),
      logger: QUIET,
    });
    handle.sqlite.close();
    expect(search.made()).toBe(8 + 2 * 2);
    expect(result.usage.search.calls).toBe(search.made());
  });

  test("FR-010: o custo soma o preço por mil buscas do ambiente", () => {
    Bun.env.GOODBIZZ_PRICE_SEARCH_PER_1K = "8";
    Bun.env.GOODBIZZ_PRICE_LLM_INPUT_PER_MTOK = "0";
    Bun.env.GOODBIZZ_PRICE_LLM_OUTPUT_PER_MTOK = "0";
    Bun.env.GOODBIZZ_PRICE_DECIDER_INPUT_PER_MTOK = "0";
    resetEnv();
    try {
      const prices = pricesFromEnv();
      const cost = estimateCost({ llm: ZERO, decider: ZERO, search: { ...ZERO, calls: 26 } }, prices);
      expect(cost?.usd).toBeCloseTo(0.208, 6);
      expect(cost?.note).toContain("busca");
    } finally {
      delete Bun.env.GOODBIZZ_PRICE_LLM_INPUT_PER_MTOK;
      delete Bun.env.GOODBIZZ_PRICE_LLM_OUTPUT_PER_MTOK;
      delete Bun.env.GOODBIZZ_PRICE_DECIDER_INPUT_PER_MTOK;
    }
  });
});
