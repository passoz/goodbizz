/**
 * Estimativa de custo e tradução de falhas: o que o operador lê depois de cada estudo.
 */
import { describe, expect, test } from "bun:test";

import { estimateCost, type PriceTable } from "../src/application/costs.ts";
import { explainFailure } from "../src/application/failures.ts";
import type { StudyUsage } from "../src/domain/types.ts";

const PRICES: PriceTable = {
  llmInputPerMTok: 0.14,
  llmCachedInputPerMTok: 0.0028,
  llmOutputPerMTok: 0.28,
  deciderInputPerMTok: 0,
  deciderOutputPerMTok: 0,
  usdBrl: 0,
};

function usage(llm: Partial<StudyUsage["llm"]> = {}, decider: Partial<StudyUsage["llm"]> = {}): StudyUsage {
  const base = { calls: 1, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  return { llm: { ...base, ...llm }, decider: { ...base, ...decider } };
}

describe("estimateCost", () => {
  test("sem consumo medido não há estimativa", () => {
    expect(estimateCost(null, PRICES)).toBeNull();
  });

  test("cobra entrada cheia, entrada em cache e saída", () => {
    const cost = estimateCost(
      usage({ inputTokens: 1_000_000, cachedInputTokens: 200_000, outputTokens: 500_000 }),
      PRICES,
    );
    // 800k entrada cheia * 0.14 + 200k cache * 0.0028 + 500k saída * 0.28 = 0.112 + 0.00056 + 0.14
    expect(cost?.usd).toBe(0.25256);
    expect(cost?.brl).toBeNull();
    expect(cost?.note).toContain("0.14/1M entrada");
    expect(cost?.note).toContain("decisor a custo zero");
  });

  test("converte para real quando a cotação está configurada", () => {
    const cost = estimateCost(usage({ inputTokens: 1_000_000 }), { ...PRICES, usdBrl: 5.4 });
    expect(cost?.usd).toBe(0.14);
    expect(cost?.brl).toBe(0.756);
  });

  test("decisor pago entra no cálculo e muda a legenda", () => {
    const cost = estimateCost(usage({}, { calls: 10, inputTokens: 1_000_000, outputTokens: 1_000_000 }), {
      ...PRICES,
      deciderInputPerMTok: 1,
      deciderOutputPerMTok: 2,
    });
    expect(cost?.usd).toBe(3);
    expect(cost?.note).toContain("decisor US$ 1/1M entrada");
  });
});

describe("explainFailure", () => {
  test("429 fala de limite de uso e diz para tentar de novo", () => {
    const text = explainFailure(new Error('[429]: {"error":{"message":"Rate limit exceeded"}}'));
    expect(text).toContain("limite de uso (429");
    expect(text).toContain("execute o estudo de novo");
    expect(text).toContain("[429]");
  });

  test("401/403 apontam para a credencial", () => {
    expect(explainFailure(new Error("decider rejected request (401): Unauthorized"))).toContain(
      "credencial (401/403)",
    );
  });

  test("falha de rede ou DNS é dita como tal", () => {
    expect(explainFailure(new Error("LLM failed after 3 attempts: fetch failed"))).toContain("rede ou DNS");
    // O Bun diz "Unable to connect" quando o endpoint não responde (visto em teste real).
    expect(explainFailure(new Error("Unable to connect. Is the computer able to access the url?"))).toContain(
      "rede ou DNS",
    );
  });

  test("5xx e credencial ausente no roteador têm texto próprio", () => {
    expect(explainFailure(new Error("HTTP 503 Service Unavailable"))).toContain("erro interno (5xx)");
    expect(explainFailure(new Error("No active credentials for provider: openai"))).toContain(
      "não tem credencial ativa",
    );
  });

  test("motivo desconhecido preserva a mensagem original", () => {
    expect(explainFailure(new Error("algo muito específico quebrou"))).toContain(
      "algo muito específico quebrou",
    );
  });
});
