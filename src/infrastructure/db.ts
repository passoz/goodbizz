/**
 * SQLite client and migration runner.
 *
 * Rule of the stack: no data access writes raw SQL. Tables live in `schema.ts` and migrations
 * under `drizzle/` are produced by `drizzle-kit generate`, never by hand.
 */
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { drizzle, type BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";

import { schema } from "./schema.ts";

export { schema } from "./schema.ts";
export { cacheEntries, evaluations, studies } from "./schema.ts";

export type Db = BunSQLiteDatabase<typeof schema>;

export interface DatabaseHandle {
  sqlite: Database;
  db: Db;
}

/** Open a SQLite database (`:memory:` for tests) wired to Drizzle. */
export function openDatabase(url: string): DatabaseHandle {
  const sqlite = new Database(url);
  if (url !== ":memory:") {
    sqlite.exec("PRAGMA journal_mode = WAL;");
  }
  sqlite.exec("PRAGMA foreign_keys = ON;");
  return { sqlite, db: drizzle(sqlite, { schema }) };
}

/**
 * Apply every generated migration that has not been applied yet. `--> statement-breakpoint` is a
 * SQL comment, so a whole file can be handed to `exec`. An applied-migrations table makes a second
 * boot on the same database a no-op instead of a failure.
 */
export function runMigrations(handle: DatabaseHandle, dir = "drizzle"): string[] {
  let files: string[];
  try {
    files = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
  } catch {
    return [];
  }

  const sqlite = handle.sqlite;
  sqlite.exec(
    "CREATE TABLE IF NOT EXISTS __migrations (name text PRIMARY KEY NOT NULL, applied_at text NOT NULL);",
  );
  const appliedRows = sqlite.query("SELECT name FROM __migrations").all() as Array<{ name: string }>;
  const applied = new Set(appliedRows.map((row) => row.name));

  const executed: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    sqlite.exec(readFileSync(join(dir, file), "utf8"));
    sqlite
      .prepare("INSERT INTO __migrations (name, applied_at) VALUES (?, ?)")
      .run(file, new Date().toISOString());
    executed.push(file);
  }
  return executed;
}

/** Convenience for tests and the CLI: open, migrate, hand back the handle. */
export function openMigratedDatabase(url: string, dir = "drizzle"): DatabaseHandle {
  const handle = openDatabase(url);
  runMigrations(handle, dir);
  return handle;
}

/** Apply the migrations to the database named by the environment; returns the applied files. */
export function migrateFromEnvironment(options: { url?: string; dir?: string } = {}): string[] {
  const url = options.url ?? Bun.env.DATABASE_URL ?? "app.db";
  const handle = openDatabase(url);
  try {
    return runMigrations(handle, options.dir ?? "drizzle");
  } finally {
    handle.sqlite.close();
  }
}
