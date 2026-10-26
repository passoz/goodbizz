/**
 * Progresso em casos de borda (FR-001): passo tecnico sem numeracao nao quebra e passo antigo
 * [n/6] continua legivel com o rotulo equivalente.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Hono } from "hono";

import { StudyCache } from "../src/application/cache.ts";
import { ProviderSettingsStore } from "../src/application/settings.ts";
import { StudyService } from "../src/application/study-service.ts";
import { loadEnv, resetEnv } from "../src/config/env.ts";
import { createLogger, resolveStudyConfig } from "../src/config/runtime.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase, type DatabaseHandle } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { buildUiApp } from "../src/infrastructure/http/ui/routes.tsx";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SearchMock } from "../src/infrastructure/search-mock.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { SqliteSettingsRepository } from "../src/infrastructure/settings-repository.ts";

const savedEnv: Record<string, string | undefined> = {};

function withCredentials(): void {
  for (const [key, value] of [
    ["LLM_API_KEY", "test-llm-key"],
    ["DECISION_API_KEY", "test-decider-key"],
    ["DECISION_API_URL", "https://decider.invalid/v1"],
  ] as const) {
    if (!(key in savedEnv)) savedEnv[key] = Bun.env[key];
    Bun.env[key] = value;
  }
  resetEnv();
}

afterEach(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete Bun.env[key];
    else Bun.env[key] = value;
  }
  resetEnv();
});

let app: Hono;
let service: StudyService;
let repo: SqliteStudyRepository;
let close: () => void;

beforeEach(() => {
  withCredentials();
  const db: DatabaseHandle = openMigratedDatabase(":memory:");
  repo = new SqliteStudyRepository(db.db);
  const settings = new ProviderSettingsStore(new SqliteSettingsRepository(db.db));
  service = new StudyService({
    repo,
    cache: new StudyCache(new SqliteCacheStore(db.db)),
    llm: new LlmMock(),
    decider: new DeciderMock(),
    search: new SearchMock(),
    logger: createLogger("error"),
    artifactsRoot: "estudos-teste",
    settings,
  });
  app = buildUiApp({ service, sessionSecret: loadEnv().SESSION_SECRET, production: false });
  close = () => db.sqlite.close();
});

afterEach(() => {
  close();
});

describe("progresso em casos de borda", () => {
  test("FR-001: passo sem numeracao mostra o inicio sem quebrar", async () => {
    const study = await service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    await repo.update(study.id, {
      progress: { state: "running", step: "iniciando", error: null },
    });
    const body = await (await app.request(`/studies/${study.id}`)).text();
    expect(body).toContain("Iniciando o estudo");
  });
  test("FR-001: passo antigo [3/6] segue legivel", async () => {
    const study = await service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    await repo.update(study.id, {
      progress: { state: "running", step: "[3/6] avaliando as ideias", error: null },
    });
    const body = await (await app.request(`/studies/${study.id}`)).text();
    expect(body).toContain("avaliando as ideias");
    expect(body).toContain('id="progress-label"');
  });

  test("FR-001: passo [1/7] mostra a fase de pesquisa na web", async () => {
    const study = await service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    await repo.update(study.id, {
      progress: { state: "running", step: "[1/7] Pesquisando a web: 6 buscas", error: null },
    });
    const body = await (await app.request(`/studies/${study.id}`)).text();
    expect(body).toContain("Fase 1 de 7 — Pesquisa na web");
  });
});
