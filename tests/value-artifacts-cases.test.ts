import { describe, expect, test } from "bun:test";
import { indicatorsTableCsv, indicatorsTableMarkdown } from "../src/application/reports.ts";
import { evaluationFromJson, evaluationToJson, serializeDados } from "../src/application/dados.ts";
import { loadCases } from "../src/application/recalibrate.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import type { StudyIdea, StudyIdea as Idea, StudySummary } from "../src/domain/types.ts";

function idea(partial: Partial<StudyIdea> & { name: string }): StudyIdea {
  return {
    id: `id-${partial.name}`,
    indicators: {
      fit: 0.8,
      fitConf: 0.9,
      sale: 0.7,
      saleConf: 0.8,
      disruption: 0.6,
      disruptionConf: 0.7,
      pain: "forte",
      painProbs: { forte: 0.8 },
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
    sector: "serviços",
    description: "descrição",
    ...partial,
  } as StudyIdea;
}

const withValue = idea({
  name: "ideia-a",
  value: {
    premises: [{ nome: "f1", valor: 20, unidade: "u", fonte: "E1" }],
    recovery: 0.5,
    loss: 2800,
    gain: 1400,
    balance: 1050,
    paybackMonths: 1.43,
    return12m: 11100,
    setupFee: 1500,
  },
});

function summary(): StudySummary {
  return {
    ordered: [withValue],
    means: { fit: 0.8, sale: 0.7, disruption: 0.6, solo: 0.75, wtp: 350, meta30: 0.5 },
    painGroups: { forte: ["ideia-a"], mista: [], fraca: [] },
    tiers: { A: ["ideia-a"], B: [], C: [] },
    attack: [],
    review: [],
  } as StudySummary;
}

/**
 * Casos da task 1.11 (FR-009): tabelão, CSV e dados.json mostram perda e payback,
 * as chaves antigas não mudam e o recalibrate continua lendo o arquivo novo.
 */
describe("FR-009: casos dos artefatos de valor", () => {
  test("o tabelão traz perda mensal e payback", () => {
    const cfg = resolveStudyConfig({ niche: "cafés", mock: true });
    const table = indicatorsTableMarkdown(cfg, [withValue]);
    expect(table).toContain("Perda");
    expect(table).toContain("2800");
    expect(table).toContain("1.43");
  });

  test("o CSV traz as colunas perda_mes e payback_meses", () => {
    const csv = indicatorsTableCsv([withValue]);
    const [header, row] = csv.trim().split("\n");
    expect(header).toContain("perda_mes");
    expect(header).toContain("payback_meses");
    expect(row).toContain("2800");
  });

  test("o dados.json ganha a chave valor e o recalibrate lê o arquivo novo", () => {
    const cfg = resolveStudyConfig({ niche: "cafés", mock: true });
    const raw = serializeDados(cfg, "", summary(), [withValue], []);
    const parsed = JSON.parse(raw) as { ideias: unknown[] };
    expect(parsed.ideias[0]).toHaveProperty("valor");
    const back = evaluationFromJson(parsed.ideias[0]);
    expect((back as Idea).value?.loss).toBe(2800);
    expect((back as Idea).value?.paybackMonths).toBe(1.43);
    const parsed2 = JSON.parse(raw) as unknown;
    const cases = loadCases([parsed2], 1.4);
    expect(cases.cases.length + cases.ignored.length).toBe(1);
  });

  test("ideia sem valor deixa as colunas vazias sem mudar as chaves antigas", () => {
    const plain = idea({ name: "ideia-b" });
    const csv = indicatorsTableCsv([plain]);
    const [header, row] = csv.trim().split("\n");
    expect(header?.split(",")).toContain("indice");
    expect(header?.split(",")).toContain("tier");
    expect(row).not.toContain("NaN");
    const back = evaluationFromJson(evaluationToJson(plain));
    expect(back.index).toBe(plain.index);
    expect((back as Idea).value).toBeUndefined();
  });
});
