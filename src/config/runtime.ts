/**
 * Resolves the effective study configuration: environment defaults overridden by CLI flags
 * or API payload. Mirrors the validation rules of the Python baseline's Config.
 */
import { loadEnv } from "./env.ts";
import { ConfigError } from "../domain/errors.ts";
import type { Logger } from "../domain/ports.ts";
import type { PainMethod, StudyConfig } from "../domain/types.ts";
import pino from "pino";

/** Structured logger adapter used by the service and the CLI. */
export function createLogger(level?: string): Logger {
  const target = pino({ level: level ?? "info" });
  return {
    debug: (message, fields) => target.debug(fields ?? {}, message),
    info: (message, fields) => target.info(fields ?? {}, message),
    warn: (message, fields) => target.warn(fields ?? {}, message),
    error: (message, fields) => target.error(fields ?? {}, message),
  };
}

export interface StudyConfigOverrides {
  niche: string;
  city?: string;
  monthlyTicket?: number;
  numIdeas?: number;
  outputDir?: string;
  ideasFile?: string;
  evaluateOnly?: boolean;
  painMethod?: string;
  mock?: boolean;
  mockLlm?: boolean;
  mockDecider?: boolean;
  pdf?: boolean;
  paraphrases?: number;
  concurrency?: number;
  timeout?: number;
  llmBaseUrl?: string;
  llmModel?: string;
  llmKey?: string;
  deciderUrl?: string;
  deciderModel?: string;
  deciderKey?: string;
}

function normalizePainMethod(value: string): PainMethod {
  return value === "noul" ? "noul" : "choice";
}

/**
 * Build a validated study configuration.
 * @param overrides caller-supplied values; the environment fills the rest.
 */
export function resolveStudyConfig(overrides: StudyConfigOverrides): StudyConfig {
  const env = loadEnv();
  const niche = (overrides.niche ?? "").trim();
  if (!niche) {
    throw new ConfigError("please provide the niche (--niche)");
  }

  const mock = overrides.mock ?? false;
  const mockDecider = mock || (overrides.mockDecider ?? false);
  const mockLlm = mock || (overrides.mockLlm ?? false);

  const cfg: StudyConfig = {
    niche,
    city: (overrides.city ?? "").trim(),
    monthlyTicket: overrides.monthlyTicket ?? 300,
    numIdeas: overrides.numIdeas ?? 8,
    outputDir: overrides.outputDir ?? "estudo",
    ideasFile: overrides.ideasFile ?? "",
    evaluateOnly: overrides.evaluateOnly ?? false,
    painMethod: normalizePainMethod(overrides.painMethod ?? "choice"),
    mock,
    mockLlm,
    mockDecider,
    pdf: overrides.pdf ?? false,
    paraphrases: overrides.paraphrases ?? 3,
    concurrency: overrides.concurrency ?? 8,
    timeout: overrides.timeout ?? env.GOODBIZZ_LLM_TIMEOUT,
    llmBaseUrl: overrides.llmBaseUrl ?? env.LLM_API_URL,
    llmModel: overrides.llmModel ?? env.LLM_API_MODEL,
    llmKey: overrides.llmKey ?? env.LLM_API_KEY,
    deciderUrl: overrides.deciderUrl ?? env.DECISION_API_URL,
    deciderModel: overrides.deciderModel ?? env.DECISION_API_MODEL,
    deciderKey: overrides.deciderKey ?? env.DECISION_API_KEY,
  };

  if (!cfg.mockLlm && !cfg.llmKey) {
    throw new ConfigError("define the LLM API key (LLM_API_KEY or --llm-key) or use --mock");
  }
  if (!cfg.deciderUrl && !cfg.mockDecider) {
    throw new ConfigError("define the decider URL (DECISION_API_URL or --decider-url) or use --mock");
  }
  return cfg;
}

/**
 * Market context phrase used as the `state` of every decision question.
 * Kept byte-identical to the baseline só the decider sees the same prompt.
 */
export function studyContext(cfg: Pick<StudyConfig, "niche" | "city">): string {
  const targetCity = cfg.city ? ` Target city/region: ${cfg.city}.` : "";
  return (
    `Contexto do mercado: ${cfg.niche}.${targetCity} ` +
    "Donos operacionais, atendem no balcao, sem tempo, sem equipe de TI, " +
    "orcamento curto, o canal principal e o WhatsApp."
  );
}
