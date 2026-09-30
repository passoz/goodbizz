/**
 * Regressão do limite por chamada de IA na execução de um estudo.
 *
 * O serviço criava a configuração com `timeout: this.options.timeout ?? 60`. Como o literal nunca
 * é `undefined`, o fallback `overrides.timeout ?? env.GOODBIZZ_LLM_TIMEOUT` de `resolveStudyConfig`
 * nunca rodava e todo estudo nascia com 60 s por chamada, ignorando `GOODBIZZ_LLM_TIMEOUT`. Em
 * produção isso cortava documentos de 20 mil tokens do `deepseek-flash` e do tier gratuito do
 * tokenharbor (27,6 tok/s medidos), com 3 tentativas de 60 s = 184,5 s e falha garantida.
 */
import { afterEach, describe, expect, test } from "bun:test";

import { StudyCache } from "../src/application/cache.ts";
import { evaluationToJson } from "../src/application/dados.ts";
import { evaluateIdea } from "../src/application/evaluate.ts";
import { generateStudy } from "../src/application/generate-study.ts";
import { StudyService } from "../src/application/study-service.ts";
import { loadEnv, resetEnv } from "../src/config/env.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import type { StudyConfig } from "../src/domain/types.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { silentLogger, tempDir } from "./helpers.ts";

const saved = new Map<string, string | undefined>();

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete Bun.env[key];
    else Bun.env[key] = value;
  }
  saved.clear();
  resetEnv();
});

/**
 * `executeRun` reconstroi a configuracao a partir do registro, que nao guarda chave nem URL: em
 * producao essas credenciais vem do ambiente. O teste reproduz isso em vez de injetar no registro.
 */
function withCredentials(): void {
  for (const [key, value] of [
    ["LLM_API_KEY", "test-llm-key"],
    ["DECISION_API_KEY", "test-decider-key"],
    ["DECISION_API_URL", "https://decider.invalid/v1"],
  ] as const) {
    if (!saved.has(key)) saved.set(key, Bun.env[key]);
    Bun.env[key] = value;
  }
  resetEnv();
}

/** Roda um estudo com os mocks deterministicos e devolve a config que os clientes receberam. */
async function captureRunConfig(): Promise<StudyConfig> {
  withCredentials();
  const db = openMigratedDatabase(":memory:");
  const captured: StudyConfig[] = [];
  const service = new StudyService({
    repo: new SqliteStudyRepository(db.db),
    cache: new StudyCache(new SqliteCacheStore(db.db)),
    llm: new LlmMock(),
    decider: new DeciderMock(),
    logger: silentLogger(),
    artifactsRoot: tempDir("goodbizz-timeout-"),
    clientsFor: (cfg) => {
      captured.push(cfg);
      return { llm: new LlmMock(), decider: new DeciderMock() };
    },
  });
  const record = await service.create(resolveStudyConfig({ niche: "clinicas", numIdeas: 2 }));
  await service.run(record.id);
  db.sqlite.close();
  return captured[0]!;
}

describe("limite por chamada de IA na execução do estudo", () => {
  test("herda GOODBIZZ_LLM_TIMEOUT quando o serviço não define timeout", async () => {
    saved.set("GOODBIZZ_LLM_TIMEOUT", Bun.env.GOODBIZZ_LLM_TIMEOUT);
    Bun.env.GOODBIZZ_LLM_TIMEOUT = "1200";
    resetEnv();

    const cfg = await captureRunConfig();

    expect(cfg.timeout).toBe(1200);
    // O valor fixo que causava o corte: 60 s por chamada.
    expect(cfg.timeout).not.toBe(60);
    expect(cfg.timeout).toBe(loadEnv().GOODBIZZ_LLM_TIMEOUT);
  });

  test("usa o default do ambiente quando a variável não está definida", async () => {
    saved.set("GOODBIZZ_LLM_TIMEOUT", Bun.env.GOODBIZZ_LLM_TIMEOUT);
    delete Bun.env.GOODBIZZ_LLM_TIMEOUT;
    resetEnv();

    const cfg = await captureRunConfig();

    expect(cfg.timeout).toBe(300);
    expect(cfg.timeout).not.toBe(60);
  });

  test("o timeout do serviço tem precedência sobre o ambiente", async () => {
    saved.set("GOODBIZZ_LLM_TIMEOUT", Bun.env.GOODBIZZ_LLM_TIMEOUT);
    Bun.env.GOODBIZZ_LLM_TIMEOUT = "1200";
    resetEnv();

    withCredentials();
    const db = openMigratedDatabase(":memory:");
    const captured: StudyConfig[] = [];
    const service = new StudyService({
      repo: new SqliteStudyRepository(db.db),
      cache: new StudyCache(new SqliteCacheStore(db.db)),
      llm: new LlmMock(),
      decider: new DeciderMock(),
      logger: silentLogger(),
      artifactsRoot: tempDir("goodbizz-timeout-"),
      timeout: 900,
      clientsFor: (cfg) => {
        captured.push(cfg);
        return { llm: new LlmMock(), decider: new DeciderMock() };
      },
    });
    const record = await service.create(resolveStudyConfig({ niche: "clinicas", numIdeas: 2 }));
    await service.run(record.id);
    db.sqlite.close();

    expect(captured[0]!.timeout).toBe(900);
  });
});

