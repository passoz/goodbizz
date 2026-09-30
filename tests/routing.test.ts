/**
 * Clientes que releem a configuração: trocar URL/chave na aba /settings vale sem reiniciar o
 * processo, e o consumo acumulado sobrevive à troca de cliente.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { ProviderSettingsStore } from "../src/application/settings.ts";
import { effectiveProviders, type ProviderConfig } from "../src/config/providers.ts";
import { sumUsage, RoutingDeciderClient, RoutingLlmClient } from "../src/infrastructure/routing.ts";
import { SqliteSettingsRepository } from "../src/infrastructure/settings-repository.ts";
import { openMigratedDatabase, type DatabaseHandle } from "../src/infrastructure/db.ts";
import type { Env } from "../src/config/env.ts";

interface Stub {
  url: string;
  hits: number;
  stop: () => void;
}

/** Servidor local que responde como um `/chat/completions` com `usage`. */
function stubLlm(tokens: { input: number; output: number }): Stub {
  const state = { hits: 0 };
  const server = Bun.serve({
    port: 0,
    fetch: async () => {
      state.hits += 1;
      return Response.json({
        choices: [{ message: { content: "texto do stub" } }],
        usage: { prompt_tokens: tokens.input, completion_tokens: tokens.output },
      });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}/v1`,
    get hits() {
      return state.hits;
    },
    stop: () => server.stop(true),
  } as Stub;
}

/** Servidor local que responde como o `/v1/systemone` do 9router. */
function stubDecider(): Stub {
  const state = { hits: 0 };
  const server = Bun.serve({
    port: 0,
    fetch: async () => {
      state.hits += 1;
      return Response.json({
        answers: { q1: { type: "noul", noul: 0.5 } },
        usage: { input_tokens: 40, output_tokens: 10 },
      });
    },
  });
  return {
    url: `http://127.0.0.1:${server.port}/v1`,
    get hits() {
      return state.hits;
    },
    stop: () => server.stop(true),
  } as Stub;
}

function baseEnv(): Env {
  return {
    LLM_API_URL: "https://nao-usado.test/v1",
    LLM_API_KEY: "sk-base",
    LLM_API_MODEL: "modelo-base",
    DECISION_API_URL: "https://nao-usado.test/v1",
    DECISION_API_KEY: "sk-base",
    DECISION_API_MODEL: "systemone-latest",
    PORT: 3000,
    DATABASE_URL: ":memory:",
    LOG_LEVEL: "error",
    APP_ENV: "test",
    SESSION_SECRET: "x".repeat(32),
    GOODBIZZ_STUDIES_DIR: "estudo",
    GOODBIZZ_MOCK: false,
    GOODBIZZ_MOCK_LLM: false,
    GOODBIZZ_MOCK_DECIDER: false,
    GOODBIZZ_PRICE_LLM_INPUT_PER_MTOK: 0.14,
    GOODBIZZ_PRICE_LLM_CACHED_INPUT_PER_MTOK: 0.0028,
    GOODBIZZ_PRICE_LLM_OUTPUT_PER_MTOK: 0.28,
    GOODBIZZ_PRICE_DECIDER_INPUT_PER_MTOK: 0,
    GOODBIZZ_PRICE_DECIDER_OUTPUT_PER_MTOK: 0,
    GOODBIZZ_USD_BRL: 0,
  };
}

let handle: DatabaseHandle;

beforeEach(() => {
  handle = openMigratedDatabase(":memory:");
});

afterEach(() => {
  handle.sqlite.close();
});

describe("ProviderSettingsStore", () => {
  test("carrega do banco, aplica remendo e limpa com null", async () => {
    const store = new ProviderSettingsStore(new SqliteSettingsRepository(handle.db));
    expect(await store.load()).toEqual({});

    await store.patch({ llmModel: "ds/deepseek-v4-flash" });
    expect(store.current().llmModel).toBe("ds/deepseek-v4-flash");

    // Uma segunda instância lê o que ficou salvo (persistência de verdade).
    const reopened = new ProviderSettingsStore(new SqliteSettingsRepository(handle.db));
    expect((await reopened.load()).llmModel).toBe("ds/deepseek-v4-flash");

    await store.patch({ llmModel: null });
    expect(store.current()).toEqual({});
  });

  test("valor vazio não vira sobreposição", async () => {
    const store = new ProviderSettingsStore(new SqliteSettingsRepository(handle.db));
    await store.patch({ llmApiKey: "   ", deciderUrl: "http://decisor.test/v1" });
    expect(store.current().llmApiKey).toBeUndefined();
    expect(store.current().deciderUrl).toBe("http://decisor.test/v1");
  });
});

describe("sumUsage", () => {
  test("soma campos e trata ausente como zero", () => {
    expect(sumUsage({ calls: 1, inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 }, undefined)).toEqual(
      {
        calls: 1,
        inputTokens: 10,
        cachedInputTokens: 0,
        outputTokens: 5,
      },
    );
  });
});

describe("RoutingLlmClient", () => {
  test("usa a configuração resolvida, troca de cliente quando ela muda e soma o consumo", async () => {
    const first = stubLlm({ input: 100, output: 20 });
    const second = stubLlm({ input: 300, output: 60 });
    let config: ProviderConfig = { ...effectiveProviders(baseEnv(), {}), llmBaseUrl: first.url };
    const llm = new RoutingLlmClient({ resolve: () => config, mock: false });

    expect(await llm.generateText("s", "u")).toBe("texto do stub");
    expect(first.hits).toBe(1);
    expect(llm.usage()).toEqual({ calls: 1, inputTokens: 100, cachedInputTokens: 0, outputTokens: 20 });

    // A aba /settings aponta para outro endpoint: a próxima chamada já vai para o novo.
    config = { ...config, llmBaseUrl: second.url };
    expect(await llm.generateText("s", "u")).toBe("texto do stub");
    expect(second.hits).toBe(1);
    expect(first.hits).toBe(1);
    // O consumo do cliente aposentado continua contando.
    expect(llm.usage()).toEqual({ calls: 2, inputTokens: 400, cachedInputTokens: 0, outputTokens: 80 });

    first.stop();
    second.stop();
  });

  test("modo simulado ignora URL e chave", async () => {
    const llm = new RoutingLlmClient({
      resolve: () => ({ ...effectiveProviders(baseEnv(), {}), llmBaseUrl: "http://127.0.0.1:1/v1" }),
      mock: true,
    });
    expect(await llm.generateText("PALAVRA-CHAVE: IDEIAS", "nicho")).toContain("[");
    expect(llm.usage()?.calls).toBe(1);
  });
});

describe("RoutingDeciderClient", () => {
  test("usa o decisor HTTP resolvido e soma os tokens informados", async () => {
    const stub = stubDecider();
    const decider = new RoutingDeciderClient({
      resolve: () => ({ ...effectiveProviders(baseEnv(), {}), deciderUrl: stub.url }),
      mock: false,
    });

    const answers = await decider.ask("estado", { q1: { type: "noul", instructions: "?" } });
    expect(answers["q1"]).toEqual({ type: "noul", noul: 0.5 });
    expect(stub.hits).toBe(1);
    expect(decider.usage()).toEqual({ calls: 1, inputTokens: 40, cachedInputTokens: 0, outputTokens: 10 });
    stub.stop();
  });

  test("sem URL de decisor cai no modo simulado", async () => {
    const decider = new RoutingDeciderClient({
      resolve: () => ({ ...effectiveProviders(baseEnv(), {}), deciderUrl: "" }),
      mock: false,
    });
    const answers = await decider.ask("estado", { q1: { type: "noul", instructions: "?" } });
    expect(answers["q1"]).toBeDefined();
    expect(decider.usage().calls).toBe(1);
  });
});
