/**
 * Service bootstrap: validates the environment, wires the real adapters over SQLite and serves
 * the public API, the web UI and the health routes through a single Hono app.
 *
 * Importing this module has no side effects; `startService()` is only called at the bottom when
 * the file is the process entrypoint, so the CLI (`serve`) and tests can compose it directly.
 */
import { fileURLToPath } from "node:url";

import type { Hono } from "hono";
import { inArray } from "drizzle-orm";

import { StudyCache } from "./application/cache.ts";
import { StudyService } from "./application/study-service.ts";
import { createLogger } from "./config/runtime.ts";
import { loadEnv, type Env } from "./config/env.ts";
import { ConfigError } from "./domain/errors.ts";
import { SqliteCacheStore } from "./infrastructure/cache-repository.ts";
import { openDatabase, runMigrations, studies, type DatabaseHandle } from "./infrastructure/db.ts";
import { DeciderHttp } from "./infrastructure/decider.ts";
import { DeciderMock } from "./infrastructure/decider-mock.ts";
import { buildApiApp } from "./infrastructure/http/api.ts";
import { buildHealthApp } from "./infrastructure/http/health.ts";
import { buildHttpApp } from "./infrastructure/http/app.ts";
import { buildUiApp } from "./infrastructure/http/ui/routes.tsx";
import { LlmHttp } from "./infrastructure/llm.ts";
import { LlmMock } from "./infrastructure/llm-mock.ts";
import { SqliteStudyRepository } from "./infrastructure/repositories.ts";
import type { Logger } from "./domain/ports.ts";
import type { Server } from "bun";

/** Migrations live next to the sources (`drizzle/`) and resolve from the module, not the cwd. */
const MIGRATIONS_DIR = fileURLToPath(new URL("../drizzle", import.meta.url));

export interface ServiceBundle {
  app: Hono;
  handle: DatabaseHandle;
  service: StudyService;
  logger: Logger;
  env: Env;
  mock: boolean;
}

/**
 * Build the whole service in memory: environment, clients, database, repositories and routes.
 * Fails fast when a real provider is selected without its credentials.
 */
export function buildService(env: Env = loadEnv()): ServiceBundle {
  const logger = createLogger(env.LOG_LEVEL);
  const mock = env.GOODBIZZ_MOCK;

  if (!mock) {
    if (env.LLM_API_KEY === "") {
      throw new ConfigError("LLM_API_KEY is required unless GOODBIZZ_MOCK is set");
    }
    if (env.DECISION_API_URL === "") {
      throw new ConfigError("DECISION_API_URL is required unless GOODBIZZ_MOCK is set");
    }
  }

  const llm = mock ? new LlmMock() : new LlmHttp(env.LLM_API_URL, env.LLM_API_MODEL, env.LLM_API_KEY, 60);
  const decider =
    mock || env.DECISION_API_URL === ""
      ? new DeciderMock()
      : new DeciderHttp(env.DECISION_API_URL, env.DECISION_API_MODEL, env.DECISION_API_KEY, 60);

  const handle = openDatabase(env.DATABASE_URL);
  const applied = runMigrations(handle, MIGRATIONS_DIR);
  logger.info("migrations applied", { count: applied.length });

  const repo = new SqliteStudyRepository(handle.db);
  const cache = new StudyCache(new SqliteCacheStore(handle.db));
  // Estudos interrompidos por um restart ficariam presos em "na fila"/"executando" para sempre:
  // a execucao vive no processo. No boot, marque-os como falhos com instrucao de reexecutar.
  const staleIds = handle.db
    .select({ id: studies.id })
    .from(studies)
    .where(inArray(studies.state, ["pending", "running"]))
    .all();
  if (staleIds.length > 0) {
    handle.db
      .update(studies)
      .set({
        state: "failed",
        step: "interrompido",
        error: "o processo foi encerrado antes do fim deste estudo; execute de novo para retomar",
        updatedAt: new Date().toISOString(),
      })
      .where(
        inArray(
          studies.id,
          staleIds.map((row) => row.id),
        ),
      )
      .run();
    logger.warn("stale studies marked as failed on boot", { count: staleIds.length });
  }

  const service = new StudyService({
    repo,
    cache,
    llm,
    decider,
    logger,
    artifactsRoot: env.GOODBIZZ_STUDIES_DIR,
    pdf: false,
  });

  const production = env.APP_ENV === "production";
  const api = buildApiApp({
    service,
    providerStatus: () => ({
      llm: !mock,
      decider: !mock && env.DECISION_API_URL !== "",
      mockByDefault: mock,
    }),
  });
  const health = buildHealthApp(handle.db);
  const ui = buildUiApp({ service, sessionSecret: env.SESSION_SECRET, production });
  const app = buildHttpApp({ api, ui, health, logger, production });

  return { app, handle, service, logger, env, mock };
}

export interface RunningService {
  server: Server<undefined>;
  shutdown: () => Promise<void>;
}

/**
 * Serve the composed app. The returned `shutdown` drains in-flight requests, closes SQLite and
 * is idempotent; signals install a force-exit timer so a hung drain cannot wedge the process.
 */
export function startService(env: Env = loadEnv()): RunningService {
  const { app, handle, logger } = buildService(env);
  const server = Bun.serve({ port: env.PORT, fetch: app.fetch });
  logger.info("service listening", { url: String(server.url) });

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    const forceExit = setTimeout(() => process.exit(0), 8_000);
    try {
      await server.stop();
      handle.sqlite.close();
      logger.info("service stopped");
    } finally {
      clearTimeout(forceExit);
    }
  };

  const onSignal = () => {
    logger.info("shutdown signal received");
    void shutdown().then(() => process.exit(0));
  };
  process.once("SIGTERM", onSignal);
  process.once("SIGINT", onSignal);

  return { server, shutdown };
}

if (import.meta.main) {
  startService();
}
