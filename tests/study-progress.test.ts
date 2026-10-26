/**
 * Progresso em 7 fases com a pesquisa na web (FR-001): a fase 1 e a pesquisa, no estudo novo e na
 * reexecucao; passos antigos [n/6] seguem legiveis.
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

describe("progresso da pesquisa", () => {
  test("FR-001: a fase 1 de 7 e a pesquisa na web", async () => {
    const study = await service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    await repo.update(study.id, {
      progress: { state: "running", step: "[1/7] Pesquisando a web: 6 buscas", error: null },
    });
    const body = await (await app.request(`/studies/${study.id}`)).text();
    expect(body).toContain("Fase 1 de 7 — Pesquisa na web");
    expect(body).toContain("Pesquisando a web: 6 buscas");
  });

  test("FR-001: a fase do brief e a 2 de 7 e a contagem tem 7 fases", async () => {
    const study = await service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    await repo.update(study.id, {
      progress: { state: "running", step: "[2/7] Lendo o nicho e escrevendo o brief", error: null },
    });
    const body = await (await app.request(`/studies/${study.id}`)).text();
    expect(body).toContain("Fase 2 de 7");
    const list = body.match(/<ol class="progress-steps" id="progress-steps">[\s\S]*?<\/ol>/)?.[0] ?? "";
    const steps = list.match(/<li /g) ?? [];
    expect(steps).toHaveLength(7);
  });

  test("FR-001: estudo novo abre na fase de pesquisa", async () => {
    const study = await service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    await repo.update(study.id, {
      progress: { state: "running", step: "[1/7] Pesquisando a web: 8 buscas e 10 evidências", error: null },
    });
    const failover = await service.create(resolveStudyConfig({ niche: "padarias", mock: true }));
    await repo.update(failover.id, {
      progress: { state: "running", step: "[7/7] Montando os artefatos do estudo", error: null },
    });
    const fresh = await (await app.request(`/studies/${study.id}`)).text();
    expect(fresh).toContain("Fase 1 de 7 — Pesquisa na web");
    const last = await (await app.request(`/studies/${failover.id}`)).text();
    expect(last).toContain("Fase 7 de 7");
  });
});
