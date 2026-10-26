/**
 * Torneio par a par no decisor.
 *
 * As notas absolutas do decisor saem quase iguais para todas as ideias; a comparação direta separa.
 * Depois da avaliação, um torneio suíço de teto(log2 N) + 1 rodadas emparelha ideias de média
 * próxima que ainda não se enfrentaram. Cada partida pergunta o duelo nas duas ordens de
 * apresentação e a ideia X recebe a média das duas probabilidades de ser escolhida, o que anula o
 * viés de posição. O ranking segue a média de pontos por partida; índice e tier não mudam.
 */
import { roundTo } from "./pain-algorithm.ts";
import { scopedKey } from "./cache.ts";
import type { StudyCache } from "./cache.ts";
import { studyContext } from "../config/runtime.ts";
import type { DeciderClient } from "../domain/ports.ts";
import type {
  IdeaEvaluation,
  QuestionSet,
  RankedEvaluation,
  StudyConfig,
  StudyIdea,
  StudyTournament,
  TournamentBye,
  TournamentMatch,
  TournamentStanding,
} from "../domain/types.ts";

/** Id da pergunta de duelo no envelope do decisor. */
export const DUEL_QUESTION_ID = "duelo";

const DUEL_INSTRUCTIONS = "Qual destas duas soluções o dono deste negócio contrata primeiro?";

/** Teto de passos da busca de emparelhamento sem repetição antes de cair no guloso. */
const PAIRING_SEARCH_LIMIT = 20_000;

/** Rodadas do torneio: teto de log2 do número de ideias mais 1; abaixo de 2 ideias não há torneio. */
export function tournamentRounds(count: number): number {
  return count < 2 ? 0 : Math.ceil(Math.log2(count)) + 1;
}

/** Texto de uma opção do duelo: nome e descrição, como o decisor vê a ideia. */
function optionText(idea: IdeaEvaluation): string {
  return `${idea.name} — ${idea.description}`;
}

/** Pergunta `choice` do duelo: `first` é a opção A e `second` a opção B. */
export function duelQuestions(first: IdeaEvaluation, second: IdeaEvaluation): QuestionSet {
  return {
    [DUEL_QUESTION_ID]: {
      type: "choice",
      instructions: DUEL_INSTRUCTIONS,
      criteria: { A: optionText(first), B: optionText(second) },
    },
  };
}

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Probabilidade de a opção A ser escolhida numa resposta de duelo.
 *
 * `probabilities` (ou `probs`) é normalizado entre A e B; sem ele, a `choice` vale 1 para a opção
 * escolhida. Sem nenhum dos dois, devolve `null` e quem chama conta 0.5 para cada lado.
 */
export function duelProbability(answer: unknown): number | null {
  if (!answer || typeof answer !== "object" || Array.isArray(answer)) return null;
  const record = answer as Record<string, unknown>;
  for (const key of ["probabilities", "probs"]) {
    const map = record[key];
    if (!map || typeof map !== "object" || Array.isArray(map)) continue;
    const a = finiteOrNull((map as Record<string, unknown>)["A"]);
    const b = finiteOrNull((map as Record<string, unknown>)["B"]);
    if (a !== null && b !== null) {
      // Probabilidades zeradas nas duas opções não dizem nada: a `choice` decide.
      if (a + b > 0) return roundTo(a / (a + b), 4);
      continue;
    }
    if (a !== null) return roundTo(Math.min(1, Math.max(0, a)), 4);
    if (b !== null) return roundTo(Math.min(1, Math.max(0, 1 - b)), 4);
  }
  const choice = typeof record["choice"] === "string" ? record["choice"].trim().toUpperCase() : "";
  if (choice === "A") return 1;
  if (choice === "B") return 0;
  return null;
}

/** Ordem de semente: índice de ação decrescente, depois nome. */
function compareSeed(left: IdeaEvaluation, right: IdeaEvaluation): number {
  if (left.index !== right.index) return right.index - left.index;
  return left.name.localeCompare(right.name, "pt-BR");
}

/**
 * Ordem do ranking: média de pontos por partida no torneio, depois índice de ação, depois nome.
 * Ideia sem torneio (estudo antigo, ideia única) vem depois das que jogaram e segue o índice.
 */
export function compareRanking(left: RankedEvaluation, right: RankedEvaluation): number {
  const l = left.tournament ?? null;
  const r = right.tournament ?? null;
  if (l !== null && r !== null && l.score !== r.score) return r.score - l.score;
  if (l !== null && r === null) return -1;
  if (l === null && r !== null) return 1;
  return compareSeed(left, right);
}

/** Cópia ordenada pelo ranking (`compareRanking`). */
export function rankIdeas<T extends RankedEvaluation>(ideas: readonly T[]): T[] {
  return [...ideas].sort(compareRanking);
}

export interface TournamentDeps {
  decider: DeciderClient;
  cache: StudyCache;
  onProgress?: (step: string) => void;
}

