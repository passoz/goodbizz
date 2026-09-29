/**
 * End-to-end smoke: the full stack (service + API + UI + health) with the deterministic mocks.
 * Proves the six artifacts, the ranking, the numeric guardrail, and that two runs agree byte-for-byte.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

import { StudyCache } from "../src/application/cache.ts";
import { StudyService } from "../src/application/study-service.ts";
import { buildService } from "../src/index.ts";
import { loadEnv } from "../src/config/env.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { NotFoundError } from "../src/domain/errors.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { migrateFromEnvironment, openMigratedDatabase } from "../src/infrastructure/db.ts";
import { buildApiApp } from "../src/infrastructure/http/api.ts";
import { buildHttpApp } from "../src/infrastructure/http/app.ts";
import { buildHealthApp } from "../src/infrastructure/http/health.ts";
import { buildUiApp } from "../src/infrastructure/http/ui/routes.tsx";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { silentLogger, tempDir } from "./helpers.ts";

const SESSION_SECRET = "test-session-secret-with-enough-length";

async function runMockStudy(niche: string, ideas: number) {
  const db = openMigratedDatabase(":memory:");
  const artifactsRoot = tempDir("goodbizz-smoke-");
  const logger = silentLogger();
  const service = new StudyService({
    repo: new SqliteStudyRepository(db.db),
    cache: new StudyCache(new SqliteCacheStore(db.db)),
    llm: new LlmMock(),
    decider: new DeciderMock(),
    logger,
    artifactsRoot,
  });

  const app = buildHttpApp({
    api: buildApiApp({
      service,
      providerStatus: () => ({ llm: false, decider: false, mockByDefault: true }),
    }),
    ui: buildUiApp({ service, sessionSecret: SESSION_SECRET, production: false }),
    health: buildHealthApp(db.db),
    logger,
    production: false,
  });

  const cfg = resolveStudyConfig({ niche, numIdeas: ideas, mock: true, outputDir: artifactsRoot });
  const record = await service.create(cfg);
  const finished = await service.run(record.id);
  return { db, artifactsRoot, service, app, record: finished };
}

describe("end-to-end smoke (mock mode)", () => {
  test("writes the full artifact tree and ranks the ideas", async () => {
    const { db, artifactsRoot, record, service } = await runMockStudy("oficinas mecanicas de bairro", 3);

    for (const file of ["README.md", "00-brief.md", "00-tabelao.md", "00-tabelao.csv", "dados.json"]) {
      expect(existsSync(join(record.artifactDir, file))).toBe(true);
    }

    const artifacts = await service.artifactPaths(record.id);
    const planPaths = artifacts.filter((path) => path.endsWith("/README.md"));
    expect(planPaths).toHaveLength(3);
    expect(planPaths[0]).toMatch(/^01-/);
    expect(planPaths[1]).toMatch(/^02-/);
    expect(planPaths[2]).toMatch(/^03-/);

    expect(record.progress.state).toBe("done");
    expect(record.evaluations).toHaveLength(3);
    const indices = record.evaluations.map((evaluation) => evaluation.index);
    expect(indices).toEqual([...indices].sort((a, b) => b - a));
    expect(record.summary?.means.fit).toBeGreaterThan(0);
    expect(record.summary?.tiers).toBeDefined();

    const plan = readFileSync(join(record.artifactDir, planPaths[0] as string), "utf8");
    for (const section of [
      "## 1. Resumo executivo",
      "## 7. SWOT",
      "## 8. Business Model Canvas",
      "## 10. Proximos passos",
    ]) {
      expect(plan).toContain(section);
    }
    expect(plan).toContain("Porter");
    expect(plan).not.toMatch(/[áàâãäçéèêëíìîïñóòôõöúùûü]/i);

    expect(record.artifactDir).toBe(join(artifactsRoot, record.id));
    db.sqlite.close();
  });

  test("dados.json keeps the baseline key scheme consumable by recalibration", async () => {
    const { db, record, service } = await runMockStudy("pousadas historicas", 2);
    const raw = await service.readArtifact(record.id, "dados.json");
    const parsed = JSON.parse(raw) as {
      config: Record<string, unknown>;
      medias: Record<string, number>;
      grupos_dor: Record<string, string[]>;
      tiers: Record<string, string[]>;
      ideias: Array<Record<string, unknown>>;
    };
    expect(Object.keys(parsed)).toEqual(["config", "medias", "grupos_dor", "tiers", "ideias"]);
    expect(parsed.config).toHaveProperty("nicho");
    expect(parsed.config).toHaveProperty("ticket_mes");
    expect(parsed.medias).toHaveProperty("fit");
    expect(parsed.grupos_dor).toHaveProperty("forte");
    const first = parsed.ideias[0] as {
      nome: string;
      indicadores: Record<string, unknown>;
      negocio: Record<string, unknown>;
      algoritmo: { rotulo: string; sondas: Record<string, number> };
      indice: number;
      tier: string;
    };
    expect(first).toHaveProperty("nome");
    expect(first.indicadores).toHaveProperty("venda");
    expect(first.negocio).toHaveProperty("wtp");
    expect(first.algoritmo.sondas).toHaveProperty("dinheiro");
    expect(["A", "B", "C"]).toContain(first.tier);
    db.sqlite.close();
  });

  test("two independent runs produce identical artifacts", async () => {
    const first = await runMockStudy("clinicas odontologicas", 2);
    const second = await runMockStudy("clinicas odontologicas", 2);
    const firstDados = await first.service.readArtifact(first.record.id, "dados.json");
    const secondDados = await second.service.readArtifact(second.record.id, "dados.json");
    expect(firstDados).toBe(secondDados);
    first.db.sqlite.close();
    second.db.sqlite.close();
  });

  test("serves the API, the web UI and both health endpoints", async () => {
    const { app, db, service, record } = await runMockStudy("estudios de tatuagem", 2);

    const health = await app.request("/healthz");
    expect(health.status).toBe(200);
    const ready = await app.request("/readyz");
    expect(ready.status).toBe(200);

    const listing = await app.request("/api/studies");
    expect(listing.status).toBe(200);

    const detail = await app.request(`/api/studies/${record.id}`);
    expect(detail.status).toBe(200);

    const home = await app.request("/");
    expect(home.status).toBe(200);
    expect(home.headers.get("content-type")).toContain("text/html");
    expect(await home.text()).toContain("goodbizz");

    const created = await app.request("/api/studies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: "barbearias de bairro", numIdeas: 2, mock: true }),
    });
    expect(created.status).toBe(201);
    const body = (await created.json()) as { id: string };

    const run = await app.request(`/api/studies/${body.id}/run`, { method: "POST" });
    expect(run.status).toBe(200);
    expect((await service.get(body.id)).progress.state).toBe("done");

    const missing = await app.request("/api/studies/nope/artifacts/dados.json");
    expect(missing.status).toBe(404);

    db.sqlite.close();
  });
});

describe("HTTP composition", () => {
  function composedApp(production: boolean) {
    const logger = silentLogger();
    const api = new Hono()
      .get("/missing", () => {
        throw new NotFoundError("estudo inexistente");
      })
      .get("/boom", () => {
        throw new Error("detalhe interno que nao pode vazar");
      });
    const health = new Hono().get("/healthz", (c) => c.json({ status: "ok" }));
    const ui = new Hono().get("/", (c) => c.html("<!doctype html><html></html>"));
    return buildHttpApp({ api, ui, health, logger, production });
  }

  test("maps a domain error to its status code", async () => {
    const response = await composedApp(false).request("/api/missing");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("NOT_FOUND");
    expect(body.message).toBe("estudo inexistente");
  });

  test("hides internal details behind a generic 500", async () => {
    const response = await composedApp(false).request("/api/boom");
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: string; message: string };
    expect(body.error).toBe("INTERNAL_SERVER_ERROR");
    expect(JSON.stringify(body)).not.toContain("detalhe interno");
  });

  test("answers an unknown route with a JSON 404", async () => {
    const response = await composedApp(false).request("/nao-existe");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("NOT_FOUND");
  });

  test("redirects to HTTPS only when a proxy reports plaintext, never for health", async () => {
    const app = composedApp(true);
    const redirected = await app.request("/", { headers: { "x-forwarded-proto": "http" } });
    expect(redirected.status).toBe(308);
    expect(redirected.headers.get("location")).toStartWith("https://");

    const direct = await app.request("/");
    expect(direct.status).toBe(200);

    const health = await app.request("/healthz", { headers: { "x-forwarded-proto": "http" } });
    expect(health.status).toBe(200);
  });
});

describe("migrations", () => {
  test("apply once and are a no-op afterwards", () => {
    const url = join(tempDir("goodbizz-migrate-"), "app.db");
    const first = migrateFromEnvironment({ url });
    expect(first.length).toBeGreaterThan(0);
    expect(migrateFromEnvironment({ url })).toEqual([]);
  });

  test("boot marks studies left queued by a restart as failed", async () => {
    const url = join(tempDir("goodbizz-boot-"), "app.db");
    const handle = openMigratedDatabase(url);
    const repo = new SqliteStudyRepository(handle.db);
    const cache = new StudyCache(new SqliteCacheStore(handle.db));
    const service = new StudyService({
      repo,
      cache,
      llm: new LlmMock(),
      decider: new DeciderMock(),
      logger: silentLogger(),
      artifactsRoot: tempDir("goodbizz-boot-artifacts-"),
    });
    const created = await service.create(resolveStudyConfig({ niche: "orfao", mock: true }));
    expect(created.progress.state).toBe("pending");
    handle.sqlite.close();

    const bundle = buildService({
      ...loadEnv(),
      DATABASE_URL: url,
      GOODBIZZ_MOCK: true,
      GOODBIZZ_STUDIES_DIR: tempDir("goodbizz-boot-estudos-"),
    });
    const studies = await bundle.service.list();
    expect(studies).toHaveLength(1);
    expect(studies[0]?.state).toBe("failed");
    const recovered = await bundle.service.get(created.id);
    expect(recovered.progress.step).toBe("interrompido");
    expect(recovered.progress.error).toContain("execute de novo");
    bundle.handle.sqlite.close();
  });
});
