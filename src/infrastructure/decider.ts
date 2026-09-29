/**
 * Decider client (System One) compatible with any provider (Jev, Laya, local) + mock mode.
 *
 * Works with any endpoint implementing the System One standard:
 *     POST {url}
 *     {"state": ..., "model": ...,
 *      "questions": {"id": {"type": "noul|choice|score", "instructions": ..., "criteria": ...}}}
 *     -> {"answers": {"id": {...}}}
 *
 * Portado de goodbizz/decider.py (DeciderHttp, normalize_url, extract_answers,
 * extract_probability, build).
 */
import type { DeciderClient } from "../domain/ports.ts";
import type { DeciderAnswers, QuestionSet, StudyConfig } from "../domain/types.ts";
import { DeciderError } from "../domain/errors.ts";
import { scrub } from "../config/redact.ts";
import { DeciderMock } from "./decider-mock.ts";

/** Ensure the URL points to a valid System One endpoint. */
export function normalizeDeciderUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  let path = "";
  try {
    path = new URL(trimmed).pathname;
  } catch {
    path = "";
  }
  if (!path || path === "/") return `${trimmed}/v1/systemone`;
  if (path.endsWith("/v1")) return `${trimmed}/systemone`;
  return trimmed;
}

/** Extract the answers dictionary tolerating multiple envelope structures. */
export function extractAnswers(body: unknown, questions?: QuestionSet): DeciderAnswers {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    const kind = body === null ? "null" : Array.isArray(body) ? "array" : typeof body;
    throw new DeciderError(`decider response is not a valid JSON object: ${kind}`);
  }
  const obj = body as Record<string, unknown>;
  for (const key of ["answers", "results", "data", "questions", "decisions"] as const) {
    const value = obj[key];
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return value as DeciderAnswers;
    }
  }
  // If question IDs were returned directly at the root level:
  if (questions && Object.keys(questions).some((qid) => qid in obj)) {
    const projected: DeciderAnswers = {};
    for (const [qid, value] of Object.entries(obj)) {
      if (!(qid in questions)) continue;
      const kind = typeof value;
      if (kind === "object" || kind === "number" || kind === "string") {
        projected[qid] = value as DeciderAnswers[string];
      }
    }
    return projected;
  }
  throw new DeciderError(
    "decider response without recognized answers envelope ('answers', 'results', 'data'): " +
      JSON.stringify(Object.keys(obj).slice(0, 10)),
  );
}

/** Extract probability of 'yes' from a bool/noul response from any provider. */
export function extractProbability(response: unknown): number {
  if (typeof response === "number") return response;
  if (response !== null && typeof response === "object" && !Array.isArray(response)) {
    const obj = response as Record<string, unknown>;
    for (const field of [
      "noul",
      "bool",
      "probability",
      "probabilidade",
      "p",
      "score",
      "value",
      "act_probability",
    ] as const) {
      if (!(field in obj)) continue;
      const value = obj[field];
      if (typeof value === "boolean") return value ? 1 : 0;
      if (value === null || value === undefined) continue;
      if (typeof value === "string" && value.trim() === "") continue;
      const parsed = Number(value);
      if (!Number.isNaN(parsed)) return parsed;
    }
    if ("choice" in obj) {
      const choice = String(obj["choice"]).trim().toLowerCase();
      if (choice === "true" || choice === "yes" || choice === "sim" || choice === "1") return 1;
      if (choice === "false" || choice === "no" || choice === "nao" || choice === "0") return 0;
    }
  }
  throw new DeciderError(
    `response without recognizable probability: ${scrub(JSON.stringify(response) ?? String(response))}`,
  );
}

/** Retryable transport failure carrying the HTTP status. */
class HttpStatusError extends Error {
  constructor(
    readonly status: number,
    readonly statusText: string,
  ) {
    super(`HTTP ${status} ${statusText}`.trim());
  }
}

function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

/** HTTP client compatible with any System One endpoint. */
export class DeciderHttp implements DeciderClient {
  private readonly url: string;
  private readonly model: string;
  private readonly key: string;
  private readonly timeout: number;
  private readonly retries: number;

  constructor(url: string, model = "", key = "", timeout = 60, retries = 3) {
    this.url = normalizeDeciderUrl(url);
    this.model = model ? model.trim() : "";
    this.key = key ? key.trim() : "";
    this.timeout = timeout;
    this.retries = retries;
  }

  async ask(state: string, questions: QuestionSet): Promise<DeciderAnswers> {
    const body: Record<string, unknown> = { state, questions };
    if (this.model) body["model"] = this.model;
    const payload = JSON.stringify(body);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "goodbizz/2.0",
    };
    if (this.key) {
      headers["Authorization"] = `Bearer ${this.key}`;
      headers["x-api-key"] = this.key;
    }
    let lastError: unknown = null;
    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const response = await fetch(this.url, {
          method: "POST",
          headers,
          body: payload,
          signal: AbortSignal.timeout(this.timeout * 1000),
        });
        if (response.status === 400 || response.status === 401 || response.status === 403) {
          let errorBody = "";
          try {
            errorBody = (await response.text()).slice(0, 400);
          } catch {
            errorBody = "";
          }
          throw new DeciderError(
            scrub(`decider rejected request (${response.status}): ${errorBody || response.statusText}`),
          );
        }
        if (!response.ok) {
          throw new HttpStatusError(response.status, response.statusText);
        }
        const raw: unknown = await response.json();
        return extractAnswers(raw, questions);
      } catch (error) {
        if (error instanceof DeciderError) throw error;
        lastError = error;
        if (attempt < this.retries - 1) await sleep(1500 * (attempt + 1));
      }
    }
    throw new DeciderError(`decider failed after ${this.retries} attempts: ${scrub(String(lastError))}`);
  }

  async queryProbes(state: string, probes: Record<string, string>): Promise<Record<string, number>> {
    const questions: QuestionSet = {};
    for (const [id, text] of Object.entries(probes)) {
      questions[id] = { type: "noul", instructions: text };
    }
    const answers = await this.ask(state, questions);
    const output: Record<string, number> = {};
    for (const [id, answer] of Object.entries(answers)) {
      output[id] = extractProbability(answer);
    }
    return output;
  }
}

/** Build the decider adapter from the study configuration. */
export function createDeciderClient(cfg: StudyConfig): DeciderClient {
  if (cfg.mockDecider || !cfg.deciderUrl) return new DeciderMock();
  return new DeciderHttp(cfg.deciderUrl, cfg.deciderModel, cfg.deciderKey, cfg.timeout);
}
