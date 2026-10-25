/**
 * Casos do startup da busca (FR-008): chave só com espaço conta como ausente e a
 * mensagem nunca expõe o segredo; URL própria com chave sobe; erro não vaza segredo.
 */
import { describe, expect, test } from "bun:test";

import { buildService } from "../src/index.ts";
import { loadEnv, resetEnv } from "../src/config/env.ts";

const SAVED = ["SEARCH_API_URL", "SEARCH_API_KEY", "GOODBIZZ_MOCK_SEARCH"] as const;
const saved = new Map<string, string | undefined>();

function remember(): void {
  for (const key of SAVED) if (!saved.has(key)) saved.set(key, Bun.env[key]);
}

function restore(): void {
  for (const [key, value] of saved) {
    if (value === undefined) delete Bun.env[key];
    else Bun.env[key] = value;
  }
  saved.clear();
  resetEnv();
}

function baseEnv() {
  return {
    ...loadEnv(),
    DATABASE_URL: ":memory:",
    GOODBIZZ_STUDIES_DIR: "estudo",
    GOODBIZZ_MOCK: false,
    GOODBIZZ_MOCK_LLM: true,
    GOODBIZZ_MOCK_DECIDER: true,
    GOODBIZZ_MOCK_SEARCH: false,
    LOG_LEVEL: "error" as const,
  };
}

describe("casos do startup da busca", () => {
  test("FR-008: chave só com espaço conta como ausente e a mensagem não expõe segredo", async () => {
    remember();
    resetEnv();
    try {
      const env = { ...baseEnv(), SEARCH_API_URL: "https://api.tavily.com", SEARCH_API_KEY: "   " };
      const error = await buildService(env).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(error).toBeInstanceOf(Error);
      const message = String((error as Error).message);
      expect(message).toContain("SEARCH_API_KEY");
      expect(JSON.stringify(error)).not.toContain("   ");
    } finally {
      restore();
    }
  });

  test("FR-008: URL própria da busca com chave sobe", async () => {
    remember();
    resetEnv();
    try {
      const env = {
        ...baseEnv(),
        SEARCH_API_URL: "https://busca.interna.test",
        SEARCH_API_KEY: "chave-interna",
      };
      const bundle = await buildService(env);
      bundle.handle.sqlite.close();
    } finally {
      restore();
    }
  });
});
