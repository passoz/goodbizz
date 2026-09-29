/**
 * Deterministic decider mock: same input -> same output. Exercises the full pipeline offline.
 * Portado de goodbizz/decider.py (DeciderMock).
 */
import type { DeciderClient } from "../domain/ports.ts";
import type { DeciderAnswers, QuestionSet } from "../domain/types.ts";
import { ratioFromDigest } from "../domain/hash.ts";

export class DeciderMock implements DeciderClient {
  private readonly seed: string;

  constructor(seed = "mock") {
    this.seed = seed;
  }

  async ask(state: string, questions: QuestionSet): Promise<DeciderAnswers> {
    const output: DeciderAnswers = {};
    for (const [qid, question] of Object.entries(questions)) {
      const base = ratioFromDigest(this.seed, state.slice(-120), qid);
      if (question.type === "choice") {
        const criteria = question.criteria ? Object.keys(question.criteria) : ["a", "b", "c"];
        const winner =
          criteria[Math.min(criteria.length - 1, Math.floor(base * criteria.length))] ?? criteria[0] ?? "";
        const probabilities: Record<string, number> = {};
        for (const criterion of criteria) probabilities[criterion] = criterion === winner ? 1 : 0;
        output[qid] = { choice: winner, probabilities, confidence: 0.8 };
      } else if (question.type === "score") {
        const criteria = question.criteria ?? ["0", "1", "2"];
        const n = criteria.length;
        const score = Math.round(base * (n - 1) * 100) / 100;
        const probabilities: Record<string, number> = {};
        for (let i = 0; i < n; i++) probabilities[String(i)] = i === Math.round(score) ? 1 : 0;
        output[qid] = { score, confidence: 0.7, probabilities };
      } else {
        output[qid] = { noul: base };
      }
    }
    return output;
  }

  async queryProbes(state: string, probes: Record<string, string>): Promise<Record<string, number>> {
    const questions: QuestionSet = {};
    for (const [id, text] of Object.entries(probes)) {
      questions[id] = { type: "noul", instructions: text };
    }
    const answers = await this.ask(state, questions);
    const output: Record<string, number> = {};
    for (const [id, answer] of Object.entries(answers)) {
      // The mock always answers a noul question with a numeric `noul` probability, só it reads its
      // own envelope directly. Importing the HTTP client's extractor here would create a module
      // cycle (decider.ts already imports this class).
      const value = answer["noul"];
      output[id] = typeof value === "number" ? value : Number(value ?? 0);
    }
    return output;
  }
}
