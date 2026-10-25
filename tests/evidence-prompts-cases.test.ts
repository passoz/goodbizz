/**
 * Casos das evidências nos prompts (FR-004): sem evidência o prompt manda marcar [INFERENCE], e o
 * LLM simulado não cita id que não recebeu.
 */
import { describe, expect, test } from "bun:test";

import { generateBrief, generateDocument } from "../src/application/generation.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import type { LlmClient } from "../src/domain/ports.ts";
import type { Evidence, IdeaEvaluation } from "../src/domain/types.ts";

function spy(): { llm: LlmClient; users: string[] } {
  const mock = new LlmMock();
  const users: string[] = [];
  return {
    users,
    llm: { generateText: (system, user) => (users.push(user), mock.generateText(system, user)) },
  };
}

const EVIDENCE: Evidence = {
  id: "E9",
  tipo: "concorrente",
  afirmacao: "Há concorrente com app próprio",
  trecho: "O app Gelada Já atende 40 depósitos.",
  url: "https://gelada.test",
  valor: 40,
  unidade: "depósitos",
  ideia: "Alerta de estoque",
};

const EVALUATION: IdeaEvaluation = {
  name: "Alerta de estoque",
  sector: "estoque",
  description: "Avisa quando acaba.",
  indicators: {
    fit: 1.5, fitConf: 0.8, sale: 1.4, saleConf: 0.7, disruption: 1, disruptionConf: 0.6,
    pain: "dinheiro_direto", painProbs: { dinheiro_direto: 0.7 }, painConf: 0.7, solo: 0.6,
  },
  business: { wtp: 0.5, meta30: 0.4, price: 1.2, priceConf: 0.6 },
  algorithm: { label: "FORTE", painScore: 0.7, internalScore: 0.3, margin: 0.4, deviation: 0.05, probes: {}, byParaphrase: {} },
  index: 1.45,
  tier: "C",
};

describe("evidências nos prompts em casos de borda", () => {
  test("FR-004: sem evidência o brief pede [INFERENCE] e não cita id", async () => {
    const { llm, users } = spy();
    const cfg = resolveStudyConfig({ niche: "adega", mock: true });
    const brief = await generateBrief(llm, cfg, []);
    expect(users[0]).toContain("Nenhuma evidência");
    expect(brief).not.toMatch(/\[E\d+\]/);
    expect(brief).toContain("[INFERENCE]");
  });

  test("FR-004: o plano simulado cita só o id que recebeu", async () => {
    const { llm, users } = spy();
    const cfg = resolveStudyConfig({ niche: "deposito", mock: true });
    const plan = await generateDocument(llm, EVALUATION, cfg, "brief", [EVIDENCE]);
    expect(users[0]).toContain("[E9]");
    expect(users[0]).toContain("O app Gelada Já atende 40 depósitos.");
    expect([...plan.matchAll(/\[(E\d+)\]/g)].map((match) => match[1])).toContain("E9");
    expect(plan).not.toMatch(/\[E(?!9\])\d+\]/);
  });
});
