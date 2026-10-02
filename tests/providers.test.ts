/**
 * Configuração de provedores: precedência do perfil ativo sobre o ambiente, a visão sem segredo e
 * a máscara das chaves.
 */
import { describe, expect, test } from "bun:test";

import {
  activeProfile,
  effectiveProviders,
  envProviderDefaults,
  maskSecret,
  profileViews,
} from "../src/config/providers.ts";
import type { Env } from "../src/config/env.ts";
import type { ProviderProfile } from "../src/domain/types.ts";

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

function profile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    id: "p-llm",
    name: "Meu provedor",
    kind: "llm",
    url: "https://meu.test/v1",
    model: "meu-modelo",
    apiKey: "sk-meu-segredo-1234",
    ...overrides,
  };
}

describe("effectiveProviders", () => {
  test("sem perfil ativo, tudo vem do ambiente", () => {
    const config = effectiveProviders(env(), { profiles: [], activeLlm: null, activeDecider: null });
    expect(config.llmBaseUrl).toBe("https://env.test/v1");
    expect(config.llmApiKey).toBe("sk-do-ambiente");
    expect(config.deciderModel).toBe("systemone-latest");
  });

  test("o perfil ativo do LLM sobrepõe só os campos do LLM", () => {
    const config = effectiveProviders(env(), { profiles: [profile()], activeLlm: "p-llm" });
    expect(config.llmBaseUrl).toBe("https://meu.test/v1");
    expect(config.llmModel).toBe("meu-modelo");
    expect(config.llmApiKey).toBe("sk-meu-segredo-1234");
    // O decisor continua herdando.
    expect(config.deciderUrl).toBe("https://decisor.test/v1");
    expect(config.deciderModel).toBe("systemone-latest");
  });

  test("ativo que aponta para perfil inexistente volta ao ambiente", () => {
    const config = effectiveProviders(env(), { profiles: [profile()], activeLlm: "nao-existe" });
    expect(config.llmBaseUrl).toBe("https://env.test/v1");
  });

  test("perfil de um tipo não serve para o outro", () => {
    // Um perfil de decisor marcado como ativo do LLM não pode alimentar o LLM.
    const config = effectiveProviders(env(), {
      profiles: [profile({ id: "p-dec", kind: "decider" })],
      activeLlm: "p-dec",
    });
    expect(config.llmBaseUrl).toBe("https://env.test/v1");
  });

  test("perfil sem chave não herda a chave do ambiente", () => {
    // Quem escolheu um provedor sem chave não quer a credencial do ambiente indo para ele.
    const config = effectiveProviders(env(), {
      profiles: [profile({ apiKey: "" })],
      activeLlm: "p-llm",
    });
    expect(config.llmApiKey).toBe("");
  });
});

describe("activeProfile", () => {
  test("devolve o perfil do tipo pedido", () => {
    const settings = {
      profiles: [profile(), profile({ id: "p-dec", kind: "decider" as const })],
      activeDecider: "p-dec",
    };
    expect(activeProfile(settings, "decider")?.id).toBe("p-dec");
    expect(activeProfile(settings, "llm")).toBeNull();
  });
});

describe("profileViews", () => {
  test("mascara a chave e diz se existe", () => {
    const [view] = profileViews({ profiles: [profile({ apiKey: "sk-teste-1234" })] });
    expect(view?.apiKey).toBe("sk-…1234");
    expect(view?.hasKey).toBe(true);
    // A chave em claro não aparece em lugar nenhum da visão.
    expect(JSON.stringify(view)).not.toContain("sk-teste-1234");
  });
});

describe("envProviderDefaults", () => {
  test("descreve o que o ambiente oferece", () => {
    const defaults = envProviderDefaults(env());
    expect(defaults.llm.url).toBe("https://env.test/v1");
    expect(defaults.llm.model).toBe("modelo-do-ambiente");
    expect(defaults.llm.hasKey).toBe(true);
  });

  test("ambiente sem chave aparece como sem chave", () => {
    const defaults = envProviderDefaults(env({ DECISION_API_KEY: "" }));
    expect(defaults.decider.hasKey).toBe(false);
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
