/**
 * Casos do payback (FR-003): o teste que congela o comportamento da task 1.2.
 * NÃO EDITAR depois do freeze — é o contrato de aceitação da task.
 *
 * O módulo é carregado por import dinâmico porque o teste exercita a fronteira de
 * carregamento: sem a regra do saldo, o teste falha por asserção (expect), não por
 * erro de módulo.
 */
import { describe, expect, test } from "bun:test";

interface ValueModule {
  calculateValue: (input: {
    factors: readonly number[];
    recovery: number;
    setupFee: number;
    monthlyTicket: number;
  }) => { paybackMeses: number | null; saldoMes: number };
}

function isValueModule(module: unknown): module is ValueModule {
  return (
    typeof module === "object" &&
    module !== null &&
    "calculateValue" in module &&
    typeof module.calculateValue === "function"
  );
}

async function loadValueModule(): Promise<ValueModule> {
  const module: unknown = await import("../src/application/value.ts");
  expect(isValueModule(module), "o módulo de valor exporta calculateValue").toBe(true);
  if (!isValueModule(module)) throw new Error("módulo de valor ausente");
  return module;
}

describe("casos do payback", () => {
  test("FR-003: setup 1500 com saldo 1050 dá payback 1.43 com 2 casas", async () => {
    const valueModule = await loadValueModule();
    const value = valueModule.calculateValue({
      factors: [20, 4, 35],
      recovery: 0.5,
      setupFee: 1500,
      monthlyTicket: 350,
    });
    expect(value.saldoMes).toBe(1050);
    expect(value.paybackMeses).toBe(1.43);
  });

  test("FR-003: ganho abaixo da mensalidade deixa o payback nulo", async () => {
    const valueModule = await loadValueModule();
    const value = valueModule.calculateValue({
      factors: [10, 10],
      recovery: 0.5,
      setupFee: 1500,
      monthlyTicket: 350,
    });
    expect(value.saldoMes).toBeLessThanOrEqual(0);
    expect(value.paybackMeses).toBeNull();
  });

  test("FR-003: setup zero com saldo positivo dá payback zero", async () => {
    const valueModule = await loadValueModule();
    const value = valueModule.calculateValue({
      factors: [20, 4, 35],
      recovery: 0.5,
      setupFee: 0,
      monthlyTicket: 350,
    });
    expect(value.paybackMeses).toBe(0);
  });
});
