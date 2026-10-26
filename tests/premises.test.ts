/**
 * Chamada de premissas (FR-001): 2 a 4 fatores positivos, recuperação entre 0 e 1,
 * fonte válida passa, fonte órfã vira INFERENCE com issue e falha dupla segue sem valor.
 */
import { describe, expect, test } from "bun:test";

import { validatePremises } from "../src/application/premises.ts";
import type { Evidence } from "../src/domain/types.ts";

function evidence(id: string): Evidence {
  return { id, tipo: "custo", afirmacao: `afirmação de ${id}`, trecho: "trecho literal", url: `https://exemplo.com/${id}`, valor: null, unidade: "", ideia: "" };
}

describe("validação de premissas", () => {
  test("FR-001: fonte válida passa e recuperação no limite é aceita", () => {
    const corrections: string[] = [];
    const result = validatePremises(
      { fatores: [
        { nome: "horas perdidas", valor: 20, unidade: "horas/mês", fonte: "E1" },
        { nome: "custo da hora", valor: 140, unidade: "R$", fonte: "INFERENCE" },
      ], recuperacao: 1 },
      [evidence("E1")],
      corrections,
    );
    expect(result !== null).toBe(true);
    expect(corrections).toEqual([]);
  });

  test("FR-001: E42 inexistente vira INFERENCE com correção registrada", () => {
    const corrections: string[] = [];
    const result = validatePremises(
      { fatores: [
        { nome: "horas perdidas", valor: 20, unidade: "horas/mês", fonte: "E42" },
        { nome: "custo da hora", valor: 140, unidade: "R$", fonte: "E1" },
      ], recuperacao: 0.5 },
      [evidence("E1")],
      corrections,
    );
    expect(result?.fatores[0]?.fonte).toBe("INFERENCE");
    expect(corrections.length).toBe(1);
  });
  test("FR-001: um fator só, valor não positivo e recuperação fora de 0 a 1 rejeitam", () => {
    const one = validatePremises({ fatores: [{ nome: "x", valor: 1, unidade: "u", fonte: "INFERENCE" }], recuperacao: 0.5 }, [], []);
    const zero = validatePremises({ fatores: [{ nome: "a", valor: 0, unidade: "u", fonte: "INFERENCE" }, { nome: "b", valor: 2, unidade: "u", fonte: "INFERENCE" }], recuperacao: 0.5 }, [], []);
    const over = validatePremises({ fatores: [{ nome: "a", valor: 1, unidade: "u", fonte: "INFERENCE" }, { nome: "b", valor: 2, unidade: "u", fonte: "INFERENCE" }], recuperacao: 1.5 }, [], []);
    expect(one).toBeNull();
    expect(zero).toBeNull();
    expect(over).toBeNull();
  });
});
