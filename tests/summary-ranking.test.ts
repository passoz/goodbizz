/**
 * `summarizeStudy` ordena pelo torneio e guarda as partidas (Work 0017, task 1.3).
 */
import { describe, expect, test } from "bun:test";

import { summarizeStudy } from "../src/application/summary.ts";
import type { StudyIdea, StudyTournament } from "../src/domain/types.ts";

function idea(id: string, index: number, score: number | null, label = "FORTE"): StudyIdea {
  return {
    id,
    name: id,
    sector: "",
    description: id,
    indicators: {
      fit: index,
      fitConf: 0,
      sale: index,
      saleConf: 0,
      disruption: 0,
      disruptionConf: 0,
      pain: "dinheiro_direto",
      painProbs: { dinheiro_direto: 1 },
      painConf: 0,
      solo: 0,
    },
    business: { wtp: 0.5, meta30: 0.5, price: 1, priceConf: 0 },
    algorithm: {
      label,
      painScore: 0.8,
      internalScore: 0,
      margin: 0.8,
      deviation: 0,
      probes: {},
      byParaphrase: {},
    },
    index,
    tier: index >= 1.84 ? "A" : index >= 1.6 ? "B" : "C",
    tournament: score === null ? null : { points: score * 2, games: 2, wins: 0, byes: 0, score },
  };
}

const tournament: StudyTournament = {
  rounds: 2,
  matches: [{ round: 1, a: "Baixo", b: "Alto", aName: "Baixo", bName: "Alto", pA: 0.9 }],
  byes: [],
  issues: [],
};

describe("resumo pelo torneio", () => {
  test("ordered, tiers e alvos seguem a media do torneio", () => {
    const summary = summarizeStudy([idea("Alto", 1.9, 0.1), idea("Baixo", 1.1, 0.9)], tournament);
    expect(summary.ordered.map((item) => item.name)).toEqual(["Baixo", "Alto"]);
    expect(summary.attack).toEqual(["Baixo", "Alto"]);
    expect(summary.tournament).toEqual(tournament);
  });

  test("sem torneio a ordem continua pelo indice e o resumo nao tem partidas", () => {
    const summary = summarizeStudy([idea("Baixo", 1.1, null), idea("Alto", 1.9, null)]);
    expect(summary.ordered.map((item) => item.name)).toEqual(["Alto", "Baixo"]);
    expect(summary.tournament ?? null).toBeNull();
  });
});
