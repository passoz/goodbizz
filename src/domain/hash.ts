/**
 * Deterministic hashing shared by the mock adapters and the response cache.
 */
import { createHash } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Cache key of a call: hash of the joined parameters, truncated like the baseline. */
export function cacheKey(...parts: string[]): string {
  return sha256Hex(parts.join("|")).slice(0, 24);
}

/** Stable 0..1 ratio derived from a digest; used by the deterministic decider mock. */
export function ratioFromDigest(seed: string, ...parts: string[]): number {
  const digest = createHash("sha256")
    .update([seed, ...parts].join("|"))
    .digest();
  return Math.round((digest.readUInt32BE(0) / 0xffffffff) * 100) / 100;
}
