/**
 * Payback do valor (FR-003): com 2 casas, nulo sem saldo positivo e zero com setup zero.
 */
import { describe, expect, test } from "bun:test";

import { calculateValue } from "../src/application/value.ts";

describe("payback do valor", () => {
  test("FR-003: setup 1500 com saldo 1050 dá payback 1.43", () => {
    const value = calculateValue({ factors: [20, 4, 35], recovery: 0.5, setupFee: 1500, monthlyTicket: 350 });
    expect(value.paybackMeses).toBe(1.43);
  });

  test("FR-003: ganho menor ou igual à mensalidade deixa o payback nulo", () => {
    const below = calculateValue({ factors: [10, 10], recovery: 0.5, setupFee: 1500, monthlyTicket: 350 });
    expect(below.saldoMes).toBeLessThanOrEqual(0);
    expect(below.paybackMeses).toBeNull();
  });

  test("FR-003: setup zero com saldo positivo dá payback zero", () => {
    const value = calculateValue({ factors: [20, 4, 35], recovery: 0.5, setupFee: 0, monthlyTicket: 350 });
    expect(value.paybackMeses).toBe(0);
  });
});
