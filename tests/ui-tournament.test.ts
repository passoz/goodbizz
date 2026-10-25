/**
 * Ordem do torneio nas rotas da interface quando o resumo ainda não foi gravado (Work 0017, task 1.7).
 */
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StudyCache } from "../src/application/cache.ts";
import { StudyService } from "../src/application/study-service.ts";
import { loadEnv } from "../src/config/env.ts";
import { createLogger, resolveStudyConfig } from "../src/config/runtime.ts";
import type { StudyIdea } from "../src/domain/types.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { buildUiApp } from "../src/infrastructure/http/ui/routes.tsx";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";

function idea(name: string, slug: string, index: number, score: number): StudyIdea {
  return {
    id: slug,
    name,
    sector: "",
    description: name,
    indicators: {
      fit: index,
      fitConf: 0,
      sale: index,
      saleConf: 0,
      disruption: 0,
      disruptionConf: 0,
      pain: "",
      painProbs: {},
      painConf: 0,
      solo: 0,
    },
    business: { wtp: 0, meta30: 0, price: 0, priceConf: 0 },
    algorithm: {
      label: "FRACA",
      painScore: 0,
      internalScore: 0,
      margin: 0,
      deviation: 0,
      probes: {},
      byParaphrase: {},
    },
    index,
    tier: "C",
    tournament: { points: score * 2, games: 2, wins: 0, byes: 0, score },
  };
}

describe("rotas da interface com torneio", () => {
  test("sem resumo gravado, o plano da posicao 1 e o da ideia que lidera o torneio", async () => {
    const db = openMigratedDatabase(":memory:");
    const repo = new SqliteStudyRepository(db.db);
    const artifactsRoot = mkdtempSync(join(tmpdir(), "goodbizz-ui-rotas-"));
    const service = new StudyService({
      repo,
      cache: new StudyCache(new SqliteCacheStore(db.db)),
      llm: new LlmMock(),
      decider: new DeciderMock(),
      logger: createLogger("error"),
      artifactsRoot,
    });
    const app = buildUiApp({ service, sessionSecret: loadEnv().SESSION_SECRET, production: false });
    const created = await service.create(resolveStudyConfig({ niche: "bares", numIdeas: 2, mock: true }));
    await repo.saveEvaluations(
      created.id,
      [idea("Agenda Viva", "agenda-viva", 1.9, 0.1), idea("Fiado Digital", "fiado-digital", 1.1, 0.9)],
      null,
    );
    mkdirSync(join(created.artifactDir, "01-fiado-digital"), { recursive: true });
    writeFileSync(join(created.artifactDir, "01-fiado-digital", "README.md"), "# Plano do Fiado\n");

    const response = await app.request(`/studies/${created.id}/ideas/1`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Plano do Fiado");
    db.sqlite.close();
  });
});
