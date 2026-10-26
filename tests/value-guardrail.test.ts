import { describe, expect, test } from "bun:test";
import { extractUnsourcedNumbers } from "../src/application/verification.ts";

/**
 * Aceitação da task 1.6 (FR-006): guardrail extrai cada número sem fonte.
 * Espia a extração: o número inventado é marcado, o equivalente passa e a
 * numeração estrutural não é verificada.
 */

describe("FR-006: aceitação do guardrail", () => {
  test("o número inventado é marcado, o equivalente passa e a estrutura não é verificada", () => {
    const invented = extractUnsourcedNumbers("O plano rende R$ 3.000 por ano.", ["2800"]);
    expect(invented.some((item) => item.includes("3.000"))).toBe(true);
    expect(extractUnsourcedNumbers("Custa R$ 350,00 por mês.", ["350"])).toEqual([]);
    expect(extractUnsourcedNumbers("## 11. Proposta de valor e retorno", ["11"])).toEqual([]);
  });
});
