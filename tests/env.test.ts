import { afterEach, describe, expect, test } from "bun:test";

import { ConfigError } from "../src/domain/errors.ts";
import { loadEnv, resetEnv } from "../src/config/env.ts";
import { createLogger, resolveStudyConfig, studyContext } from "../src/config/runtime.ts";

const TOUCHED = [
  "PORT",
  "LOG_LEVEL",
  "LLM_API_KEY",
  "DECISION_API_URL",
  "SESSION_SECRET",
  "GOODBIZZ_MOCK",
  "GOODBIZZ_MOCK_LLM",
  "GOODBIZZ_MOCK_DECIDER",
] as const;

const saved = new Map<string, string | undefined>();
const remember = () => {
  for (const key of TOUCHED) if (!saved.has(key)) saved.set(key, Bun.env[key]);
};

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete Bun.env[key];
    else Bun.env[key] = value;
  }
  saved.clear();
  resetEnv();
});

describe("environment validation", () => {
  test("applies documented defaults", () => {
    remember();
    resetEnv();
    const env = loadEnv();
    expect(env.PORT).toBe(3000);
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.LLM_API_URL).toBe("https://api.openai.com/v1");
    expect(env.LLM_API_MODEL).toBe("gpt-4o-mini");
    expect(env.DECISION_API_MODEL).toBe("systemone-latest");
    expect(env.GOODBIZZ_MOCK).toBe(false);
    // 60 s cortava as gerações longas de `deepseek-flash` (um plano passa de 20 mil tokens de saída).
    expect(env.GOODBIZZ_LLM_TIMEOUT).toBe(300);
  });

  test("o limite por chamada de IA é configurável", () => {
    remember();
    Bun.env.GOODBIZZ_LLM_TIMEOUT = "45";
    resetEnv();
    expect(loadEnv().GOODBIZZ_LLM_TIMEOUT).toBe(45);
  });

  test("reads overrides from the process environment", () => {
    remember();
    Bun.env.PORT = "4321";
    Bun.env.LOG_LEVEL = "debug";
    Bun.env.GOODBIZZ_MOCK = "1";
    resetEnv();
    const env = loadEnv();
    expect(env.PORT).toBe(4321);
    expect(env.LOG_LEVEL).toBe("debug");
    expect(env.GOODBIZZ_MOCK).toBe(true);
  });

  test("supports mock per provider, so one provider can stay real", () => {
    remember();
    resetEnv();
    const defaults = loadEnv();
    expect(defaults.GOODBIZZ_MOCK_LLM).toBe(false);
    expect(defaults.GOODBIZZ_MOCK_DECIDER).toBe(false);

    Bun.env.GOODBIZZ_MOCK_DECIDER = "1";
    resetEnv();
    const mixed = loadEnv();
    expect(mixed.GOODBIZZ_MOCK_DECIDER).toBe(true);
    expect(mixed.GOODBIZZ_MOCK_LLM).toBe(false);
    expect(mixed.GOODBIZZ_MOCK).toBe(false);
  });

  test("fails fast with a ConfigError on an invalid value", () => {
    remember();
    Bun.env.PORT = "not-a-port";
    resetEnv();
    expect(() => loadEnv()).toThrow(ConfigError);
  });
});

describe("study configuration", () => {
  test("requires a niche", () => {
    remember();
    resetEnv();
    expect(() => resolveStudyConfig({ niche: "   " })).toThrow(ConfigError);
  });

  test("requires provider credentials unless mocked", () => {
    remember();
    Bun.env.LLM_API_KEY = "";
    Bun.env.DECISION_API_URL = "";
    resetEnv();
    expect(() => resolveStudyConfig({ niche: "oficinas" })).toThrow(ConfigError);

    const mocked = resolveStudyConfig({ niche: "oficinas", mock: true });
    expect(mocked.mockLlm).toBe(true);
    expect(mocked.mockDecider).toBe(true);
  });

  test("normalises pain method and trims text fields", () => {
    const cfg = resolveStudyConfig({
      niche: "  clinicas  ",
      city: "  Regiao dos Lagos  ",
      painMethod: "escolha",
      mock: true,
    });
    expect(cfg.niche).toBe("clinicas");
    expect(cfg.city).toBe("Regiao dos Lagos");
    expect(cfg.painMethod).toBe("choice");

    const legacy = resolveStudyConfig({ niche: "x", painMethod: "noul", mock: true });
    expect(legacy.painMethod).toBe("noul");
  });

  test("builds the baseline market context phrase", () => {
    expect(studyContext({ niche: "pousadas", city: "" })).toBe(
      "Contexto do mercado: pousadas. Donos operacionais, atendem no balcao, sem tempo, " +
        "sem equipe de TI, orcamento curto, o canal principal e o WhatsApp.",
    );
    expect(studyContext({ niche: "pousadas", city: "Paraty" })).toContain("Target city/region: Paraty.");
  });
});

describe("logger adapter", () => {
  test("forwards every level to the structured logger", () => {
    const logger = createLogger("error");
    expect(() => {
      logger.debug("d", { a: 1 });
      logger.info("i");
      logger.warn("w", { b: 2 });
      logger.error("e");
    }).not.toThrow();
  });
});
