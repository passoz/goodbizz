import { describe, expect, test } from "bun:test";
import { StudyCache } from "../src/application/cache.ts";
import { StudyService } from "../src/application/study-service.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { loadEnv } from "../src/config/env.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { Hono } from "hono";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { SearchMock } from "../src/infrastructure/search-mock.ts";
import { buildApiApp } from "../src/infrastructure/http/api.ts";
import { buildUiApp } from "../src/infrastructure/http/ui/routes.tsx";
import { silentLogger, tempDir } from "./helpers.ts";

function harness() {
  const db = openMigratedDatabase(":memory:");
  const service = new StudyService({
    repo: new SqliteStudyRepository(db.db),
    cache: new StudyCache(new SqliteCacheStore(db.db)),
    llm: new LlmMock(),
    decider: new DeciderMock(),
    search: new SearchMock(),
    logger: silentLogger(),
    artifactsRoot: tempDir("goodbizz-value-ranking-"),
  });
  const api = new Hono();
  api.route(
    "/api",
    buildApiApp({
      service,
      providerStatus: () => ({ llm: false, decider: false, mockByDefault: true }),
    }),
  );
  const ui = buildUiApp({ service, sessionSecret: loadEnv().SESSION_SECRET, production: false });
  return { api, ui, service, db };
}

/**
 * Casos da task 1.12 (FR-009): a API devolve perda e payback por ideia
 * e o ranking mostra as duas colunas.
 */
describe("FR-009: casos do valor na API e no ranking", () => {
  test("a avaliação da API traz value com perda e payback", async () => {
    const { api, service, db } = harness();
    const record = await service.create(resolveStudyConfig({ niche: "cafés de bairro", mock: true }));
    await service.run(record.id);
    const detail = await api.request(`/api/studies/${record.id}`);
    expect(detail.status).toBe(200);
    const body = (await detail.json()) as {
      evaluations: Array<{ name: string; value?: { loss: number; paybackMonths: number | null } }>;
    };
    expect(body.evaluations.length).toBeGreaterThan(0);
    const first = body.evaluations[0];
    expect(first?.value?.loss).toBeGreaterThan(0);
    expect(first).toHaveProperty("index");
    db.sqlite.close();
  });

  test("o ranking mostra perda mensal e payback por ideia", async () => {
    const { ui, service, db } = harness();
    const record = await service.create(resolveStudyConfig({ niche: "cafés de bairro", mock: true }));
    await service.run(record.id);
    const page = await (await ui.request(`/studies/${record.id}`)).text();
    expect(page).toContain("Perda");
    expect(page).toContain("Payback");
    db.sqlite.close();
  });
});
