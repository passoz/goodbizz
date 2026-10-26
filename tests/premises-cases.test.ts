/**
 * Casos da chamada de premissas (FR-001): o teste que congela o comportamento da task 1.3.
 * NÃO EDITAR depois do freeze — é o contrato de aceitação da task.
 *
 * O módulo é carregado por import dinâmico porque o teste exercita a fronteira da
 * chamada: sem a validação, a fonte E42 inexistente passa adiante e o teste falha por
 * asserção (expect), não por erro de módulo.
 */
import { describe, expect, test } from "bun:test";

import type { requestPremises as requestPremisesFn, validatePremises as validatePremisesFn } from "../src/application/premises.ts";
import type { LlmClient } from "../src/domain/ports.ts";
import type { Evidence } from "../src/domain/types.ts";

interface PremisesModule {
  requestPremises: typeof requestPremisesFn;
  validatePremises: typeof validatePremisesFn;
}

function isPremisesModule(module: unknown): module is PremisesModule {
  return (
    typeof module === "object" &&
    module !== null &&
    "requestPremises" in module &&
    typeof module.requestPremises === "function" &&
    "validatePremises" in module &&
    typeof module.validatePremises === "function"
  );
}

async function loadPremisesModule(): Promise<PremisesModule> {
  let module: unknown = null;
  try {
    module = await import("../src/application/premises.ts");
  } catch {
    module = null;
  }
  expect(isPremisesModule(module), "o módulo de premissas exporta requestPremises e validatePremises").toBe(true);
  if (!isPremisesModule(module)) throw new Error("módulo de premissas ausente");
  return module;
}

function evidence(id: string): Evidence {
  return { id, tipo: "custo", afirmacao: `afirmação de ${id}`, trecho: "trecho literal", url: `https://exemplo.com/${id}`, valor: null, unidade: "", ideia: "" };
}

function stubLlm(answers: Array<string | Error>): LlmClient {
  let calls = 0;
  return {
    generateText: async (): Promise<string> => {
      const answer = answers[Math.min(calls, answers.length - 1)];
      calls += 1;
      if (answer instanceof Error) throw answer;
      return answer as string;
    },
  };
}

describe("casos da chamada de premissas", () => {
  test("FR-001: fonte E42 inexistente vira INFERENCE com correção registrada", async () => {
    const { requestPremises } = await loadPremisesModule();
    const llm = stubLlm([
      JSON.stringify({ fatores: [
        { nome: "horas perdidas", valor: 20, unidade: "horas/mês", fonte: "E42" },
        { nome: "custo da hora", valor: 140, unidade: "R$", fonte: "E1" },
      ], recuperacao: 0.5 }),
    ]);
    const cfg = { niche: "Depósitos de Bebidas", city: "Cabo Frio" } as Parameters<typeof requestPremises>[1];
    const { premises, corrections } = await requestPremises(llm, cfg, "Ideia", "descrição", [evidence("E1")]);
    expect(premises?.fatores[0]?.fonte).toBe("INFERENCE");
    expect(corrections.length).toBe(1);
  });

  test("FR-001: JSON inválido duas vezes deixa a ideia sem valor", async () => {
    const { requestPremises } = await loadPremisesModule();
    const llm = stubLlm(["não é json", "ainda não é json"]);
    const cfg = { niche: "Depósitos de Bebidas", city: "" } as Parameters<typeof requestPremises>[1];
    const { premises } = await requestPremises(llm, cfg, "Ideia", "descrição", []);
    expect(premises).toBeNull();
  });

  test("FR-001: fatores fora da faixa e recuperação fora de 0 a 1 rejeitam o conjunto", async () => {
    const { validatePremises } = await loadPremisesModule();
    const one = validatePremises({ fatores: [{ nome: "x", valor: 1, unidade: "u", fonte: "INFERENCE" }], recuperacao: 0.5 }, [], []);
    const over = validatePremises(
      { fatores: [
        { nome: "a", valor: 1, unidade: "u", fonte: "INFERENCE" },
        { nome: "b", valor: 2, unidade: "u", fonte: "INFERENCE" },
      ], recuperacao: 2 },
      [],
      [],
    );
    expect(one).toBeNull();
    expect(over).toBeNull();
  });
});
