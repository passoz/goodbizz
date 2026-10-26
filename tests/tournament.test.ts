/**
 * Torneio suíço no decisor (Work 0017, task 1.1): rodadas, emparelhamento, folga, as duas ordens
 * de apresentação, resposta sem probabilidade, cache por partida e o teto de chamadas.
 */
import { describe, expect, test } from "bun:test";

import { StudyCache } from "../src/application/cache.ts";
import {
  DUEL_QUESTION_ID,
  dropFromTournament,
  rankIdeas,
  runTournament,
} from "../src/application/tournament.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import type { DeciderClient } from "../src/domain/ports.ts";
import type { DeciderAnswers, QuestionSet, StudyConfig, StudyIdea } from "../src/domain/types.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";

const NAMES = [
  "Agenda Viva",
  "Fiado Digital",
  "Rota Certa",
  "Estoque Esperto",
  "Pix Cobrador",
  "Combo Evento",
  "Avalia Mais",
  "Gelo Garantido",
];

function idea(name: string, index: number): StudyIdea {
  return {
    id: `id-${name}`,
    name,
    sector: "bebidas",
    description: `descrição de ${name}`,
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

/** Oito ideias com índices distintos: a ordem de semente é a do índice. */
function eightIdeas(): StudyIdea[] {
  return NAMES.map((name, position) => idea(name, 1.9 - position * 0.05));
}

interface Duel {
  a: string;
  b: string;
}

/** Decisor de teste: registra cada duelo e responde pela regra dada. */
class ScriptedDecider implements DeciderClient {
  readonly duels: Duel[] = [];
  constructor(private readonly answer: (duel: Duel) => Record<string, unknown>) {}

  async ask(_state: string, questions: QuestionSet): Promise<DeciderAnswers> {
    const question = questions[DUEL_QUESTION_ID];
    if (question === undefined || question.type !== "choice") throw new Error("pergunta de duelo ausente");
    const duel = { a: question.criteria["A"] ?? "", b: question.criteria["B"] ?? "" };
    this.duels.push(duel);
    return { [DUEL_QUESTION_ID]: this.answer(duel) };
  }

  async queryProbes(): Promise<Record<string, number>> {
    return {};
  }
}

/** Força fixa por posição na lista: quem vem antes em `NAMES` perde para quem vem depois, salvo o favorito. */
function strength(text: string): number {
  if (text.startsWith("Fiado Digital")) return 100;
  const position = NAMES.findIndex((name) => text.startsWith(name));
  return position + 1;
}

function byStrength(duel: Duel): Record<string, unknown> {
  const a = strength(duel.a);
  const b = strength(duel.b);
  return { choice: a >= b ? "A" : "B", probabilities: { A: a > b ? 1 : 0, B: a > b ? 0 : 1 } };
}

function harness(seed = "estudo-a", fingerprint = "prov-1") {
  const handle = openMigratedDatabase(":memory:");
  const cache = new StudyCache(new SqliteCacheStore(handle.db));
  const cfg: StudyConfig = {
    ...resolveStudyConfig({ niche: "depósitos de bebidas", numIdeas: 8, mock: true }),
    cacheSeed: seed,
    providerFingerprint: fingerprint,
  };
  return { handle, cache, cfg };
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

describe("torneio suico", () => {
  test("rodadas: 8 ideias jogam 4 rodadas sem repetir adversario e fazem no maximo 32 duelos", async () => {
    const { handle, cache, cfg } = harness();
    const decider = new ScriptedDecider(byStrength);
    const outcome = await runTournament(cfg, eightIdeas(), { decider, cache });

    expect(outcome.tournament?.rounds).toBe(4);
    expect(outcome.tournament?.matches).toHaveLength(16);
    const pairs = new Set(outcome.tournament?.matches.map((match) => pairKey(match.a, match.b)));
    expect(pairs.size).toBe(16);
    expect(decider.duels.length).toBeLessThanOrEqual(32);
    for (const evaluated of outcome.ideas) expect(evaluated.tournament?.games).toBe(4);

    const ranked = rankIdeas(outcome.ideas);
    expect(ranked[0]?.name).toBe("Fiado Digital");
    expect(ranked[0]?.tournament).toEqual({ points: 4, games: 4, wins: 4, byes: 0, score: 1 });
    handle.sqlite.close();
  });

  test("rodadas: cada rodada emparelha ideias de media proxima", async () => {
    const { handle, cache, cfg } = harness();
    const outcome = await runTournament(cfg, eightIdeas(), {
      decider: new ScriptedDecider(byStrength),
      cache,
    });
    const matches = outcome.tournament?.matches ?? [];

    // Depois da rodada 1 cada ideia tem 1.0 ou 0.0; a rodada 2 só cruza ideias de mesma média.
    const afterFirst = new Map<string, number>();
    for (const match of matches.filter((item) => item.round === 1)) {
      afterFirst.set(match.a, match.pA);
      afterFirst.set(match.b, 1 - match.pA);
    }
    const second = matches.filter((match) => match.round === 2);
    expect(second).toHaveLength(4);
    for (const match of second) expect(afterFirst.get(match.a)).toBe(afterFirst.get(match.b));
    handle.sqlite.close();
  });

  test("vies de posicao: o decisor que sempre escolhe A deixa 0.5 para cada lado", async () => {
    const { handle, cache, cfg } = harness();
    const decider = new ScriptedDecider(() => ({ choice: "A", probabilities: { A: 1, B: 0 } }));
    const pair = [idea("Fiado Digital", 1.8), idea("Rota Certa", 1.7)];
    const outcome = await runTournament(cfg, pair, { decider, cache });

    // A mesma partida foi perguntada nas duas ordens.
    expect(decider.duels[0]?.a.startsWith("Fiado Digital")).toBe(true);
    expect(decider.duels[1]?.a.startsWith("Rota Certa")).toBe(true);
    for (const match of outcome.tournament?.matches ?? []) expect(match.pA).toBe(0.5);
    for (const evaluated of outcome.ideas) expect(evaluated.tournament?.score).toBe(0.5);
    handle.sqlite.close();
  });

  test("folga: com 3 ideias cada uma folga uma vez, sem partida nem ponto", async () => {
    const { handle, cache, cfg } = harness();
    const trio = [idea("Agenda Viva", 1.9), idea("Rota Certa", 1.8), idea("Gelo Garantido", 1.7)];
    const outcome = await runTournament(cfg, trio, { decider: new ScriptedDecider(byStrength), cache });
    const tournament = outcome.tournament;

    expect(tournament?.rounds).toBe(3);
    expect(tournament?.byes).toHaveLength(3);
    expect(new Set(tournament?.byes.map((bye) => bye.idea)).size).toBe(3);
    // Na rodada 1 todos empatam em zero: a pior posição de semente (menor índice) folga.
    expect(tournament?.byes[0]?.idea).toBe("id-Gelo Garantido");
    for (const evaluated of outcome.ideas) {
      expect(evaluated.tournament?.byes).toBe(1);
      expect(evaluated.tournament?.games).toBe(2);
    }
    // A folga não soma ponto: cada partida distribui exatamente 1 ponto.
    const points = outcome.ideas.reduce((total, item) => total + (item.tournament?.points ?? 0), 0);
    expect(points).toBe(tournament?.matches.length ?? -1);
    handle.sqlite.close();
  });

  test("repete a partida de menor diferenca quando nao ha combinacao livre", async () => {
    const { handle, cache, cfg } = harness();
    const decider = new ScriptedDecider(byStrength);
    const outcome = await runTournament(cfg, [idea("Agenda Viva", 1.9), idea("Rota Certa", 1.8)], {
      decider,
      cache,
    });
    expect(outcome.tournament?.rounds).toBe(2);
    expect(outcome.tournament?.matches).toHaveLength(2);
    // A repetição vem do cache: as duas ordens só foram perguntadas uma vez.
    expect(decider.duels).toHaveLength(2);
    handle.sqlite.close();
  });

  test("sem probabilidade: a choice vale 1 e a resposta vazia conta 0.5 com issue", async () => {
    const choiceOnly = harness();
    const pair = [idea("Agenda Viva", 1.9), idea("Fiado Digital", 1.8)];
    const chosen = await runTournament(choiceOnly.cfg, pair, {
      decider: new ScriptedDecider((duel) => ({ choice: duel.a.startsWith("Fiado") ? "A" : "B" })),
      cache: choiceOnly.cache,
    });
    expect(rankIdeas(chosen.ideas)[0]?.tournament?.score).toBe(1);
    expect(chosen.tournament?.issues).toEqual([]);
    choiceOnly.handle.sqlite.close();

    const empty = harness();
    const silent = await runTournament(empty.cfg, pair, {
      decider: new ScriptedDecider(() => ({})),
      cache: empty.cache,
    });
    for (const match of silent.tournament?.matches ?? []) expect(match.pA).toBe(0.5);
    expect(silent.tournament?.issues.length).toBeGreaterThan(0);
    expect(silent.tournament?.issues[0]).toContain("sem probabilidade");
    empty.handle.sqlite.close();
  });

  test("cache: a segunda execucao nao chama o decisor e cada ordem tem chave propria", async () => {
    const { handle, cache, cfg } = harness();
    const pair = [idea("Agenda Viva", 1.9), idea("Rota Certa", 1.8)];
    const first = new ScriptedDecider(byStrength);
    await runTournament(cfg, pair, { decider: first, cache });
    // Uma partida, duas ordens: duas chaves distintas no cache.
    expect(await cache.count()).toBe(2);

    const again = new ScriptedDecider(byStrength);
    await runTournament(cfg, pair, { decider: again, cache });
    expect(again.duels).toHaveLength(0);

    // Outra semente ou outra impressão de provedor nunca reaproveita a resposta.
    const otherStudy = new ScriptedDecider(byStrength);
    await runTournament({ ...cfg, cacheSeed: "estudo-b" }, pair, { decider: otherStudy, cache });
    expect(otherStudy.duels).toHaveLength(2);
    const otherProvider = new ScriptedDecider(byStrength);
    await runTournament({ ...cfg, providerFingerprint: "prov-2" }, pair, { decider: otherProvider, cache });
    expect(otherProvider.duels).toHaveLength(2);
    handle.sqlite.close();
  });

  test("uma ideia nao roda torneio e fica sem pontos", async () => {
    const { handle, cache, cfg } = harness();
    const decider = new ScriptedDecider(byStrength);
    const outcome = await runTournament(cfg, [idea("Agenda Viva", 1.9)], { decider, cache });
    expect(outcome.tournament).toBeNull();
    expect(outcome.ideas[0]?.tournament ?? null).toBeNull();
    expect(decider.duels).toHaveLength(0);
    handle.sqlite.close();
  });

  test("remover ideia recalcula as medias das partidas restantes", async () => {
    const { handle, cache, cfg } = harness();
    const outcome = await runTournament(cfg, eightIdeas(), {
      decider: new ScriptedDecider(byStrength),
      cache,
    });
    const removed = "id-Fiado Digital";
    const after = dropFromTournament(outcome.ideas, outcome.tournament, removed);

    expect(after.ideas.map((item) => item.id)).not.toContain(removed);
    const remaining = after.tournament?.matches ?? [];
    expect(remaining.some((match) => match.a === removed || match.b === removed)).toBe(false);
    expect(remaining).toHaveLength(12);
    for (const evaluated of after.ideas) {
      const played = remaining.filter((match) => match.a === evaluated.id || match.b === evaluated.id);
      expect(evaluated.tournament?.games).toBe(played.length);
    }
    // Com uma ideia só sobrando, não há torneio.
    const lonely = dropFromTournament(
      [idea("Agenda Viva", 1.9), idea("Rota Certa", 1.8)],
      null,
      "id-Rota Certa",
    );
    expect(lonely.tournament).toBeNull();
    handle.sqlite.close();
  });
});
