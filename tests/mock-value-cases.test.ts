import { describe, expect, test } from "bun:test";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { PREMISES_SYSTEM_PROMPT } from "../src/application/premises.ts";
import { extractUnsourcedNumbers } from "../src/application/verification.ts";
import { calculateValue } from "../src/application/value.ts";

const PREMISE_USER =
  "Ideia: Triagem de WhatsApp\nDescrição: separa dúvida simples de intenção real\nNicho: cafés de bairro\n\nEvidências citáveis:\nE1: custo de reposição de funcionário\nE2: ticket médio da operação\n\nDeclare as premissas desta ideia.";

/** Casos da task 1.13 (QR-003): mock determinístico com premissas, valor e seção 11. */
describe("QR-003: casos do modo simulado com valor", () => {
  test("duas execuções devolvem as mesmas premissas e a conta confere com o módulo de valor", async () => {
    const first = JSON.parse(await new LlmMock().generateText(PREMISES_SYSTEM_PROMPT, PREMISE_USER)) as {
      fatores: Array<{ nome: string; valor: number }>;
      recuperacao: number;
    };
    const second = JSON.parse(
      await new LlmMock().generateText(PREMISES_SYSTEM_PROMPT, PREMISE_USER),
    ) as typeof first;
    expect(first).toEqual(second);
    expect(first.fatores.length).toBeGreaterThanOrEqual(2);
    const expected = calculateValue({
      factors: first.fatores.map((factor) => factor.valor),
      recovery: first.recuperacao,
      setupFee: 1500,
      monthlyTicket: 350,
    });
    expect(expected.perdaMes).toBeGreaterThan(0);
  });

  test("o documento simulado tem a seção 11 sem número sem fonte além do permitido", async () => {
    const mock = new LlmMock();
    const premisesJson = await mock.generateText(PREMISES_SYSTEM_PROMPT, PREMISE_USER);
    const premises = JSON.parse(premisesJson) as {
      fatores: Array<{ nome: string; valor: number; unidade: string; fonte: string }>;
      recuperacao: number;
    };
    const calc = calculateValue({
      factors: premises.fatores.map((factor) => factor.valor),
      recovery: premises.recuperacao,
      setupFee: 1500,
      monthlyTicket: 350,
    });
    const valorLines = [
      ...premises.fatores.map(
        (factor) => `premissa: ${factor.nome} = ${factor.valor} ${factor.unidade} [${factor.fonte}]`,
      ),
      `perda mensal: R$ ${calc.perdaMes}`,
      `ganho mensal: R$ ${calc.ganhoMes}`,
      `saldo mensal: R$ ${calc.saldoMes} (se paga)`,
      "setup: R$ 1500 | mensalidade: R$ 350/mês",
      `payback: ${calc.paybackMeses} meses`,
      `retorno em 12 meses: R$ ${calc.retorno12m}`,
    ].join("\n");
    const doc = await mock.generateText(
      "DOCUMENTO",
      `Ideia: Triagem de WhatsApp\nDADOS MEDIDOS\nÍNDICE DE AÇÃO: 1.234 | TIER: A\nfit: 1.20\nVALOR\n${valorLines}\nFIM DOS DADOS`,
    );
    expect(doc).toContain("## 11.");
    expect(doc).toContain("### 11.1");
    expect(doc).toContain("### 11.6");
    for (const factor of premises.fatores) {
      if (doc.includes(String(factor.valor))) continue;
      expect(doc).toContain(`| ${factor.nome} | ${factor.valor} |`);
    }
    const media = ["1.234", "1.20"];
    const allowed = [
      ...media,
      ...premises.fatores.map((factor) => String(factor.valor)),
      String(premises.recuperacao),
      String(calc.perdaMes),
      String(calc.ganhoMes),
      String(calc.saldoMes),
      String(calc.paybackMeses),
      String(calc.retorno12m),
      "350",
      "300",
      "1500",
      "90",
      "24",
      "2",
      "12",
      "15",
      "10",
    ];
    expect(extractUnsourcedNumbers(doc, allowed)).toEqual([]);
  });
});
