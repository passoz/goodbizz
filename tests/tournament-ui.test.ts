/**
 * Torneio na interface (Work 0017, task 1.7): o ranking mostra a média e as partidas de cada ideia,
 * o termo tem entrada no glossário e a página /como-ler explica a ordem.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";

import { StudyCache } from "../src/application/cache.ts";
import { StudyService } from "../src/application/study-service.ts";
import { summarizeStudy } from "../src/application/summary.ts";
import { loadEnv } from "../src/config/env.ts";
import { createLogger, resolveStudyConfig } from "../src/config/runtime.ts";
import type { StudyIdea, StudyTournament, TournamentStanding } from "../src/domain/types.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase, type DatabaseHandle } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { GLOSSARY } from "../src/infrastructure/http/ui/layout.tsx";
import { buildUiApp } from "../src/infrastructure/http/ui/routes.tsx";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SearchMock } from "../src/infrastructure/search-mock.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";

function idea(name: string, index: number, standing: TournamentStanding | null): StudyIdea {
  return {
    id: `id-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    sector: "bebidas",
    description: name,
    indicators: {
      fit: index,
      fitConf: 0.8,
      sale: index,
      saleConf: 0.8,
      disruption: 1,
      disruptionConf: 0.8,
      pain: "dinheiro_direto",
      painProbs: { dinheiro_direto: 1 },
      painConf: 0.8,
      solo: 0.5,
    },
    business: { wtp: 0.5, meta30: 0.5, price: 1, priceConf: 0.7 },
    algorithm: {
      label: "FORTE",
      painScore: 0.8,
      internalScore: 0.1,
      margin: 0.7,
      deviation: 0.01,
      probes: {},
      byParaphrase: {},
    },
    index,
    tier: index >= 1.84 ? "A" : index >= 1.6 ? "B" : "C",
    tournament: standing,
  };
}

const tournament: StudyTournament = { rounds: 4, matches: [], byes: [], issues: [] };

let db: DatabaseHandle;
let repo: SqliteStudyRepository;
let app: Hono;
let service: StudyService;

beforeEach(() => {
  db = openMigratedDatabase(":memory:");
  repo = new SqliteStudyRepository(db.db);
  service = new StudyService({
    repo,
    cache: new StudyCache(new SqliteCacheStore(db.db)),
    llm: new LlmMock(),
    decider: new DeciderMock(),
    search: new SearchMock(),
    logger: createLogger("error"),
    artifactsRoot: mkdtempSync(join(tmpdir(), "goodbizz-ui-torneio-")),
  });
  app = buildUiApp({ service, sessionSecret: loadEnv().SESSION_SECRET, production: false });
});

afterEach(() => {
  db.sqlite.close();
});

async function studyPage(ideas: StudyIdea[], withTournament: StudyTournament | null): Promise<string> {
  const created = await service.create(
    resolveStudyConfig({ niche: "depósitos de bebidas", numIdeas: 2, mock: true }),
  );
  await repo.saveEvaluations(created.id, ideas, summarizeStudy(ideas, withTournament));
  await repo.update(created.id, { progress: { state: "done", step: "concluído", error: null } });
  return (await app.request(`/studies/${created.id}`)).text();
}

/** Texto visível da tabela de ranking, sem tags. */
function rankingText(html: string): string {
  const table = html.slice(
    html.indexOf('id="ranking"'),
    html.indexOf("</table>", html.indexOf('id="ranking"')),
  );
  return table.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

describe("torneio na interface", () => {
  test("em 4 partidas: o ranking mostra a media e as partidas de cada ideia na ordem do torneio", async () => {
    const html = await studyPage(
      [
        idea("Agenda Viva", 1.9, { points: 1, games: 4, wins: 1, byes: 0, score: 0.25 }),
        idea("Fiado Digital", 1.2, { points: 3, games: 4, wins: 3, byes: 0, score: 0.75 }),
      ],
      tournament,
    );
    const text = rankingText(html);
    expect(text).toContain("Torneio");
    expect(text).toContain("maior é melhor");
    expect(text).toContain("0.75 em 4 partidas");
    expect(text).toContain("0.25 em 4 partidas");
    expect(text.indexOf("Fiado Digital")).toBeLessThan(text.indexOf("Agenda Viva"));
  });

  test("em 4 partidas: estudo antigo mostra a coluna vazia e ordena pelo indice", async () => {
    const html = await studyPage([idea("Agenda Viva", 1.2, null), idea("Fiado Digital", 1.9, null)], null);
    const text = rankingText(html);
    expect(text).toContain("Torneio");
    expect(text).not.toContain("partidas");
    expect(text.indexOf("Fiado Digital")).toBeLessThan(text.indexOf("Agenda Viva"));
  });

  test("glossario: o termo torneio tem entrada e aparece em /como-ler", async () => {
    const entry = GLOSSARY["torneio"] ?? "";
    expect(entry).toContain("duas ordens");
    expect(entry).toContain("média de pontos por partida");
    const page = await (await app.request("/como-ler")).text();
    expect(page).toContain(entry);
    expect(page).toContain("ordem do ranking");
  });
});