export interface TournamentOutcome {
  /** As ideias na ordem de entrada, cada uma com o `tournament` recalculado. */
  ideas: StudyIdea[];
  tournament: StudyTournament | null;
}

interface Entry {
  idea: StudyIdea;
  seed: number;
  points: number;
  games: number;
}

function average(entry: Entry): number {
  return entry.games > 0 ? entry.points / entry.games : 0;
}

function pairId(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

/** Adversários de `first` do mais próximo para o mais distante em média; empate pela posição. */
function byCloseness(first: Entry, rest: readonly Entry[]): Entry[] {
  const target = average(first);
  return rest
    .map((entry, position) => ({ entry, position, gap: Math.abs(average(entry) - target) }))
    .sort((left, right) => left.gap - right.gap || left.position - right.position)
    .map((item) => item.entry);
}

/** Busca em profundidade de um emparelhamento sem partida repetida; `null` se não houver (ou estourar o teto). */
function pairWithoutRepeat(
  pool: readonly Entry[],
  played: ReadonlySet<string>,
  budget: { steps: number },
): Array<[Entry, Entry]> | null {
  const [first, ...rest] = pool;
  if (first === undefined) return [];
  for (const candidate of byCloseness(first, rest)) {
    if (played.has(pairId(first.idea.id, candidate.idea.id))) continue;
    budget.steps -= 1;
    if (budget.steps < 0) return null;
    const tail = pairWithoutRepeat(
      rest.filter((entry) => entry !== candidate),
      played,
      budget,
    );
    if (tail !== null) return [[first, candidate], ...tail];
  }
  return null;
}

/**
 * Sem emparelhamento livre, cada ideia pega o adversário mais próximo que ainda não enfrentou e,
 * se já enfrentou todos, repete a partida de menor diferença de média. Nunca trava.
 */
function pairAllowingRepeat(pool: readonly Entry[], played: ReadonlySet<string>): Array<[Entry, Entry]> {
  const left = [...pool];
  const pairs: Array<[Entry, Entry]> = [];
  while (left.length >= 2) {
    const first = left.shift() as Entry;
    const options = byCloseness(first, left);
    const pick =
      options.find((option) => !played.has(pairId(first.idea.id, option.idea.id))) ?? (options[0] as Entry);
    left.splice(left.indexOf(pick), 1);
    pairs.push([first, pick]);
  }
  return pairs;
}

/** Pergunta uma ordem do duelo, com cache por semente, provedor, nomes, descrições e ordem. */
async function askDuel(
  cfg: StudyConfig,
  first: StudyIdea,
  second: StudyIdea,
  deps: TournamentDeps,
): Promise<number | null> {
  const key = scopedKey(
    cfg.cacheSeed,
    "duelo",
    cfg.providerFingerprint ?? "",
    cfg.niche,
    cfg.city,
    first.name,
    first.description,
    second.name,
    second.description,
  );
  let answer = await deps.cache.get<unknown>(key);
  if (answer === null) {
    const state = `${studyContext(cfg)}\nComparação direta entre duas ideias de produto para o mesmo dono.`;
    const answers = await deps.decider.ask(state, duelQuestions(first, second));
    answer = answers[DUEL_QUESTION_ID] ?? {};
    await deps.cache.put(key, answer);
  }
  return duelProbability(answer);
}

/** Uma partida nas duas ordens. Devolve a probabilidade média de `x` e os duelos sem resposta. */
async function playMatch(
  cfg: StudyConfig,
  x: StudyIdea,
  y: StudyIdea,
  deps: TournamentDeps,
): Promise<{ pX: number; issues: string[] }> {
  const issues: string[] = [];
  const unusable = (a: StudyIdea, b: StudyIdea) =>
    `Duelo "${a.name}" (A) × "${b.name}" (B): o decisor respondeu sem probabilidade nem escolha; ` +
    "contou 0.5 para cada lado.";
  const xFirst = await askDuel(cfg, x, y, deps);
  if (xFirst === null) issues.push(unusable(x, y));
  const yFirst = await askDuel(cfg, y, x, deps);
  if (yFirst === null) issues.push(unusable(y, x));
  const pX = ((xFirst ?? 0.5) + (yFirst === null ? 0.5 : 1 - yFirst)) / 2;
  return { pX: roundTo(pX, 4), issues };
}

/** Pontos, partidas, vitórias e folgas de cada ideia, a partir das partidas e folgas gravadas. */
function standingsOf(
  ideas: readonly StudyIdea[],
  matches: readonly TournamentMatch[],
  byes: readonly TournamentBye[],
): Map<string, TournamentStanding> {
  const table = new Map<string, { points: number; games: number; wins: number; byes: number }>();
  for (const idea of ideas) table.set(idea.id, { points: 0, games: 0, wins: 0, byes: 0 });
  const credit = (id: string, value: number) => {
    const row = table.get(id);
    if (row === undefined) return;
    row.points += value;
    row.games += 1;
    if (value > 0.5) row.wins += 1;
  };
  for (const match of matches) {
    credit(match.a, match.pA);
    credit(match.b, roundTo(1 - match.pA, 4));
  }
  for (const bye of byes) {
    const row = table.get(bye.idea);
    if (row !== undefined) row.byes += 1;
  }
  const standings = new Map<string, TournamentStanding>();
  for (const [id, row] of table) {
    standings.set(id, {
      points: roundTo(row.points, 3),
      games: row.games,
      wins: row.wins,
      byes: row.byes,
      score: row.games > 0 ? roundTo(row.points / row.games, 3) : 0,
    });
  }
  return standings;
}

function withStandings(ideas: readonly StudyIdea[], tournament: StudyTournament | null): StudyIdea[] {
  if (tournament === null) return ideas.map((idea) => ({ ...idea, tournament: null }));
  const standings = standingsOf(ideas, tournament.matches, tournament.byes);
  return ideas.map((idea) => ({ ...idea, tournament: standings.get(idea.id) ?? null }));
}

/**
 * Roda o torneio suíço sobre as ideias. Partidas de uma rodada correm em paralelo até
 * `cfg.concurrency`; as duas ordens de uma partida são perguntadas em sequência. Falha do decisor
 * sobe como no resto do pipeline, e a retomada reaproveita do cache os duelos já respondidos.
 */
export async function runTournament(
  cfg: StudyConfig,
  ideas: readonly StudyIdea[],
  deps: TournamentDeps,
): Promise<TournamentOutcome> {
  const rounds = tournamentRounds(ideas.length);
  if (rounds === 0) return { ideas: withStandings(ideas, null), tournament: null };

  const seeds = [...ideas].sort(compareSeed);
  const entries: Entry[] = seeds.map((idea, seed) => ({ idea, seed, points: 0, games: 0 }));
  const played = new Set<string>();
  const byeTaken = new Set<string>();
  const matches: TournamentMatch[] = [];
  const byes: TournamentBye[] = [];
  const issues: string[] = [];

  for (let round = 1; round <= rounds; round++) {
    const ordered = [...entries].sort(
      (left, right) => average(right) - average(left) || left.seed - right.seed,
    );
    let pool = ordered;
    if (ordered.length % 2 === 1) {
      // A folga vai para a pior posição que ainda não folgou: ela não joga nem pontua.
      const resting = [...ordered].reverse().find((entry) => !byeTaken.has(entry.idea.id)) ?? ordered.at(-1);
      const bye = resting as Entry;
      byeTaken.add(bye.idea.id);
      byes.push({ round, idea: bye.idea.id, name: bye.idea.name });
      pool = ordered.filter((entry) => entry !== bye);
    }

    const pairs =
      pairWithoutRepeat(pool, played, { steps: PAIRING_SEARCH_LIMIT }) ?? pairAllowingRepeat(pool, played);
    deps.onProgress?.(
      `[3/6] Torneio par a par: rodada ${round} de ${rounds}, ${pairs.length} partidas perguntadas nas duas ordens`,
    );

    const results: Array<{ pX: number; issues: string[] }> = new Array(pairs.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(Math.max(1, cfg.concurrency), pairs.length) }, async () => {
      for (let index = cursor++; index < pairs.length; index = cursor++) {
        const [x, y] = pairs[index] as [Entry, Entry];
        results[index] = await playMatch(cfg, x.idea, y.idea, deps);
      }
    });
    await Promise.all(workers);

    pairs.forEach(([x, y], index) => {
      const result = results[index] as { pX: number; issues: string[] };
      matches.push({
        round,
        a: x.idea.id,
        b: y.idea.id,
        aName: x.idea.name,
        bName: y.idea.name,
        pA: result.pX,
      });
      issues.push(...result.issues);
      played.add(pairId(x.idea.id, y.idea.id));
      x.points += result.pX;
      x.games += 1;
      y.points += 1 - result.pX;
      y.games += 1;
    });
  }

  const tournament: StudyTournament = { rounds, matches, byes, issues };
  return { ideas: withStandings(ideas, tournament), tournament };
}

/**
 * Tira uma ideia do torneio sem chamar o decisor: as partidas e a folga dela saem e as médias das
 * outras são recalculadas das partidas restantes. Com menos de 2 ideias, não sobra torneio.
 */
export function dropFromTournament(
  ideas: readonly StudyIdea[],
  tournament: StudyTournament | null | undefined,
  removedId: string,
): TournamentOutcome {
  const remaining = ideas.filter((idea) => idea.id !== removedId);
  if (tournament === null || tournament === undefined || remaining.length < 2) {
    return { ideas: withStandings(remaining, null), tournament: null };
  }
  const next: StudyTournament = {
    rounds: tournament.rounds,
    matches: tournament.matches.filter((match) => match.a !== removedId && match.b !== removedId),
    byes: tournament.byes.filter((bye) => bye.idea !== removedId),
    issues: [...tournament.issues],
  };
  return { ideas: withStandings(remaining, next), tournament: next };
}
