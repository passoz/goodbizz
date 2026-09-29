/**
 * Shared test helpers: an isolated service wired to in-memory SQLite and the deterministic mocks.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StudyCache } from "../src/application/cache.ts";
import { StudyService } from "../src/application/study-service.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { openMigratedDatabase, type DatabaseHandle } from "../src/infrastructure/db.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import type { Logger } from "../src/domain/ports.ts";

/** Fresh temp directory per call, so tests never share artifact trees. */
export function tempDir(prefix = "goodbizz-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Logger that stays silent, keeping test output readable. */
export function silentLogger(): Logger {
  return { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
}

export interface TestHarness {
  service: StudyService;
  db: DatabaseHandle;
  artifactsRoot: string;
  close(): void;
}

/** Service wired to `:memory:` SQLite, the deterministic mocks and a temp artifact root. */
export function makeHarness(): TestHarness {
  const db = openMigratedDatabase(":memory:");
  const artifactsRoot = tempDir("goodbizz-artifacts-");
  const service = new StudyService({
    repo: new SqliteStudyRepository(db.db),
    cache: new StudyCache(new SqliteCacheStore(db.db)),
    llm: new LlmMock(),
    decider: new DeciderMock(),
    logger: silentLogger(),
    artifactsRoot,
  });
  return {
    service,
    db,
    artifactsRoot,
    close: () => db.sqlite.close(),
  };
}
