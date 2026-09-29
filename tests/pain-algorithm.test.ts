import { describe, expect, test } from "bun:test";
import { evaluatePain, recommendPain, runPainSelfTest } from "../src/application/pain-algorithm.ts";
import { ValidationError } from "../src/domain/errors.ts";
import { DEFAULT_CONTEXT } from "../src/domain/pain.ts";
import type { DeciderClient } from "../src/domain/ports.ts";

/** Decisor de teste com respostas fixas por id de sonda. */
function stubDecider(answers: Record<string, number>, fallback = 0.5): DeciderClient {
  return {
    ask: async () => ({}),
    queryProbes: async (_state, probes) => {
      const out: Record<string, number> = {};
      for (const id of Object.keys(probes)) out[id] = answers[id] ?? fallback;
      return out;
    },
  };
}

/** Decisor de teste cujo valor de "dinheiro" muda a cada parafrase. */
function countingDecider(values: number[]): DeciderClient {
  let calls = 0;
  return {
    ask: async () => ({}),
    queryProbes: async (_state, probes) => {
      const value = values[Math.min(calls, values.length - 1)] ?? 0.5;
      calls += 1;
      const out: Record<string, number> = {};
      for (const id of Object.keys(probes)) out[id] = id === "p_dinheiro" ? value : 0.1;
      return out;
    },
  };
}

const strongAnswers = { p_dinheiro: 0.85, p_reputacao: 0.4, p_processo: 0.1, p_tecnologia: 0.05 };
const weakAnswers = { p_dinheiro: 0.2, p_reputacao: 0.15, p_processo: 0.7, p_tecnologia: 0.3 };

describe("evaluatePain", () => {
  test("classifica dor forte com dono claro", async () => {
    const result = await evaluatePain("Ideia forte", stubDecider(strongAnswers), DEFAULT_CONTEXT);

    expect(result.label).toBe("FORTE");
    expect(result.escalate).toBe(false);
    expect(result.painScore).toBe(0.85);
    expect(result.internalScore).toBe(0.1);
    expect(result.margin).toBe(0.75);
    expect(result.deviation).toBe(0);
    expect(result.reason).toBe("dor com dono claro e dominante");
    expect(result.detail).toEqual({
      dinheiro: 0.85,
      reputacao: 0.4,
      processo: 0.1,
      tecnologia: 0.05,
    });
    expect(Object.keys(result.byParaphrase)).toEqual(["v1", "v2", "v3"]);
    expect(recommendPain(result)).toBe(
      "AVANÇAR — dor validada com dono claro; vá para precificação e pré-venda.",
    );
  });

  test("classifica dor interna como fraca", async () => {
    const result = await evaluatePain("Ideia fraca", stubDecider(weakAnswers), DEFAULT_CONTEXT);

    expect(result.label).toBe("FRACA");
    expect(result.escalate).toBe(false);
    expect(recommendPain(result)).toBe(
      "DESCARTAR OU REPOSICIONAR — dor interna; o dono não vê urgência em pagar.",
    );
  });

  test("classifica como instavel quando as parafrases divergem", async () => {
    const result = await evaluatePain("Ideia ruidosa", countingDecider([0.9, 0.2, 0.2]), DEFAULT_CONTEXT);

    expect(result.label).toBe("INSTAVEL");
    expect(result.escalate).toBe(true);
    expect(result.deviation).toBe(0.33);
    expect(result.reason).toBe("sondas divergem entre paráfrases (desvio 0.330 > 0.15)");
    expect(recommendPain(result)).toBe(
      "REVISAR À MÃO — não decida por este teste; veja o motivo e a margem.",
    );
  });

  test("rejeita menos de tres parafrases", async () => {
    await expect(
      evaluatePain("Ideia curta", stubDecider(strongAnswers), DEFAULT_CONTEXT, ["v1"]),
    ).rejects.toThrow(ValidationError);
    await expect(
      evaluatePain("Ideia curta", stubDecider(strongAnswers), DEFAULT_CONTEXT, ["v1", "v2"]),
    ).rejects.toThrow("need at least 3 paraphrases (received 2)");
  });
});

describe("runPainSelfTest", () => {
  test("passa nos cinco casos deterministicos", async () => {
    const result = await runPainSelfTest();

    expect(result.failures).toBe(0);
    expect(result.ok).toBe(true);
    expect(result.lines.filter((line) => line.startsWith("[ok ]")).length).toBe(5);
    expect(result.lines.at(-1)).toBe("SELF-TEST: PASSOU");
  });
});
