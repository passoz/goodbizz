/**
 * Módulo de valor (FR-002): perda mensal, ganho mensal, saldo mensal e retorno em 12 meses.
 * Cálculo puro e determinístico: o LLM declara as premissas, o código faz a conta.
 */
import { describe, expect, test } from "bun:test";

import { calculateValue } from "../src/application/value.ts";

describe("módulo de valor", () => {
  test("FR-002: fatores 20, 4 e 35 com recuperação 0.5 dão perda 2800, ganho 1400 e saldo 1050", () => {
    const value = calculateValue({ factors: [20, 4, 35], recovery: 0.5, setupFee: 1500, monthlyTicket: 350 });
    expect(value.perdaMes).toBe(2800);
    expect(value.ganhoMes).toBe(1400);
    expect(value.saldoMes).toBe(1050);
  });

  test("FR-002: o retorno em 12 meses é 12 vezes o ganho menos o setup menos 12 mensalidades", () => {
    const value = calculateValue({ factors: [20, 4, 35], recovery: 0.5, setupFee: 1500, monthlyTicket: 350 });
    expect(value.retorno12m).toBe(11100);
  });
});
