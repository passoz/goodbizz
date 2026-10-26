/**
 * Casos do módulo de valor (FR-002): o teste que congela o comportamento da task 1.1.
 * NÃO EDITAR depois do freeze — é o contrato de aceitação da task.
 */
import { describe, expect, test } from "bun:test";

import { calculateValue } from "../src/application/value.ts";

describe("casos do módulo de valor", () => {
  test("FR-002: perda é o produto dos fatores, ganho é perda vezes recuperação, saldo é ganho menos mensalidade", () => {
    const value = calculateValue({ factors: [20, 4, 35], recovery: 0.5, setupFee: 1500, monthlyTicket: 350 });
    expect(value.perdaMes).toBe(2800);
    expect(value.ganhoMes).toBe(1400);
    expect(value.saldoMes).toBe(1050);
    expect(value.retorno12m).toBe(12 * 1400 - 1500 - 12 * 350);
  });

  test("FR-002: retorno em 12 meses com os valores do contrato dá 11100", () => {
    const value = calculateValue({ factors: [20, 4, 35], recovery: 0.5, setupFee: 1500, monthlyTicket: 350 });
    expect(value.retorno12m).toBe(11100);
  });
});
