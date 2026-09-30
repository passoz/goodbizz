/**
 * Service bootstrap: validates the environment, wires the real adapters over SQLite and serves
 * the public API, the web UI and the health routes through a single Hono app.
 *
 * Importing this module has no side effects; `startService()` is only called at the bottom when
 * the file is the process entrypoint, só the CLI (`serve`) and tests can compose it directly.
 */
import { fileURLToPath } from "node:url";

import type { Hono } from "hono";
import { inArray } from "drizzle-orm";

import { StudyCache } from "./application/cache.ts";
import { ProviderSettingsStore } from "./application/settings.ts";
import { StudyService } from "./application/study-service.ts";
import { createLogger } from "./config/runtime.ts";
import { loadEnv, type Env } from "./config/env.ts";
import { effectiveProviders } from "./config/providers.ts";
import { ConfigError } from "./domain/errors.ts";
import { SqliteCacheStore } from "./infrastructure/cache-repository.ts";
import { openDatabase, runMigrations, studies, type DatabaseHandle } from "./infrastructure/db.ts";
import { buildApiApp } from "./infrastructure/http/api.ts";
import { buildHealthApp } from "./infrastructure/http/health.ts";
import { buildHttpApp } from "./infrastructure/http/app.ts";
import { buildUiApp } from "./infrastructure/http/ui/routes.tsx";
import { SqliteStudyRepository } from "./infrastructure/repositories.ts";
import { SqliteSettingsRepository } from "./infrastructure/settings-repository.ts";
import { RoutingDeciderClient, RoutingLlmClient } from "./infrastructure/routing.ts";
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
export async function buildService(env: Env = loadEnv()): Promise<ServiceBundle> {
  const logger = createLogger(env.LOG_LEVEL);
  const mockAll = env.GOODBIZZ_MOCK;
  // Modo misto, igual a CLI: da para rodar texto simulado com decisor real (e vice-versa), o que
  // e o caminho para validar um dos provedores sem gastar no outro.
  const mockLlm = mockAll || env.GOODBIZZ_MOCK_LLM;
  const mockDecider = mockAll || env.GOODBIZZ_MOCK_DECIDER;

  const handle = openDatabase(env.DATABASE_URL);
  const applied = runMigrations(handle, MIGRATIONS_DIR);
  logger.info("migrations applied", { count: applied.length });

  // A configuração salva na aba /settings sobrepõe o ambiente: precisa ser lida ANTES de validar
  // as credenciais, senão o serviço recusaria subir num banco que já tem as URLs/chaves.
  const settingsStore = new ProviderSettingsStore(new SqliteSettingsRepository(handle.db));
  await settingsStore.load();
  const effective = effectiveProviders(env, settingsStore.current());

  if (!mockLlm && effective.llmApiKey === "") {
    throw new ConfigError("LLM_API_KEY is required unless the LLM is mocked");
  }
  if (!mockDecider && effective.deciderUrl === "") {
    throw new ConfigError("DECISION_API_URL is required unless the decider is mocked");
  }

  // Clientes que releem a configuração a cada chamada: salvar na aba /settings vale na hora.
  const resolveProviders = () => effectiveProviders(env, settingsStore.current());
  const llm = new RoutingLlmClient({
    resolve: resolveProviders,
    mock: mockLlm,
    timeout: env.GOODBIZZ_LLM_TIMEOUT,
  });
  const decider = new RoutingDeciderClient({
    resolve: resolveProviders,
    mock: mockDecider,
    timeout: env.GOODBIZZ_LLM_TIMEOUT,
  });

  const repo = new SqliteStudyRepository(handle.db);
  const cache = new StudyCache(new SqliteCacheStore(handle.db));
  // Estudos interrompidos por um restart ficariam presos em "na fila"/"executando" para sempre:
  // a execução vive no processo. No boot, marque-os como falhos com instrução de reexecutar.
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
    // Um estudo pode pedir timeout próprio (`POST /api/studies {"timeout":N}`): os clientes daquele
    // estudo saem daqui com o valor resolvido da configuração; sem isso, o campo era aceito e ignorado.
    clientsFor: (cfg) => ({
      llm: new RoutingLlmClient({ resolve: resolveProviders, mock: mockLlm, timeout: cfg.timeout }),
      decider: new RoutingDeciderClient({
        resolve: resolveProviders,
        mock: mockDecider,
        timeout: cfg.timeout,
      }),
    }),
    artifactsRoot: env.GOODBIZZ_STUDIES_DIR,
    pdf: false,
    mockLlm,
    mockDecider,
    settings: settingsStore,
  });

  const production = env.APP_ENV === "production";
  const api = buildApiApp({
    service,
    providerStatus: () => ({
      llm: !mockLlm,
      decider: !mockDecider,
      mockByDefault: mockAll,
    }),
  });
  const health = buildHealthApp(handle.db);
  // Texto curto e sem segredo, para a interface dizer o que será executado de verdade.
  const providers = {
    llm: mockLlm ? "texto simulado" : `texto real (${env.LLM_API_MODEL})`,
    decider: mockDecider ? "números simulados" : `numeros reais (${env.DECISION_API_MODEL})`,
  };
  const ui = buildUiApp({ service, sessionSecret: env.SESSION_SECRET, production, providers });
  const app = buildHttpApp({ api, ui, health, logger, production });

  return { app, handle, service, logger, env, mock: mockAll };
}

export interface RunningService {
  server: Server<undefined>;
  shutdown: () => Promise<void>;
}

/**
 * Serve the composed app. The returned `shutdown` drains in-flight requests, closes SQLite and
 * is idempotent; signals install a force-exit timer só a hung drain cannot wedge the process.
 */
export async function startService(env: Env = loadEnv()): Promise<RunningService> {
  const { app, handle, logger } = await buildService(env);
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
  void startService();
}