/**
 * FR-001 / SCENARIO-1.1: cada ideia precisa de identidade propria, porque `name` nao distingue
 * duas ideias homonimas. Sem um id, "remover exatamente a ideia que escolhi" seria impossivel.
 *
 * O `id` nasce em `evaluateIdea` e atravessa o pipeline; a persistencia dele e da task 1.3.
 */
describe("identidade estavel por ideia", () => {
  test("cada ideia avaliada recebe um id preenchido", async () => {
    const cfg = resolveStudyConfig({ niche: "clinicas", numIdeas: 1, mock: true });
    const evaluated = await evaluateIdea(
      { name: "Agenda Vazada", sector: "s", description: "d" },
      new DeciderMock(),
      cfg,
    );

    expect(typeof evaluated.id).toBe("string");
    expect(evaluated.id.length).toBeGreaterThan(0);
  });

  test("ids sao distintos entre si mesmo com names iguais", async () => {
    const cfg = resolveStudyConfig({ niche: "clinicas", numIdeas: 1, mock: true });
    const decider = new DeciderMock();

    const first = await evaluateIdea({ name: "Agenda Vazada", sector: "s", description: "d" }, decider, cfg);
    const second = await evaluateIdea({ name: "Agenda Vazada", sector: "s", description: "d" }, decider, cfg);

    // Mesmo name: so o id separa as duas linhas.
    expect(first.name).toBe(second.name);
    expect(first.id).not.toBe(second.id);
  });

  test("o id atravessa o pipeline e nao se repete dentro do estudo", async () => {
    const { handle, cache } = (() => {
      const h = openMigratedDatabase(":memory:");
      return { handle: h, cache: new StudyCache(new SqliteCacheStore(h.db)) };
    })();

    const cfg: StudyConfig = {
      ...resolveStudyConfig({ niche: "clinicas", numIdeas: 4, mock: true }),
      outputDir: tempDir("goodbizz-ideias-"),
      evaluateOnly: true,
    };
    const result = await generateStudy(cfg, {
      llm: new LlmMock(),
      decider: new DeciderMock(),
      cache,
      logger: silentLogger(),
    });

    const ids = result.evaluations.map((e) => e.id);
    expect(ids).toHaveLength(4);
    for (const id of ids) expect(id).toBeTruthy();
    expect(new Set(ids).size).toBe(ids.length);

    handle.sqlite.close();
  });

  test("o id nao entra na forma do dados.json (CON-006)", async () => {
    const cfg: StudyConfig = {
      ...resolveStudyConfig({ niche: "clinicas", numIdeas: 2, mock: true }),
      outputDir: tempDir("goodbizz-forma-"),
      evaluateOnly: true,
    };
    const handle = openMigratedDatabase(":memory:");
    const result = await generateStudy(cfg, {
      llm: new LlmMock(),
      decider: new DeciderMock(),
      cache: new StudyCache(new SqliteCacheStore(handle.db)),
      logger: silentLogger(),
    });

    // O baseline Python casa por chave: a forma nao pode ganhar `id`.
    const json = evaluationToJson(result.evaluations[0]!);
    expect(Object.keys(json)).not.toContain("id");
    expect(json["nome"]).toBe(result.evaluations[0]!.name);

    handle.sqlite.close();
  });
});
