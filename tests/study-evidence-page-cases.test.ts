/**
 * Pagina do estudo com poucas e muitas evidencias (FR-011): o aviso aparece abaixo de 5 e some
 * com 5 ou mais; a contagem acompanha o que o repositorio guardou.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Hono } from "hono";

import { StudyCache } from "../src/application/cache.ts";
import { ProviderSettingsStore } from "../src/application/settings.ts";
import { StudyService } from "../src/application/study-service.ts";
import { loadEnv, resetEnv } from "../src/config/env.ts";
import { createLogger, resolveStudyConfig } from "../src/config/runtime.ts";
import type { Evidence, StudySummary } from "../src/domain/types.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase, type DatabaseHandle } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { buildUiApp } from "../src/infrastructure/http/ui/routes.tsx";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SearchMock } from "../src/infrastructure/search-mock.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { SqliteSettingsRepository } from "../src/infrastructure/settings-repository.ts";

const savedEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const key of ["LLM_API_KEY", "DECISION_API_KEY", "DECISION_API_URL"]) {
    savedEnv[key] = Bun.env[key];
  }
  Bun.env.LLM_API_KEY = "chave-de-teste";
  Bun.env.DECISION_API_KEY = "chave-de-teste";
  Bun.env.DECISION_API_URL = "https://decisor.teste";
  resetEnv();
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete Bun.env[key];
    else Bun.env[key] = value;
  }
  resetEnv();
});

function evidence(id: number): Evidence {
  return {
    id: `E${id}`,
    tipo: "concorrente",
    afirmacao: `afirmacao ${id}`,
    trecho: `trecho literal ${id}`,
    url: `https://caso.test/${id}`,
    valor: null,
    unidade: "",
    ideia: "",
  };
}

function summary(): StudySummary {
  return {
    ordered: [],
    painGroups: { forte: [], mista: [], fraca: [] },
    means: { fit: 0, sale: 0, disruption: 0, solo: 0, wtp: 0, meta30: 0 },
    tiers: { A: [], B: [], C: [] },
    attack: [],
    review: [],
  };
}

let app: Hono;
let service: StudyService;
let repo: SqliteStudyRepository;
let close: () => void;

beforeEach(() => {
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

describe("evidencias em casos de borda", () => {
  test("FR-011: 4 evidencias ainda avisam e 6 nao avisam", async () => {
    const weak = await service.create(resolveStudyConfig({ niche: "padarias quase", mock: true }));
    await repo.update(weak.id, { evidences: [evidence(1), evidence(2), evidence(3), evidence(4)], summary: summary() });
    const weakBody = await (await app.request(`/studies/${weak.id}`)).text();
    expect(weakBody).toContain("4 evidências");
    expect(weakBody).toContain("pesquisa fraca");

    const strong = await service.create(resolveStudyConfig({ niche: "padarias fartas", mock: true }));
    await repo.update(strong.id, {
      evidences: [evidence(1), evidence(2), evidence(3), evidence(4), evidence(5), evidence(6)],
      summary: summary(),
    });
    const strongBody = await (await app.request(`/studies/${strong.id}`)).text();
    expect(strongBody).toContain("6 evidências");
    expect(strongBody).not.toContain("pesquisa fraca");
  });

  test("FR-011: evidencia de ideia conta no total do estudo", async () => {
    const study = await service.create(resolveStudyConfig({ niche: "padarias mistas", mock: true }));
    const fromIdea: Evidence = { ...evidence(3), ideia: "Triagem de WhatsApp" };
    await repo.update(study.id, { evidences: [evidence(1), evidence(2), fromIdea], summary: summary() });
    const body = await (await app.request(`/studies/${study.id}`)).text();
    expect(body).toContain("3 evidências");
  });
});
