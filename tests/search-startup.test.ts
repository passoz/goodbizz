/**
 * Startup da busca (FR-008): fora do modo simulado, o serviço não sobe sem chave de
 * busca no ambiente nem perfil de busca ativo; com busca simulada, sobe.
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

describe("startup da busca", () => {
  test("FR-008: sem chave de busca e sem perfil, o startup falha com a mensagem da chave", async () => {
    remember();
    delete Bun.env.SEARCH_API_KEY;
    resetEnv();
    try {
      const env = { ...baseEnv(), SEARCH_API_URL: "https://api.tavily.com", SEARCH_API_KEY: "" };
      const error = await buildService(env).then(
        () => null,
        (cause: unknown) => cause,
      );
      expect(error).toBeInstanceOf(Error);
      expect(String((error as Error).message)).toContain("SEARCH_API_KEY");
      expect(JSON.stringify(error)).not.toContain("tvly-SEGREDO");
    } finally {
      restore();
    }
  });

  test("FR-008: com busca simulada, o serviço sobe sem chave", async () => {
    remember();
    delete Bun.env.SEARCH_API_KEY;
    resetEnv();
    try {
      const env = {
        ...baseEnv(),
        SEARCH_API_URL: "https://api.tavily.com",
        SEARCH_API_KEY: "",
        GOODBIZZ_MOCK_SEARCH: true,
      };
      const bundle = await buildService(env);
      bundle.handle.sqlite.close();
    } finally {
      restore();
    }
  });

  test("FR-008: com chave de busca, o serviço sobe", async () => {
    remember();
    resetEnv();
    try {
      const env = {
        ...baseEnv(),
        SEARCH_API_URL: "https://api.tavily.com",
        SEARCH_API_KEY: "tvly-chave-de-teste",
      };
      const bundle = await buildService(env);
      bundle.handle.sqlite.close();
    } finally {
      restore();
    }
  });
});
