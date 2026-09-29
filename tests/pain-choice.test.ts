import { describe, expect, test } from "bun:test";
import {
  PAIN_INSTRUCTIONS,
  PAIN_OPTIONS,
  choiceQuestions,
  measurePainChoice,
  painResultFromChoice,
} from "../src/application/pain-choice.ts";
import type { DeciderClient } from "../src/domain/ports.ts";

/** Decisor de teste que devolve as probabilidades dadas, uma por parafrase. */
function choiceDecider(probabilities: Array<Record<string, number>>): DeciderClient {
  let calls = 0;
  return {
    ask: async () => {
      const probs = probabilities[Math.min(calls, probabilities.length - 1)] ?? {};
      calls += 1;
      return { dor: { probabilities: probs } };
    },
    queryProbes: async () => ({}),
  };
}

const STATE = "Contexto do mercado: pousadas.\nIdeia: agenda";

describe("choiceQuestions", () => {
  test("monta as tres perguntas de escolha forcada", () => {
    const questions = choiceQuestions();

    expect(questions.length).toBe(3);
    expect(questions.map((question) => question.instructions)).toEqual(PAIN_INSTRUCTIONS);
    for (const question of questions) {
      expect(question.type).toBe("choice");
      if (question.type === "choice") expect(question.criteria).toEqual(PAIN_OPTIONS);
    }
  });
});

describe("measurePainChoice", () => {
  test("agrega as probabilidades por sonda e zera tecnologia", async () => {
    const measured = await measurePainChoice(
      choiceDecider([{ dinheiro_direto: 0.8, reputacao: 0.1, backoffice: 0.1 }]),
      STATE,
    );

    expect(measured.probes).toEqual({
      dinheiro: 0.8,
      reputacao: 0.1,
      processo: 0.1,
      tecnologia: 0,
    });
    expect(Object.keys(measured.byParaphrase)).toEqual(["P1", "P2", "P3"]);
    expect(measured.byParaphrase["P1"]).toEqual({ dinheiro: 0.8, reputacao: 0.1, processo: 0.1 });
  });

  test("aceita resposta com apenas a escolha", async () => {
    const decider: DeciderClient = {
      ask: async () => ({ dor: { choice: "dinheiro_direto" } }),
      queryProbes: async () => ({}),
    };
    const measured = await measurePainChoice(decider, STATE);

    expect(measured.probes["dinheiro"]).toBe(1);
    expect(measured.probes["processo"]).toBe(0);
  });
});

describe("painResultFromChoice", () => {
  test("classifica dor forte e mantem o detalhe por parafrase", async () => {
    const measured = await measurePainChoice(
      choiceDecider([{ dinheiro_direto: 0.8, reputacao: 0.1, backoffice: 0.1 }]),
      STATE,
    );
    const result = painResultFromChoice(measured);

    expect(result.label).toBe("FORTE");
    expect(result.escalate).toBe(false);
    expect(result.reason).toBe("dor com dono claro e dominante");
    expect(result.painScore).toBe(0.8);
    expect(result.internalScore).toBe(0.1);
    expect(result.margin).toBeCloseTo(0.7, 6);
    expect(result.deviation).toBe(0);
    expect(result.detail).toEqual({
      dinheiro: 0.8,
      reputacao: 0.1,
      processo: 0.1,
      tecnologia: 0,
    });
    expect(result.byParaphrase["P3"]).toEqual({ dinheiro: 0.8, reputacao: 0.1, processo: 0.1 });
  });

  test("classifica como instavel quando as parafrases divergem", async () => {
    const measured = await measurePainChoice(
      choiceDecider([
        { dinheiro_direto: 0.9, reputacao: 0.05, backoffice: 0.05 },
        { dinheiro_direto: 0.2, reputacao: 0.1, backoffice: 0.7 },
        { dinheiro_direto: 0.2, reputacao: 0.1, backoffice: 0.7 },
      ]),
      STATE,
    );
    const result = painResultFromChoice(measured);

    expect(result.label).toBe("INSTAVEL");
    expect(result.escalate).toBe(true);
    expect(result.deviation).toBeCloseTo(0.33, 4);
    expect(result.reason).toBe("sondas divergem entre paráfrases (desvio 0.330 > 0.15)");
  });
});
