/**
 * Persistência do torneio (Work 0017, task 1.5): a coluna `tournament_json` guarda os pontos de cada
 * ideia, o rank gravado segue o torneio, o detalhe da API expõe as partidas e o estudo antigo abre
 * pela ordem do índice.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { summarizeStudy } from "../src/application/summary.ts";
import type { StudyIdea, StudyRecord, StudyTournament, TournamentStanding } from "../src/domain/types.ts";
import { evaluations as evaluationsTable } from "../src/infrastructure/schema.ts";
import { openMigratedDatabase, type DatabaseHandle } from "../src/infrastructure/db.ts";
import { buildApiApp } from "../src/infrastructure/http/api.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { makeHarness, type TestHarness } from "./helpers.ts";

function idea(name: string, index: number, standing: TournamentStanding | null): StudyIdea {
  return {
    id: `id-${name}`,
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
    ...(standing === null ? {} : { tournament: standing }),
  };
}

const tournament: StudyTournament = {
  rounds: 2,
  matches: [
    {
      round: 1,
      a: "id-Fiado Digital",
      b: "id-Agenda Viva",
      aName: "Fiado Digital",
      bName: "Agenda Viva",
      pA: 1,
    },
    {
      round: 2,
      a: "id-Fiado Digital",
      b: "id-Agenda Viva",
      aName: "Fiado Digital",
      bName: "Agenda Viva",
      pA: 1,
    },
  ],
  byes: [],
  issues: [],
};

const played: StudyIdea[] = [
  idea("Agenda Viva", 1.9, { points: 0, games: 2, wins: 0, byes: 0, score: 0 }),
  idea("Fiado Digital", 1.1, { points: 2, games: 2, wins: 2, byes: 0, score: 1 }),
];

function record(id: string): StudyRecord {
  const now = new Date().toISOString();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    niche: "Depósitos De Bebidas",
    description: "",
    city: "",
    monthlyTicket: 300,
    setupFee: 1500,
    numIdeas: 2,
    painMethod: "choice",
    mock: true,
    artifactDir: "/tmp/nao-usado",
    brief: "",
    progress: { state: "done", step: "concluído", error: null },
    evaluations: [],
    summary: null,
    usage: null,
    evidences: [],
  };
}

let db: DatabaseHandle;
let repo: SqliteStudyRepository;

beforeEach(() => {
  db = openMigratedDatabase(":memory:");
  repo = new SqliteStudyRepository(db.db);
});

afterEach(() => {
  db.sqlite.close();
});

describe("persistencia do torneio", () => {
  test("tournament_json: os pontos voltam do banco e o rank segue o torneio", async () => {
    await repo.save(record("estudo-torneio"));
    await repo.saveEvaluations("estudo-torneio", played, summarizeStudy(played, tournament));

    const loaded = await repo.get("estudo-torneio");
    expect(loaded?.evaluations.map((item) => item.name)).toEqual(["Fiado Digital", "Agenda Viva"]);
    expect(loaded?.evaluations[0]?.tournament).toEqual({ points: 2, games: 2, wins: 2, byes: 0, score: 1 });
    expect(loaded?.summary?.ordered.map((item) => item.name)).toEqual(["Fiado Digital", "Agenda Viva"]);
    expect(loaded?.summary?.tournament?.matches).toHaveLength(2);
    expect((await repo.list())[0]?.topIdea).toBe("Fiado Digital");

    // O torneio vive na coluna própria; o payload_json continua com a forma do baseline.
    const rows = db.db
      .select()
      .from(evaluationsTable)
      .where(eq(evaluationsTable.studyId, "estudo-torneio"))
      .all();
    const fiado = rows.find((row) => row.name === "Fiado Digital");
    expect(fiado?.rank).toBe(1);
    expect(fiado?.payloadJson).not.toContain("tournament");
    expect(JSON.parse(fiado?.tournamentJson ?? "null")).toEqual({
      points: 2,
      games: 2,
      wins: 2,
      byes: 0,
      score: 1,
    });
  });

  test("estudo antigo: tournament_json nulo devolve a ordem pelo indice ao lado de um estudo novo", async () => {
    // O estudo novo, no mesmo banco, segue o torneio; o antigo continua no índice.
    await repo.save(record("estudo-novo"));
    await repo.saveEvaluations("estudo-novo", played, summarizeStudy(played, tournament));
    expect((await repo.get("estudo-novo"))?.evaluations.map((item) => item.name)).toEqual([
      "Fiado Digital",
      "Agenda Viva",
    ]);

    const old = played.map(({ tournament: _ignored, ...rest }) => rest);
    await repo.save(record("estudo-antigo"));
    await repo.saveEvaluations("estudo-antigo", old, summarizeStudy(old));

    const loaded = await repo.get("estudo-antigo");
    expect(loaded?.evaluations.map((item) => item.name)).toEqual(["Agenda Viva", "Fiado Digital"]);
    expect(loaded?.evaluations.every((item) => (item.tournament ?? null) === null)).toBe(true);
    expect(loaded?.summary?.ordered.map((item) => item.name)).toEqual(["Agenda Viva", "Fiado Digital"]);
    expect(loaded?.summary?.tournament ?? null).toBeNull();
  });
});

describe("detalhe do estudo na API", () => {
  let harness: TestHarness;
  beforeEach(() => {
    harness = makeHarness();
  });
  afterEach(() => {
    harness.close();
  });

  test("tournament_json: o detalhe expoe tournament.matches e o torneio de cada avaliacao", async () => {
    const app = buildApiApp({
      service: harness.service,
      providerStatus: () => ({ llm: false, decider: false, mockByDefault: true }),
    });
    const created = await app.request("/studies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: "depósitos de bebidas", numIdeas: 4, mock: true }),
    });
    const { id } = (await created.json()) as { id: string };
    await harness.service.run(id);

    const detail = (await (await app.request(`/studies/${id}`)).json()) as {
      tournament: { rounds: number; matches: unknown[] } | null;
      evaluations: Array<{ tournament: { games: number } | null }>;
    };
    expect(detail.tournament?.rounds).toBe(3);
    expect(detail.tournament?.matches).toHaveLength(6);
    expect(detail.evaluations.every((item) => item.tournament?.games === 3)).toBe(true);
  });
});
