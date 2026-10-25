/**
 * Pagina do estudo com evidencias (FR-011): o detalhe traz evidenceCount, mostra a contagem e o
 * consumo de busca, e avisa pesquisa fraca com Executar de novo quando ha menos de 5 evidencias.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Hono } from "hono";

import { StudyCache } from "../src/application/cache.ts";
import { ProviderSettingsStore } from "../src/application/settings.ts";
import { StudyService } from "../src/application/study-service.ts";
import { buildApiApp } from "../src/infrastructure/http/api.ts";
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

interface Harness {
  app: Hono;
  service: StudyService;
  repo: SqliteStudyRepository;
  close: () => void;
}

function makeApiHarness(): Harness & { api: Hono } {
  const db: DatabaseHandle = openMigratedDatabase(":memory:");
  const repo = new SqliteStudyRepository(db.db);
  const settings = new ProviderSettingsStore(new SqliteSettingsRepository(db.db));
  const service = new StudyService({
    repo,
    cache: new StudyCache(new SqliteCacheStore(db.db)),
    llm: new LlmMock(),
    decider: new DeciderMock(),
    search: new SearchMock(),
    logger: createLogger("error"),
    artifactsRoot: "estudos-teste",
    settings,
  });
  const api = buildApiApp({
    service,
    providerStatus: () => ({ llm: false, decider: false, mockByDefault: true }),
  });
  const app = buildUiApp({ service, sessionSecret: loadEnv().SESSION_SECRET, production: false });
  return { app, api, service, repo, close: () => db.sqlite.close() };
}

function evidence(id: number): Evidence {
  return {
    id: `E${id}`,
    tipo: "preco",
    afirmacao: `afirmacao ${id}`,
    trecho: `trecho literal ${id}`,
    url: `https://fonte.test/${id}`,
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

let harness: Harness & { api: Hono };

beforeEach(() => {
  harness = makeApiHarness();
});

afterEach(() => {
  harness.close();
});

describe("evidencias na pagina do estudo", () => {
  test("FR-011: a API conta as evidencias e o estudo antigo volta com zero", async () => {
    const weak = await harness.service.create(resolveStudyConfig({ niche: "padarias fracas", mock: true }));
    await harness.repo.update(weak.id, {
      evidences: [evidence(1), evidence(2)],
      usage: {
        llm: { calls: 2, inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 },
        decider: { calls: 4, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
        search: { calls: 8, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      },
    });

    const response = await harness.api.request(`/studies/${weak.id}`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { evidenceCount: number; usage: { search: { calls: number } } };
    expect(body.evidenceCount).toBe(2);

    const old = await harness.service.create(resolveStudyConfig({ niche: "padarias antigas", mock: true }));
    await harness.repo.update(old.id, { evidences: [] });
    const oldResponse = await harness.api.request(`/studies/${old.id}`);
    const oldBody = (await oldResponse.json()) as { evidenceCount: number };
    expect(oldBody.evidenceCount).toBe(0);
  });

  test("FR-011: estudo com 2 evidencias mostra o aviso e o Executar de novo", async () => {
    const study = await harness.service.create(resolveStudyConfig({ niche: "padarias fracas", mock: true }));
    await harness.repo.update(study.id, {
      evidences: [evidence(1), evidence(2)],
      evaluations: [],
      summary: summary(),
      usage: {
        llm: { calls: 2, inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 },
        decider: { calls: 4, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
        search: { calls: 8, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      },
    });
    const body = await (await harness.app.request(`/studies/${study.id}`)).text();
    expect(body).toContain('id="evidence-panel"');
    expect(body).toContain("2 evidências");
    expect(body).toContain("8 buscas");
    expect(body).toContain("pesquisa fraca");
    expect(body).toContain("Executar de novo");
  });

  test("FR-011: estudo com 5 ou mais nao avisa e estudo sem evidencias mostra zero", async () => {
    const strong = await harness.service.create(resolveStudyConfig({ niche: "padarias fortes", mock: true }));
    await harness.repo.update(strong.id, {
      evidences: [evidence(1), evidence(2), evidence(3), evidence(4), evidence(5)],
      summary: summary(),
    });
    const strongBody = await (await harness.app.request(`/studies/${strong.id}`)).text();
    expect(strongBody).toContain("5 evidências");
    expect(strongBody).not.toContain("pesquisa fraca");

    const empty = await harness.service.create(resolveStudyConfig({ niche: "padarias vazias", mock: true }));
    await harness.repo.update(empty.id, { evidences: [], summary: summary() });
    const emptyBody = await (await harness.app.request(`/studies/${empty.id}`)).text();
    expect(emptyBody).toContain("0 evidências");
    expect(emptyBody).toContain("pesquisa fraca");
  });
});
