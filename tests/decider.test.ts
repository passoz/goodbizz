import { describe, expect, test } from "bun:test";
import {
  createDeciderClient,
  DeciderHttp,
  extractAnswers,
  extractProbability,
  normalizeDeciderUrl,
} from "../src/infrastructure/decider.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { DeciderError } from "../src/domain/errors.ts";
import type { DeciderAnswer, DeciderAnswers, QuestionSet, StudyConfig } from "../src/domain/types.ts";

function makeConfig(overrides: Partial<StudyConfig> = {}): StudyConfig {
  return {
    niche: "barbearia",
    description: "",
    cacheSeed: "",
    providerFingerprint: "",
    city: "Sao Paulo",
    monthlyTicket: 300,
    numIdeas: 8,
    outputDir: "estudo",
    ideasFile: "",
    evaluateOnly: false,
    painMethod: "choice",
    mock: true,
    mockLlm: true,
    mockDecider: true,
    pdf: false,
    paraphrases: 3,
    concurrency: 8,
    timeout: 60,
    llmBaseUrl: "",
    llmModel: "",
    llmKey: "",
    deciderUrl: "",
    deciderModel: "",
    deciderKey: "",
    ...overrides,
  };
}

function answerOf(answers: DeciderAnswers, qid: string): DeciderAnswer {
  const answer = answers[qid];
  if (answer === undefined) throw new Error(`missing decider answer for ${qid}`);
  return answer;
}

describe("normalizeDeciderUrl", () => {
  test("maps every documented shape", () => {
    expect(normalizeDeciderUrl("")).toBe("");
    expect(normalizeDeciderUrl("https://x.com")).toBe("https://x.com/v1/systemone");
    expect(normalizeDeciderUrl("https://x.com/")).toBe("https://x.com/v1/systemone");
    expect(normalizeDeciderUrl("https://x.com/v1")).toBe("https://x.com/v1/systemone");
    expect(normalizeDeciderUrl("https://x.com/v1/systemone")).toBe("https://x.com/v1/systemone");
    expect(normalizeDeciderUrl("https://x.com/api/predict")).toBe("https://x.com/api/predict");
  });

  test("trims whitespace and trailing slashes", () => {
    expect(normalizeDeciderUrl("  https://x.com/api/predict/  ")).toBe("https://x.com/api/predict");
  });
});

describe("extractProbability", () => {
  test("accepts plain numbers", () => {
    expect(extractProbability(0.42)).toBe(0.42);
  });

  test("reads noul booleans and probability fields", () => {
    expect(extractProbability({ noul: true })).toBe(1);
    expect(extractProbability({ noul: false })).toBe(0);
    expect(extractProbability({ probability: 0.7 })).toBe(0.7);
  });

  test("maps choice answers", () => {
    expect(extractProbability({ choice: "sim" })).toBe(1);
    expect(extractProbability({ choice: "nao" })).toBe(0);
  });

  test("throws on unrecognized shapes", () => {
    expect(() => extractProbability({ unrecognized: 1 })).toThrow(DeciderError);
  });
});

describe("extractAnswers", () => {
  const questions: QuestionSet = { a: { type: "noul", instructions: "x" } };

  test("unwraps the answers envelope", () => {
    expect(extractAnswers({ answers: { a: { noul: 1 } } }, questions)).toEqual({
      a: { noul: 1 },
    });
  });

  test("unwraps the data envelope", () => {
    expect(extractAnswers({ data: { a: { noul: 0.5 } } }, questions)).toEqual({
      a: { noul: 0.5 },
    });
  });

  test("projects question ids returned at the root", () => {
    expect(extractAnswers({ a: { noul: 0.9 }, noise: "ignored" }, questions)).toEqual({
      a: { noul: 0.9 },
    });
  });

  test("throws when no envelope is recognizable", () => {
    expect(() => extractAnswers({ foo: 1 })).toThrow(DeciderError);
    expect(() => extractAnswers("nope")).toThrow(DeciderError);
  });
});

