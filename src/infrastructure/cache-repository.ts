/**
 * SQLite response cache adapter. Values are stored as JSON; a corrupted row is treated as a
 * cache miss so a bad entry can never break a study.
 */
import { count, eq, like } from "drizzle-orm";

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

  /**
   * Remove as entradas do escopo. O escopo é o id do estudo (UUIDv7: hexadecimal e hífens), então
   * nenhum curinga do `LIKE` aparece nele — não há o que escapar.
   */
  async purge(scope: string): Promise<number> {
    if (scope === "") return 0;
    const matches = like(cacheEntries.key, `${scope}::%`);
    const row = this.db.select({ total: count() }).from(cacheEntries).where(matches).get();
    const removed = row ? row.total : 0;
    if (removed === 0) return 0;
    this.db.delete(cacheEntries).where(matches).run();
    return removed;
  }

  async count(): Promise<number> {
    const row = this.db.select({ total: count() }).from(cacheEntries).get();
    return row ? row.total : 0;
  }

  hits(): number {
    return this.hitCount;
  }
}
