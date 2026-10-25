/**
 * Torneio na remoção e na adição de ideias (Work 0017, task 1.6): a remoção recalcula as médias
 * das partidas restantes sem chamar o decisor, e a adição roda o torneio de novo servindo do cache
 * toda partida já disputada.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";

import { StudyCache } from "../src/application/cache.ts";
import { StudyService } from "../src/application/study-service.ts";
import { DUEL_QUESTION_ID } from "../src/application/tournament.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import type { DeciderAnswers, QuestionSet, StudyRecord } from "../src/domain/types.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase, type DatabaseHandle } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { silentLogger, tempDir } from "./helpers.ts";

/** Decisor simulado que conta as perguntas de duelo. */
class CountingDecider extends DeciderMock {
  duels = 0;
  override async ask(state: string, questions: QuestionSet): Promise<DeciderAnswers> {
    if (DUEL_QUESTION_ID in questions) this.duels += 1;
    return super.ask(state, questions);
  }
}

let db: DatabaseHandle;
let decider: CountingDecider;
let service: StudyService;

beforeEach(() => {
  db = openMigratedDatabase(":memory:");
  decider = new CountingDecider();
  service = new StudyService({
    repo: new SqliteStudyRepository(db.db),
    cache: new StudyCache(new SqliteCacheStore(db.db)),
    llm: new LlmMock(),
    decider,
    logger: silentLogger(),
    artifactsRoot: tempDir("goodbizz-torneio-estudo-"),
  });
});

afterEach(() => {
  db.sqlite.close();
});

async function studyWith(count: number): Promise<StudyRecord> {
  const created = await service.create(
    resolveStudyConfig({ niche: "depósitos de bebidas", numIdeas: count, mock: true }),
  );
  return service.run(created.id);
}

function pairOf(a: string, b: string): string {
  return [a, b].sort().join("|");
}

/** Cada ideia jogou exatamente as partidas restantes em que aparece. */
function expectStandingsMatch(record: StudyRecord): void {
  const matches = record.summary?.tournament?.matches ?? [];
  for (const idea of record.evaluations) {
    const played = matches.filter((match) => match.a === idea.id || match.b === idea.id);
    const points = played.reduce(
      (total, match) => total + (match.a === idea.id ? match.pA : 1 - match.pA),
      0,
    );
    expect(idea.tournament?.games).toBe(played.length);
    expect(idea.tournament?.points).toBeCloseTo(points, 2);
  }
}

/** As pastas no disco seguem a ordem gravada, de 01 em diante. */
function expectFoldersFollowRanking(record: StudyRecord): void {
  const folders = readdirSync(record.artifactDir)
    .filter((entry) => /^\d\d-/.test(entry))
    .sort();
  expect(folders).toHaveLength(record.evaluations.length);
  expect(record.summary?.ordered.map((idea) => idea.id)).toEqual(record.evaluations.map((idea) => idea.id));
  folders.forEach((folder, position) =>
    expect(folder.startsWith(String(position + 1).padStart(2, "0"))).toBe(true),
  );
}

describe("torneio na remocao e na adicao", () => {
  test("remocao: zero duelos e medias recalculadas sem as partidas da ideia excluida", async () => {
    const study = await studyWith(6);
    const removed = study.summary?.ordered[0];
    expect(removed).toBeDefined();
    const before = decider.duels;

    const after = await service.removeIdea(study.id, removed?.id ?? "");
    expect(decider.duels).toBe(before);

    const matches = after.summary?.tournament?.matches ?? [];
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.some((match) => match.a === removed?.id || match.b === removed?.id)).toBe(false);
    expectStandingsMatch(after);
    expectFoldersFollowRanking(after);
  });

  test("remocao seguida de adicao: toda partida ja disputada vem do cache", async () => {
    const study = await studyWith(5);
    const oldPairs = new Set(
      (study.summary?.tournament?.matches ?? []).map((match) => pairOf(match.a, match.b)),
    );

    const removed = await service.removeIdea(study.id, study.summary?.ordered[4]?.id ?? "");
    expect(removed.summary?.tournament?.matches.length).toBeGreaterThan(0);
    expectStandingsMatch(removed);

    const before = decider.duels;
    const added = await service.addIdeas(study.id, 2);
    const asked = decider.duels - before;

    const newPairs = new Set(
      (added.summary?.tournament?.matches ?? [])
        .map((match) => pairOf(match.a, match.b))
        .filter((pair) => !oldPairs.has(pair)),
    );
    // Só as partidas inéditas chamam o decisor, duas vezes cada (as duas ordens).
    expect(asked).toBe(newPairs.size * 2);
    expect(added.evaluations).toHaveLength(6);
    expect(added.evaluations.every((idea) => (idea.tournament?.games ?? 0) > 0)).toBe(true);
    expectStandingsMatch(added);
    expectFoldersFollowRanking(added);
  });
});
