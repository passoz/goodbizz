import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { StudyService } from "../src/application/study-service.ts";
import { silentLogger } from "./helpers.ts";
import { buildApiApp } from "../src/infrastructure/http/api.ts";
import { buildUiApp } from "../src/infrastructure/http/ui/routes.tsx";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { SearchMock } from "../src/infrastructure/search-mock.ts";
import { StudyCache } from "../src/application/cache.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { loadEnv } from "../src/config/env.ts";

function harness() {
  const handle = openMigratedDatabase(":memory:");
  const service = new StudyService(
    new SqliteStudyRepository(handle.db),
    {
      llm: new LlmMock(),
      decider: new DeciderMock(),
      search: new SearchMock(),
      cache: new StudyCache(new SqliteCacheStore(handle.db)),
      logger: silentLogger(),
    },
    { outputDir: "", artifacts: false },
  );
  const api = new Hono();
  api.route(
    "/api",
    buildApiApp({
      service,
      providerStatus: () => ({ llm: false, decider: false, mockByDefault: true }),
    }),
  );
  const ui = buildUiApp({ service, sessionSecret: loadEnv().SESSION_SECRET, production: false });
  return { api, ui, handle };
}

/**
 * Aceitação da task 1.9 (FR-008 na API e no formulário): a API grava e devolve
 * o setup, recusa fora da faixa com 422 e o formulário mostra o campo.
 */
describe("FR-008: aceitação do setupFee na API e no formulário", () => {
  test("a API grava e devolve o setup, recusa fora da faixa com 422 e o formulário mostra o campo", async () => {
    const { api, ui, handle } = harness();
    const created = await api.request("/api/studies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: "cafés de bairro", mock: true, setupFee: 1800 }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string; setupFee?: number };
    expect(body.setupFee).toBe(1800);

    const bad = await api.request("/api/studies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: "cafés de bairro", mock: true, setupFee: -1 }),
    });
    expect(bad.status).toBe(422);

    const form = await (await ui.request("/new")).text();
    expect(form).toContain('name="setupFee"');
    expect(form).toContain('value="1500"');
    handle.sqlite.close();
  });
});
