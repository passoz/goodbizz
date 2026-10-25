/**
 * Torneio par a par no decisor (esqueleto do Work 0017, task 1.1).
 *
 * Ainda sem torneio: a ordem continua pelo índice de ação e nenhuma partida é disputada.
 */
import type { DeciderClient } from "../domain/ports.ts";
import type { IdeaEvaluation, QuestionSet, StudyConfig, StudyIdea } from "../domain/types.ts";
import type { StudyCache } from "./cache.ts";

export const DUEL_QUESTION_ID = "duelo";

export function tournamentRounds(count: number): number {
  void count;
  return 0;
}

export function duelQuestions(first: IdeaEvaluation, second: IdeaEvaluation): QuestionSet {
  void first;
  void second;
  return {};
}

export function duelProbability(answer: unknown): number | null {
  void answer;
  return null;
}

export function compareRanking(left: IdeaEvaluation, right: IdeaEvaluation): number {
  return right.index - left.index;
}

export function rankIdeas<T extends IdeaEvaluation>(ideas: readonly T[]): T[] {
  return [...ideas].sort(compareRanking);
}

export interface TournamentDeps {
  decider: DeciderClient;
  cache: StudyCache;
  onProgress?: (step: string) => void;
}

export interface TournamentOutcome {
  ideas: StudyIdea[];
  tournament: null;
}

export async function runTournament(
  cfg: StudyConfig,
  ideas: readonly StudyIdea[],
  deps: TournamentDeps,
): Promise<TournamentOutcome> {
  void cfg;
  void deps;
  return { ideas: [...ideas], tournament: null };
}

export function dropFromTournament(
  ideas: readonly StudyIdea[],
  tournament: unknown,
  removedId: string,
): TournamentOutcome {
  void tournament;
  return { ideas: ideas.filter((idea) => idea.id !== removedId), tournament: null };
}
