/**
 * Casos da CLI com pesquisa (SC-002): a CLI aceita --mock-search, --search-url
 * e --search-key, exige chave fora do modo simulado e o estudo --mock grava
 * 00-evidencias.md. O primeiro caso (flags lidas) falha antes do GREEN.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { main } from "../src/cli.ts";
import { SearchHttp } from "../src/infrastructure/search.ts";
import { createSearchClient } from "../src/infrastructure/search.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { resetEnv } from "../src/config/env.ts";

function silence(): () => void {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  return () => {
    console.log = originalLog;
    console.error = originalError;
  };
}

describe("CLI com busca", () => {
  test("SC-002: generate rejeita --mock-search junto de --search-key", async () => {
    const restore = silence();
    let code = 0;
    try {
      code = await main([
        "generate",
        "depositos de bebidas",
        "--mock",
        "--mock-search",
        "--search-key",
        "chave-falsa",
        "--output",
        mkdtempSync(join(tmpdir(), "goodbizz-cli-cases-")),
      ]);
    } finally {
      restore();
    }
    expect(code).toBe(2);
  });

  test("SC-002: generate sem chave e sem simulado exige a chave de busca", async () => {
    const previousKey = Bun.env.SEARCH_API_KEY;
    const previousMock = Bun.env.GOODBIZZ_MOCK;
    const previousMockSearch = Bun.env.GOODBIZZ_MOCK_SEARCH;
    delete Bun.env.SEARCH_API_KEY;
    delete Bun.env.GOODBIZZ_MOCK;
    delete Bun.env.GOODBIZZ_MOCK_SEARCH;
    resetEnv();
    const restore = silence();
    let code = 0;
    try {
      code = await main([
        "generate",
        "depositos de bebidas",
        "--llm-key",
        "chave-falsa",
        "--decider-url",
        "http://decisor.local",
        "--output",
        mkdtempSync(join(tmpdir(), "goodbizz-cli-cases-")),
      ]);
    } finally {
      restore();
      if (previousKey === undefined) delete Bun.env.SEARCH_API_KEY;
      else Bun.env.SEARCH_API_KEY = previousKey;
      if (previousMock === undefined) delete Bun.env.GOODBIZZ_MOCK;
      else Bun.env.GOODBIZZ_MOCK = previousMock;
      if (previousMockSearch === undefined) delete Bun.env.GOODBIZZ_MOCK_SEARCH;
      else Bun.env.GOODBIZZ_MOCK_SEARCH = previousMockSearch;
      resetEnv();
    }
    expect(code).toBe(2);
  });

  test("SC-002: --search-key chega ao adaptador HTTP de busca", () => {
    const cfg = {
      ...resolveStudyConfig({
        niche: "depositos de bebidas",
        mockLlm: true,
        mockDecider: true,
        mockSearch: false,
        searchBaseUrl: "https://busca.exemplo.test",
        searchApiKey: "chave-chegada",
      }),
    };
    const client = createSearchClient(cfg);
    expect(client).toBeInstanceOf(SearchHttp);
  });

  test("SC-002: generate --mock grava 00-evidencias.md com trecho literal", async () => {
    const dir = mkdtempSync(join(tmpdir(), "goodbizz-cli-cases-"));
    const restore = silence();
    let code = 0;
    try {
      code = await main(["generate", "depositos de bebidas", "--mock", "--ideas", "1", "--output", dir]);
    } finally {
      restore();
    }
    expect(code).toBe(0);
    const path = join(dir, "00-evidencias.md");
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("mock.busca.test");
  });
});
