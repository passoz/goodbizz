/**
 * Application-level cache wrapper: read-through with a `wrap` helper and a live hit counter.
 */
import type { CacheStore } from "../domain/ports.ts";
import { cacheKey } from "../domain/hash.ts";

/** Re-export of the domain cache key só application code has a single import point. */
export const cacheKeyFor = cacheKey;

/** Separador entre a semente do estudo e o hash dos parâmetros. */
export const CACHE_SCOPE_SEPARATOR = "::";

/**
 * Chave de cache escopada: `semente::hash`.
 *
 * A semente é o id do estudo. Sem ela a chave é o hash puro (CLI de tiro único), e é o escopo que
 * garante que dois estudos de mesmo título nunca compartilhem resposta.
 */
export function scopedKey(seed: string, ...parts: string[]): string {
  const hash = cacheKeyFor(...parts);
  return seed === "" ? hash : `${seed}${CACHE_SCOPE_SEPARATOR}${hash}`;
}

export class StudyCache {
  /** Port exposto para as operações que não têm estado próprio, como a purga de um estudo. */
  readonly store: CacheStore;
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
