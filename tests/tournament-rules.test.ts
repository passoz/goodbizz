/**
 * Regras puras do torneio (Work 0017, task 1.1): número de rodadas, leitura da resposta do duelo,
 * pergunta nas duas posições e a ordem do ranking.
 */
import { describe, expect, test } from "bun:test";

import {
  DUEL_QUESTION_ID,
  compareRanking,
  duelProbability,
  duelQuestions,
  tournamentRounds,
} from "../src/application/tournament.ts";
import type { RankedEvaluation, TournamentStanding } from "../src/domain/types.ts";

function ranked(name: string, index: number, score: number | null): RankedEvaluation {
  const standing: TournamentStanding | null =
    score === null ? null : { points: score * 4, games: 4, wins: 0, byes: 0, score };
  return {
    name,
    sector: "",
    description: `descrição de ${name}`,
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
      label: "FORTE",
      painScore: 0,
      internalScore: 0,
      margin: 0,
      deviation: 0,
      probes: {},
      byParaphrase: {},
    },
    index,
    tier: "C",
    tournament: standing,
  };
}

describe("regras do torneio", () => {
  test("teto de log2 do numero de ideias mais 1 rodadas", () => {
    expect(tournamentRounds(0)).toBe(0);
    expect(tournamentRounds(1)).toBe(0);
    expect(tournamentRounds(2)).toBe(2);
    expect(tournamentRounds(3)).toBe(3);
    expect(tournamentRounds(5)).toBe(4);
    expect(tournamentRounds(8)).toBe(4);
    expect(tournamentRounds(9)).toBe(5);
    expect(tournamentRounds(40)).toBe(7);
  });

  test("a pergunta de duelo e choice com as ideias em A e B", () => {
    const question = duelQuestions(ranked("Fiado Digital", 1.8, null), ranked("Rota Certa", 1.7, null))[
      DUEL_QUESTION_ID
    ];
    expect(question?.type).toBe("choice");
    if (question?.type !== "choice") return;
    expect(question.criteria["A"]).toBe("Fiado Digital — descrição de Fiado Digital");
    expect(question.criteria["B"]).toBe("Rota Certa — descrição de Rota Certa");
  });

  test("probabilities parciais sao normalizadas entre A e B", () => {
    expect(duelProbability({ probabilities: { A: 0.6, B: 0.2 } })).toBe(0.75);
    expect(duelProbability({ probs: { A: 0.3 } })).toBe(0.3);
    expect(duelProbability({ probabilities: { B: 0.9 } })).toBe(0.1);
    expect(duelProbability({ probabilities: { A: 0, B: 0 }, choice: "A" })).toBe(1);
    expect(duelProbability({ choice: "b" })).toBe(0);
    expect(duelProbability({ confidence: 0.9 })).toBeNull();
    expect(duelProbability("A")).toBeNull();
    expect(duelProbability(null)).toBeNull();
  });

  test("a ordem segue a media do torneio, depois o indice, depois o nome", () => {
    const ideas = [
      ranked("Zeta", 1.9, 0.5),
      ranked("Alfa", 1.2, 0.75),
      ranked("Beta", 1.5, 0.5),
      ranked("Gama", 1.5, 0.5),
      ranked("Antigo", 2, null),
    ];
    expect([...ideas].sort(compareRanking).map((idea) => idea.name)).toEqual([
      "Alfa",
      "Zeta",
      "Beta",
      "Gama",
      "Antigo",
    ]);
  });

  test("sem torneio a ordem e a do indice", () => {
    const ideas = [ranked("B", 1.2, null), ranked("A", 1.2, null), ranked("C", 1.9, null)];
    expect([...ideas].sort(compareRanking).map((idea) => idea.name)).toEqual(["C", "A", "B"]);
  });
});
