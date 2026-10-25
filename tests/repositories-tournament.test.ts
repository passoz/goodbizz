/**
 * Gravação e leitura do torneio no repositório (Work 0017, task 1.5).
 */
import { describe, expect, test } from "bun:test";

import type { StudyIdea } from "../src/domain/types.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";

function idea(name: string, index: number, score: number): StudyIdea {
  return {
    id: name,
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
    tournament: { points: score, games: 1, wins: score > 0.5 ? 1 : 0, byes: 0, score },
  };
}

describe("repositorio com torneio", () => {
  test("a leitura devolve o torneio de cada ideia na ordem do ranking", async () => {
    const db = openMigratedDatabase(":memory:");
    const repo = new SqliteStudyRepository(db.db);
    const now = new Date().toISOString();
    await repo.save({
      id: "s",
      createdAt: now,
      updatedAt: now,
      niche: "Bares",
      description: "",
      city: "",
      monthlyTicket: 300,
      numIdeas: 2,
      painMethod: "choice",
      mock: true,
      artifactDir: "/tmp/nao-usado",
      brief: "",
      progress: { state: "done", step: "", error: null },
      evaluations: [],
      summary: null,
      usage: null,
    });
    await repo.saveEvaluations("s", [idea("Alto", 1.9, 0.2), idea("Baixo", 1.0, 0.8)], null);
    const loaded = await repo.get("s");
    expect(loaded?.evaluations.map((item) => [item.name, item.tournament?.score])).toEqual([
      ["Baixo", 0.8],
      ["Alto", 0.2],
    ]);
    db.sqlite.close();
  });
});
