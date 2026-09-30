/**
 * Configuração de provedores: precedência (settings sobre ambiente), origem de cada campo e máscara.
 */
import { describe, expect, test } from "bun:test";

import {
  effectiveProviders,
  maskSecret,
  providerSettingsView,
  providerSources,
} from "../src/config/providers.ts";
import type { Env } from "../src/config/env.ts";

function env(overrides: Partial<Env> = {}): Env {
  return {
    LLM_API_URL: "https://env.test/v1",
    LLM_API_KEY: "sk-do-ambiente",
    LLM_API_MODEL: "modelo-do-ambiente",
    DECISION_API_URL: "https://decisor.test/v1",
    DECISION_API_KEY: "chave-do-decisor",
    DECISION_API_MODEL: "systemone-latest",
    PORT: 3000,
    DATABASE_URL: "app.db",
    LOG_LEVEL: "info",
    APP_ENV: "test",
    SESSION_SECRET: "x".repeat(32),
    GOODBIZZ_STUDIES_DIR: "estudo",
    GOODBIZZ_MOCK: false,
    GOODBIZZ_MOCK_LLM: false,
    GOODBIZZ_MOCK_DECIDER: false,
    GOODBIZZ_LLM_TIMEOUT: 300,
    GOODBIZZ_PRICE_LLM_INPUT_PER_MTOK: 0.15,
    GOODBIZZ_PRICE_LLM_CACHED_INPUT_PER_MTOK: 0.003,
    GOODBIZZ_PRICE_LLM_OUTPUT_PER_MTOK: 0.6,
    GOODBIZZ_PRICE_DECIDER_INPUT_PER_MTOK: 0.042,
    GOODBIZZ_PRICE_DECIDER_OUTPUT_PER_MTOK: 0,
    GOODBIZZ_USD_BRL: 0,
    ...overrides,
  };
}

describe("effectiveProviders", () => {
  test("sem nada salvo, tudo vem do ambiente", () => {
    const config = effectiveProviders(env(), {});
    expect(config.llmBaseUrl).toBe("https://env.test/v1");
    expect(config.llmApiKey).toBe("sk-do-ambiente");
    expect(config.deciderModel).toBe("systemone-latest");
  });

  test("o que está salvo sobrepõe o ambiente, campo a campo", () => {
    const config = effectiveProviders(env(), {
      llmBaseUrl: "http://9router.9router.svc.cluster.local:20128/v1",
      llmModel: "ds/deepseek-v4-flash",
    });
    expect(config.llmBaseUrl).toBe("http://9router.9router.svc.cluster.local:20128/v1");
    expect(config.llmModel).toBe("ds/deepseek-v4-flash");
    // O que não foi salvo continua herdando.
    expect(config.llmApiKey).toBe("sk-do-ambiente");
    expect(config.deciderUrl).toBe("https://decisor.test/v1");
  });

  test("string vazia ou só espaço não sobrescreve nada", () => {
    const config = effectiveProviders(env(), { llmModel: "   ", deciderUrl: "" });
    expect(config.llmModel).toBe("modelo-do-ambiente");
    expect(config.deciderUrl).toBe("https://decisor.test/v1");
  });
});

describe("providerSources", () => {
  test("marca a origem de cada campo", () => {
    const sources = providerSources(env(), { llmModel: "outro-modelo" });
    expect(sources.llmModel).toBe("settings");
    expect(sources.llmBaseUrl).toBe("env");
    expect(sources.deciderModel).toBe("env");
  });

  test("campo sem valor em lugar nenhum é vazio", () => {
    const sources = providerSources(env({ DECISION_API_URL: "", LLM_API_KEY: "" }), {});
    expect(sources.deciderUrl).toBe("vazio");
    expect(sources.llmApiKey).toBe("vazio");
  });
});

describe("maskSecret", () => {
  test("mostra começo e fim de chaves longas", () => {
    expect(maskSecret("sk-teste-abcdef")).toBe("sk-…cdef");
  });

  test("esconde chaves curtas por inteiro e mantém vazio", () => {
    expect(maskSecret("123456")).toBe("••••••");
    expect(maskSecret("   ")).toBe("");
  });
});

describe("providerSettingsView", () => {
  test("mascara só os segredos e diz de onde vem cada campo", () => {
    const rows = providerSettingsView(env(), { llmApiKey: "sk-teste-1234" });
    const byKey = Object.fromEntries(rows.map((row) => [row.key, row]));

    expect(byKey["llmApiKey"]?.source).toBe("settings");
    expect(byKey["llmApiKey"]?.value).toBe("sk-…1234");
    expect(byKey["llmApiKey"]?.secret).toBe(true);
    expect(byKey["llmBaseUrl"]?.value).toBe("https://env.test/v1");
    expect(byKey["llmBaseUrl"]?.secret).toBe(false);
    // A chave em claro não aparece em lugar nenhum da visão.
    expect(JSON.stringify(rows)).not.toContain("sk-teste-1234");
  });
});