describe("DeciderMock", () => {
  const state = "Contexto do mercado: barbearia. Donos operacionais.";

  test("is deterministic for the same state and questions", async () => {
    const questions: QuestionSet = {
      q1: { type: "noul", instructions: "pergunta" },
      q2: { type: "choice", instructions: "escolha", criteria: { x: "x", y: "y", z: "z" } },
    };
    const first = await new DeciderMock("seed-a").ask(state, questions);
    const second = await new DeciderMock("seed-a").ask(state, questions);
    expect(first).toEqual(second);
  });

  test("choice returns exactly one winner with probability 1", async () => {
    const questions: QuestionSet = {
      q1: { type: "choice", instructions: "escolha", criteria: { x: "x", y: "y", z: "z" } },
    };
    const answers = await new DeciderMock("seed-a").ask(state, questions);
    const answer = answerOf(answers, "q1");
    const choice = answer["choice"] as string;
    const probabilities = answer["probabilities"] as Record<string, number>;
    const covered = ["x", "y", "z"].filter((key) => probabilities[key] === 1);
    expect(covered).toEqual([choice]);
    expect(Object.values(probabilities).reduce((acc, value) => acc + value, 0)).toBe(1);
  });

  test("score stays within [0, n-1]", async () => {
    const questions: QuestionSet = {
      q1: { type: "score", instructions: "nota", criteria: ["0", "1", "2", "3", "4"] },
    };
    const answers = await new DeciderMock("seed-a").ask(state, questions);
    const score = answerOf(answers, "q1")["score"] as number;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(4);
  });
});

describe("createDeciderClient", () => {
  test("returns a mock when mockDecider is set", () => {
    expect(createDeciderClient(makeConfig({ mockDecider: true }))).toBeInstanceOf(DeciderMock);
  });

  test("returns a mock when the decider url is empty", () => {
    expect(createDeciderClient(makeConfig({ mockDecider: false, deciderUrl: "" }))).toBeInstanceOf(
      DeciderMock,
    );
  });
});

describe("DeciderHttp over loopback", () => {
  test("sends dual auth headers, the model and the question envelope", async () => {
    const observed: {
      value: {
        path: string;
        auth: string | null;
        apiKey: string | null;
        body: Record<string, unknown>;
      } | null;
    } = { value: null };
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        observed.value = {
          path: new URL(request.url).pathname,
          auth: request.headers.get("authorization"),
          apiKey: request.headers.get("x-api-key"),
          body: (await request.json()) as Record<string, unknown>,
        };
        return Response.json({ answers: { q1: { noul: 0.7 } } });
      },
    });
    try {
      const client = new DeciderHttp(`http://127.0.0.1:${server.port}`, "systemone-latest", "lsk_live_x", 5);
      const answers = await client.ask("estado", { q1: { type: "noul", instructions: "pergunta" } });
      expect(answers["q1"]).toEqual({ noul: 0.7 });
      const seen = observed.value;
      if (seen === null) throw new Error("the stub server was not called");
      expect(seen.path).toBe("/v1/systemone");
      expect(seen.auth).toBe("Bearer lsk_live_x");
      expect(seen.apiKey).toBe("lsk_live_x");
      expect(seen.body["model"]).toBe("systemone-latest");
      expect(seen.body["state"]).toBe("estado");

      const probes = await client.queryProbes("estado", { p1: "texto" });
      expect(probes).toEqual({ q1: 0.7 });
    } finally {
      await server.stop(true);
    }
  });

  test("aborts on an authorization error without retrying and without leaking the key", async () => {
    const secret = "lsk_live_secret_value_987";
    let calls = 0;
    const server = Bun.serve({
      port: 0,
      fetch: () => {
        calls += 1;
        return new Response(`invalid key ${secret}`, { status: 401 });
      },
    });
    try {
      const client = new DeciderHttp(`http://127.0.0.1:${server.port}`, "m", secret, 5, 3);
      let message = "";
      try {
        await client.ask("s", { q1: { type: "noul", instructions: "p" } });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toContain("decider rejected request (401)");
      expect(message).not.toContain(secret);
      expect(calls).toBe(1);
    } finally {
      await server.stop(true);
    }
  });
});
