import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { StudyCache } from "../src/application/cache.ts";
import { StudyService } from "../src/application/study-service.ts";
import { loadEnv } from "../src/config/env.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { SearchMock } from "../src/infrastructure/search-mock.ts";
import { buildApiApp } from "../src/infrastructure/http/api.ts";
import { buildUiApp } from "../src/infrastructure/http/ui/routes.tsx";
import { silentLogger, tempDir } from "./helpers.ts";

/**
 * Aceitação da task 1.12 (FR-009): a API devolve perda e payback por ideia
 * e o ranking mostra as duas colunas.
 */
describe("FR-009: aceitação do valor na API e no ranking", () => {
  test("a API devolve perda e payback por ideia e o ranking mostra as duas colunas", async () => {
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
    const record = await service.create(resolveStudyConfig({ niche: "cafés de bairro", mock: true }));
    await service.run(record.id);
    const detail = await api.request(`/api/studies/${record.id}`);
    const body = (await detail.json()) as {
      evaluations: Array<{ value?: { loss: number; paybackMonths: number | null } }>;
    };
    expect(body.evaluations[0]?.value?.loss).toBeGreaterThan(0);
    const page = await (await ui.request(`/studies/${record.id}`)).text();
    expect(page).toContain("Perda");
    expect(page).toContain("Payback");
    db.sqlite.close();
  });
});
