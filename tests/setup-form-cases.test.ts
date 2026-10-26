import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { StudyService } from "../src/application/study-service.ts";
import { silentLogger } from "./helpers.ts";
import { buildApiApp } from "../src/infrastructure/http/api.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { SearchMock } from "../src/infrastructure/search-mock.ts";
import { StudyCache } from "../src/application/cache.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";

function app() {
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
  api.route("/api", buildApiApp({ service, providerStatus: () => ({ llm: false, decider: false, mockByDefault: true }) }));
  return { api, handle };
}

/**
 * Casos da task 1.9 (FR-008 na API): setupFee grava e devolve, fora da faixa dá 422.
 * RED: sem o campo a criação com setup 1800 não grava o valor e a asserção do detalhe falha.
 */
describe("FR-008: casos do setupFee na API", () => {
  test("criação com setup 1800 grava e devolve", async () => {
    const { api, handle } = app();
    const created = await api.request("/api/studies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: "cafés de bairro", mock: true, setupFee: 1800 }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string; setupFee?: number };
    expect(body.setupFee).toBe(1800);
    const detail = await api.request(`/api/studies/${body.id}`);
    expect(detail.status).toBe(200);
    expect(((await detail.json()) as { setupFee?: number }).setupFee).toBe(1800);
    handle.sqlite.close();
  });

  test("valor fora da faixa responde 422", async () => {
    const { api, handle } = app();
    for (const setupFee of [-1, 100001, 1.5]) {
      const response = await api.request("/api/studies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ niche: "cafés de bairro", mock: true, setupFee }),
      });
      expect(response.status).toBe(422);
    }
    handle.sqlite.close();
  });
});
