/**
 * Casos do consumo de busca (FR-010): preço zero não muda o custo nem a nota, e a busca que só sai
 * do cache não conta chamada.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StudyCache } from "../src/application/cache.ts";
import { estimateCost } from "../src/application/costs.ts";
import { generateStudy } from "../src/application/generate-study.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import type { SearchClient } from "../src/domain/ports.ts";
import type { ProviderUsage } from "../src/domain/types.ts";

const QUIET = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
const ZERO: ProviderUsage = { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
const PRICES = {
  llmInputPerMTok: 0,
  llmCachedInputPerMTok: 0,
  llmOutputPerMTok: 0,
  deciderInputPerMTok: 0,
  deciderOutputPerMTok: 0,
  usdBrl: 0,
};

describe("consumo de busca em casos de borda", () => {
  test("FR-010: com preço zero a busca não custa nem aparece na nota", () => {
    const cost = estimateCost(
      { llm: ZERO, decider: ZERO, search: { ...ZERO, calls: 500 } },
      { ...PRICES, searchPer1k: 0 },
    );
    expect(cost?.usd).toBe(0);
    expect(cost?.note).not.toContain("busca");
    const paid = estimateCost(
      { llm: ZERO, decider: ZERO, search: { ...ZERO, calls: 500 } },
      { ...PRICES, searchPer1k: 4 },
    );
    expect(paid?.usd).toBe(2);
  });

  test("FR-010: reexecutar com o cache cheio não conta chamada de busca", async () => {
    let calls = 0;
    const search: SearchClient = {
      search(query) {
        calls += 1;
        return Promise.resolve([{ title: query, url: `https://c.test/${calls}`, content: "Texto." }]);
      },
      usage: () => ({ ...ZERO, calls }),
    };
    const handle = openMigratedDatabase(":memory:");
    const cache = new StudyCache(new SqliteCacheStore(handle.db));
    const cfg = {
      ...resolveStudyConfig({ niche: "padaria", numIdeas: 1, mock: true }),
      outputDir: mkdtempSync(join(tmpdir(), "goodbizz-usage-cases-")),
      evaluateOnly: true,
    };
    const deps = { llm: new LlmMock(), decider: new DeciderMock(), search, cache, logger: QUIET };
    const first = await generateStudy(cfg, deps);
    const second = await generateStudy(cfg, deps);
    handle.sqlite.close();
    expect(first.usage.search.calls).toBeGreaterThan(0);
    expect(second.usage.search.calls).toBe(0);
  });
});
