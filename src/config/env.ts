/**
 * Environment contract. Validated once at startup; the process fails fast on a bad value.
 * Secrets live only in the environment — never in code, logs or responses.
 */
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

import { ConfigError } from "../domain/errors.ts";
import { redactSecrets } from "./redact.ts";

function booleanFlag(defaultValue: "0" | "1" = "0") {
  return z
    .enum(["0", "1", "true", "false"])
    .default(defaultValue)
    .transform((value) => value === "1" || value === "true");
}

/** Validated environment shape. */
export interface Env {
  LLM_API_URL: string;
  LLM_API_KEY: string;
  LLM_API_MODEL: string;
  DECISION_API_URL: string;
  DECISION_API_KEY: string;
  DECISION_API_MODEL: string;
  PORT: number;
  DATABASE_URL: string;
  LOG_LEVEL: "debug" | "info" | "warn" | "error";
  APP_ENV: "development" | "production" | "test";
  SESSION_SECRET: string;
  GOODBIZZ_STUDIES_DIR: string;
  GOODBIZZ_MOCK: boolean;
  GOODBIZZ_MOCK_LLM: boolean;
  GOODBIZZ_MOCK_DECIDER: boolean;
}

function buildEnv() {
  return createEnv({
    server: {
      LLM_API_URL: z.string().min(1).default("https://api.openai.com/v1"),
      LLM_API_KEY: z.string().default(""),
      LLM_API_MODEL: z.string().min(1).default("gpt-4o-mini"),

      DECISION_API_URL: z.string().default(""),
      DECISION_API_KEY: z.string().default(""),
      DECISION_API_MODEL: z.string().min(1).default("systemone-latest"),

      PORT: z.coerce.number().int().positive().default(3000),
      DATABASE_URL: z.string().min(1).default("app.db"),
      LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
      APP_ENV: z.enum(["development", "production", "test"]).default("development"),
      SESSION_SECRET: z.string().min(32).default("dev-only-session-secret-change-me-32b"),

      GOODBIZZ_STUDIES_DIR: z.string().min(1).default("estudo"),
      GOODBIZZ_MOCK: booleanFlag("0"),
      /** Simula apenas o LLM (texto sintético) mantendo o decisor real. */
      GOODBIZZ_MOCK_LLM: booleanFlag("0"),
      /** Simula apenas o decisor (números deterministicos) mantendo o LLM real. */
      GOODBIZZ_MOCK_DECIDER: booleanFlag("0"),
    },
    runtimeEnv: Bun.env,
    emptyStringAsUndefined: true,
    onValidationError: (issues) => {
      const summary = issues
        .map((issue) => (issue.path ? `${String(issue.path)}: ${issue.message}` : issue.message))
        .join("; ");
      throw new ConfigError(`invalid environment: ${redactSecrets(summary)}`);
    },
  });
}

let cached: Env | undefined;

/** Validate and memoize the environment. Throws ConfigError on any invalid value. */
export function loadEnv(): Env {
  if (cached) return cached;
  cached = buildEnv() satisfies Env;
  return cached;
}

/** Test seam: drop the memoized environment. */
export function resetEnv(): void {
  cached = undefined;
}
