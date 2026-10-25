/**
 * Decisor simulado no torneio (Work 0017, task 1.2): o duelo simulado é determinístico, não depende
 * da posição de apresentação e separa as ideias.
 */
import { describe, expect, test } from "bun:test";

import { StudyCache } from "../src/application/cache.ts";
import {
  DUEL_QUESTION_ID,
  duelProbability,
  duelQuestions,
  runTournament,
} from "../src/application/tournament.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import type { StudyConfig, StudyIdea } from "../src/domain/types.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";

const NAMES = [
  "Agenda Viva",
  "Fiado Digital",
  "Rota Certa",
  "Estoque Esperto",
  "Pix Cobrador",
  "Combo Evento",
];

function idea(name: string, position: number): StudyIdea {
  const index = 1.8 - position * 0.01;
  return {
    id: `id-${position}`,
    name,
    sector: "bebidas",
    description: `Automação de ${name.toLowerCase()} para depósitos de bebidas`,
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
    tier: "B",
  };
}

const config: StudyConfig = {
  ...resolveStudyConfig({ niche: "depósitos de bebidas", numIdeas: 6, mock: true }),
  cacheSeed: "estudo-simulado",
};

async function simulatedTournament() {
  const handle = openMigratedDatabase(":memory:");
  const cache = new StudyCache(new SqliteCacheStore(handle.db));
  const outcome = await runTournament(
    config,
    NAMES.map((name, position) => idea(name, position)),
    { decider: new DeciderMock(), cache },
  );
  handle.sqlite.close();
  return outcome;
}

describe("decisor simulado no torneio", () => {
  test("duelo simulado: a ideia preferida e a mesma nas duas ordens", async () => {
    const decider = new DeciderMock();
    for (let first = 0; first < NAMES.length; first++) {
      for (let second = first + 1; second < NAMES.length; second++) {
        const x = idea(NAMES[first] as string, first);
        const y = idea(NAMES[second] as string, second);
        const xFirst = duelProbability((await decider.ask("estado", duelQuestions(x, y)))[DUEL_QUESTION_ID]);
        const yFirst = duelProbability((await decider.ask("estado", duelQuestions(y, x)))[DUEL_QUESTION_ID]);
        expect(xFirst).not.toBeNull();
        expect(yFirst).not.toBeNull();
        // A probabilidade de X ser escolhida é a mesma em A ou em B.
        expect((xFirst ?? 0) + (yFirst ?? 0)).toBeCloseTo(1, 6);
      }
    }
  });

  test("torneio simulado: duas execucoes dao a mesma ordem e os mesmos pontos", async () => {
    const first = await simulatedTournament();
    const second = await simulatedTournament();
    expect(second.tournament).toEqual(first.tournament);
    expect(second.ideas.map((item) => item.tournament)).toEqual(first.ideas.map((item) => item.tournament));
  });

  test("torneio simulado: as medias separam as ideias", async () => {
    const outcome = await simulatedTournament();
    const scores = outcome.ideas.map((item) => item.tournament?.score ?? -1);
    expect(new Set(scores).size).toBeGreaterThan(1);
    expect(scores.some((score) => score !== 0.5)).toBe(true);
  });
});
