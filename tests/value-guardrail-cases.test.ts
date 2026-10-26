import { describe, expect, test } from "bun:test";
import { extractUnsourcedNumbers } from "../src/application/verification.ts";

/**
 * Casos da task 1.6 (FR-006): guardrail extrai cada número sem fonte.
 * RED da 1.6: com o stub vazio, o "R$ 3.000 por ano" não é marcado.
 */

const ALLOWED = ["2800", "1400", "1050", "1.43", "11100", "350", "1500"];

describe("FR-006: extração de números sem fonte", () => {
  test("R$ fora do bloco permitido é marcado como sem fonte", () => {
    const doc = [
      "# Plano",
      "",
      "A perda mensal é 2800.",
      "",
      "O plano rende R$ 3.000 por ano sem esforço.",
    ].join("\n");
    const found = extractUnsourcedNumbers(doc, ALLOWED);
    expect(found.some((item) => item.includes("3.000") || item.includes("3000"))).toBe(true);
  });

  test('"R$ 350,00" e "350 reais" contam como o permitido 350', () => {
    for (const doc of ["Custa R$ 350,00 por mês.", "Custa 350 reais por mês."]) {
      expect(extractUnsourcedNumbers(doc, ALLOWED)).toEqual([]);
    }
  });

  test("numeração de seção, lista e tabela não é verificada e o 90 do roadmap passa", () => {
    const doc = [
      "## 11. Proposta de valor e retorno",
      "1. Falar com o dono.",
      "| Mês 2 | Entrega |",
      "O roadmap de 90 dias começa agora.",
    ].join("\n");
    expect(extractUnsourcedNumbers(doc, ["90"])).toEqual([]);
  });

  test("percentual e tempo sem fonte são marcados", () => {
    const doc = "A margem sobe 15% e a tarefa cai de 30 para 5 minutos.";
    const found = extractUnsourcedNumbers(doc, ALLOWED);
    expect(found.length).toBeGreaterThan(0);
  });

  test("número na mesma linha de [INFERENCE] não é marcado", () => {
    const doc = "Estimamos R$ 9.999 por mês [INFERENCE] com base na conversa.";
    expect(extractUnsourcedNumbers(doc, ALLOWED)).toEqual([]);
  });
});
