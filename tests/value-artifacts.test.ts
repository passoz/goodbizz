import { describe, expect, test } from "bun:test";
import { indicatorsTableCsv, indicatorsTableMarkdown } from "../src/application/reports.ts";
import { evaluationFromJson, serializeDados } from "../src/application/dados.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import type { StudyIdea, StudyIdea as Idea, StudySummary } from "../src/domain/types.ts";

/**
 * Aceitação da task 1.11 (FR-009): a perda e o payback aparecem no tabelão,
 * no CSV e no dados.json sem mudar as chaves antigas.
 */
describe("FR-009: aceitação dos artefatos de valor", () => {
  test("a perda e o payback aparecem no tabelão, no CSV e no dados.json sem mudar as chaves antigas", () => {
    const value = {
      premises: [{ nome: "f1", valor: 20, unidade: "u", fonte: "E1" }],
      recovery: 0.5,
      loss: 2800,
      gain: 1400,
      balance: 1050,
      paybackMonths: 1.43,
      return12m: 11100,
      setupFee: 1500,
    };
    const idea = {
      id: "id-a",
      name: "ideia-a",
      sector: "serviços",
      description: "descrição",
      indicators: {
        fit: 0.8,
        fitConf: 0.9,
        sale: 0.7,
        saleConf: 0.8,
        disruption: 0.6,
        disruptionConf: 0.7,
        pain: "forte",
        painProbs: {},
        painConf: 0.8,
        solo: 0.75,
      },
      business: { wtp: 350, meta30: 0.5, price: 300, priceConf: 0.8 },
      algorithm: {
        label: "FORTE",
        painScore: 0.7,
        internalScore: 0.6,
        margin: 0.1,
        deviation: 0.05,
        probes: {},
        byParaphrase: {},
      },
      index: 1.5,
      tier: "A",
      value,
    } as StudyIdea;
    const cfg = resolveStudyConfig({ niche: "cafés", mock: true });
    expect(indicatorsTableMarkdown(cfg, [idea])).toContain("2800");
    const [header] = indicatorsTableCsv([idea]).trim().split("\n");
    expect(header).toContain("perda_mes");
    expect(header).toContain("payback_meses");
    const summary = {
      ordered: [idea],
      means: { fit: 0.8, sale: 0.7, disruption: 0.6, solo: 0.75, wtp: 350, meta30: 0.5 },
      painGroups: { forte: ["ideia-a"], mista: [], fraca: [] },
      tiers: { A: ["ideia-a"], B: [], C: [] },
      attack: [],
      review: [],
    } as StudySummary;
    const raw = JSON.parse(serializeDados(cfg, "", summary, [idea], [])) as { ideias: unknown[] };
    expect(raw.ideias[0]).toHaveProperty("valor");
    expect((evaluationFromJson(raw.ideias[0]) as Idea).value?.loss).toBe(2800);
  });
});
