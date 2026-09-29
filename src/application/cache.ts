/**
 * Application-level cache wrapper: read-through with a `wrap` helper and a live hit counter.
 */
import type { CacheStore } from "../domain/ports.ts";
import { cacheKey } from "../domain/hash.ts";

/** Re-export of the domain cache key so application code has a single import point. */
export const cacheKeyFor = cacheKey;

export class StudyCache {
  private readonly store: CacheStore;
  private localHits = 0;

  constructor(store: CacheStore) {
    this.store = store;
  }

  /** Hits observed by the store plus hits served when the store does not track them. */
  get hits(): number {
    return this.store.hits() + this.localHits;
  }

  async get<T>(key: string): Promise<T | null> {
    const before = this.store.hits();
    const value = await this.store.get(key);
    if (value === null) return null;
    if (this.store.hits() === before) this.localHits += 1;
    return value as T;
  }

  async put(key: string, value: unknown): Promise<void> {
    await this.store.put(key, value);
  }

  async count(): Promise<number> {
    return this.store.count();
  }

  async wrap<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await compute();
    await this.put(key, value);
    return value;
  }
}
