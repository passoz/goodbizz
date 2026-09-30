/**
 * Regressão do limite por chamada de IA na execução de um estudo.
 *
 * O serviço criava a configuração com `timeout: this.options.timeout ?? 60`. Como o literal nunca
 * é `undefined`, o fallback `overrides.timeout ?? env.GOODBIZZ_LLM_TIMEOUT` de `resolveStudyConfig`
 * nunca rodava e todo estudo nascia com 60 s por chamada, ignorando `GOODBIZZ_LLM_TIMEOUT`. Em
 * produção isso cortava documentos de 20 mil tokens do `deepseek-flash` e do tier gratuito do
 * tokenharbor (27,6 tok/s medidos), com 3 tentativas de 60 s = 184,5 s e falha garantida.
 */
import { afterEach, describe, expect, test } from "bun:test";

import { StudyCache } from "../src/application/cache.ts";
import { StudyService } from "../src/application/study-service.ts";
import { loadEnv, resetEnv } from "../src/config/env.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import type { StudyConfig } from "../src/domain/types.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { silentLogger, tempDir } from "./helpers.ts";

const saved = new Map<string, string | undefined>();

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete Bun.env[key];
    else Bun.env[key] = value;
  }
  saved.clear();
  resetEnv();
});

/**
 * `executeRun` reconstroi a configuracao a partir do registro, que nao guarda chave nem URL: em
 * producao essas credenciais vem do ambiente. O teste reproduz isso em vez de injetar no registro.
 */
function withCredentials(): void {
  for (const [key, value] of [
    ["LLM_API_KEY", "test-llm-key"],
    ["DECISION_API_KEY", "test-decider-key"],
    ["DECISION_API_URL", "https://decider.invalid/v1"],
  ] as const) {
    if (!saved.has(key)) saved.set(key, Bun.env[key]);
    Bun.env[key] = value;
  }
  resetEnv();
}

/** Roda um estudo com os mocks deterministicos e devolve a config que os clientes receberam. */
async function captureRunConfig(): Promise<StudyConfig> {
  withCredentials();
  const db = openMigratedDatabase(":memory:");
  const captured: StudyConfig[] = [];
  const service = new StudyService({
    repo: new SqliteStudyRepository(db.db),
    cache: new StudyCache(new SqliteCacheStore(db.db)),
    llm: new LlmMock(),
    decider: new DeciderMock(),
    logger: silentLogger(),
    artifactsRoot: tempDir("goodbizz-timeout-"),
    clientsFor: (cfg) => {
      captured.push(cfg);
      return { llm: new LlmMock(), decider: new DeciderMock() };
    },
  });
  const record = await service.create(resolveStudyConfig({ niche: "clinicas", numIdeas: 2 }));
  await service.run(record.id);
  db.sqlite.close();
  return captured[0]!;
}

describe("limite por chamada de IA na execução do estudo", () => {
  test("herda GOODBIZZ_LLM_TIMEOUT quando o serviço não define timeout", async () => {
    saved.set("GOODBIZZ_LLM_TIMEOUT", Bun.env.GOODBIZZ_LLM_TIMEOUT);
    Bun.env.GOODBIZZ_LLM_TIMEOUT = "1200";
    resetEnv();

    const cfg = await captureRunConfig();

    expect(cfg.timeout).toBe(1200);
    // O valor fixo que causava o corte: 60 s por chamada.
    expect(cfg.timeout).not.toBe(60);
    expect(cfg.timeout).toBe(loadEnv().GOODBIZZ_LLM_TIMEOUT);
  });

  test("usa o default do ambiente quando a variável não está definida", async () => {
    saved.set("GOODBIZZ_LLM_TIMEOUT", Bun.env.GOODBIZZ_LLM_TIMEOUT);
    delete Bun.env.GOODBIZZ_LLM_TIMEOUT;
    resetEnv();

    const cfg = await captureRunConfig();

    expect(cfg.timeout).toBe(300);
    expect(cfg.timeout).not.toBe(60);
  });

  test("o timeout do serviço tem precedência sobre o ambiente", async () => {
    saved.set("GOODBIZZ_LLM_TIMEOUT", Bun.env.GOODBIZZ_LLM_TIMEOUT);
    Bun.env.GOODBIZZ_LLM_TIMEOUT = "1200";
    resetEnv();

    withCredentials();
    const db = openMigratedDatabase(":memory:");
    const captured: StudyConfig[] = [];
    const service = new StudyService({
      repo: new SqliteStudyRepository(db.db),
      cache: new StudyCache(new SqliteCacheStore(db.db)),
      llm: new LlmMock(),
      decider: new DeciderMock(),
      logger: silentLogger(),
      artifactsRoot: tempDir("goodbizz-timeout-"),
      timeout: 900,
      clientsFor: (cfg) => {
        captured.push(cfg);
        return { llm: new LlmMock(), decider: new DeciderMock() };
      },
    });
    const record = await service.create(resolveStudyConfig({ niche: "clinicas", numIdeas: 2 }));
    await service.run(record.id);
    db.sqlite.close();

    expect(captured[0]!.timeout).toBe(900);
  });
});
