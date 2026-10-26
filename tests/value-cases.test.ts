/**
 * Casos do módulo de valor (FR-002): o teste que congela o comportamento da task 1.1.
 * NÃO EDITAR depois do freeze — é o contrato de aceitação da task.
 *
 * O módulo é carregado por import dinâmico porque o teste exercita a fronteira de
 * carregamento: sem a implementação da task, o teste falha por asserção (expect),
 * não por erro de módulo — o verificador independente distingue uma falha de
 * asserção (causalidade demonstrada) de um erro de ambiente/import.
 */
import { describe, expect, test } from "bun:test";

interface ValueModule {
  calculateValue: (input: {
    factors: readonly number[];
    recovery: number;
    setupFee: number;
    monthlyTicket: number;
  }) => { perdaMes: number; ganhoMes: number; saldoMes: number; retorno12m: number };
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
  let module: unknown = null;
  try {
    module = await import("../src/application/value.ts");
  } catch {
    module = null;
  }
  expect(isValueModule(module), "o módulo de valor exporta calculateValue").toBe(true);
  if (!isValueModule(module)) throw new Error("módulo de valor ausente");
  return module;
}

describe("casos do módulo de valor", () => {
  test("FR-002: perda é o produto dos fatores, ganho é perda vezes recuperação, saldo é ganho menos mensalidade", async () => {
    const valueModule = await loadValueModule();
    const value = valueModule.calculateValue({
      factors: [20, 4, 35],
      recovery: 0.5,
      setupFee: 1500,
      monthlyTicket: 350,
    });
    expect(value.perdaMes).toBe(2800);
    expect(value.ganhoMes).toBe(1400);
    expect(value.saldoMes).toBe(1050);
    expect(value.retorno12m).toBe(12 * 1400 - 1500 - 12 * 350);
  });

  test("FR-002: retorno em 12 meses com os valores do contrato dá 11100", async () => {
    const valueModule = await loadValueModule();
    const value = valueModule.calculateValue({
      factors: [20, 4, 35],
      recovery: 0.5,
      setupFee: 1500,
      monthlyTicket: 350,
    });
    expect(value.retorno12m).toBe(11100);
  });
});
