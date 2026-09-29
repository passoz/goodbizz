/**
 * SQLite response cache adapter. Values are stored as JSON; a corrupted row is treated as a
 * cache miss so a bad entry can never break a study.
 */
import { count, eq } from "drizzle-orm";

import type { Db } from "./db.ts";
import { cacheEntries } from "./schema.ts";
import type { CacheStore } from "../domain/ports.ts";

export class SqliteCacheStore implements CacheStore {
  private readonly db: Db;
  private hitCount = 0;

  constructor(db: Db) {
    this.db = db;
  }

  async get(key: string): Promise<unknown | null> {
    const row = this.db
      .select({ valueJson: cacheEntries.valueJson })
      .from(cacheEntries)
      .where(eq(cacheEntries.key, key))
      .get();
    if (!row) return null;
    let value: unknown;
    try {
      value = JSON.parse(row.valueJson);
    } catch {
      return null;
    }
    this.hitCount += 1;
    return value;
  }

  async put(key: string, value: unknown): Promise<void> {
    const valueJson = JSON.stringify(value) ?? "null";
    const createdAt = new Date().toISOString();
    this.db
      .insert(cacheEntries)
      .values({ key, valueJson, createdAt })
      .onConflictDoUpdate({
        target: cacheEntries.key,
        set: { valueJson, createdAt },
      })
      .run();
  }

  async count(): Promise<number> {
    const row = this.db.select({ total: count() }).from(cacheEntries).get();
    return row ? row.total : 0;
  }

  hits(): number {
    return this.hitCount;
  }
}
