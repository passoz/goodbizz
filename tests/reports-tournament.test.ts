/**
 * Formatação do torneio nos relatórios (Work 0017, task 1.4).
 */
import { describe, expect, test } from "bun:test";

import { serializeDados } from "../src/application/dados.ts";
import { indicatorsTableCsv, indicatorsTableMarkdown } from "../src/application/reports.ts";
import { summarizeStudy } from "../src/application/summary.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import type { StudyIdea } from "../src/domain/types.ts";

function idea(name: string, index: number, score: number | null): StudyIdea {
  return {
    id: name,
    name,
    sector: "",
    description: name,
    indicators: {
      fit: index,
      fitConf: 0,
      sale: index,
      saleConf: 0,
      disruption: 0,
      disruptionConf: 0,
      pain: "",
      painProbs: {},
      painConf: 0,
      solo: 0,
    },
    business: { wtp: 0, meta30: 0, price: 0, priceConf: 0 },
    algorithm: {
      label: "FRACA",
      painScore: 0,
      internalScore: 0,
      margin: 0,
      deviation: 0,
      probes: {},
      byParaphrase: {},
    },
    index,
    tier: "C",
    tournament: score === null ? null : { points: score * 3, games: 3, wins: 0, byes: 0, score },
  };
}

const cfg = resolveStudyConfig({ niche: "bares", numIdeas: 2, mock: true });

describe("relatorios com torneio", () => {
  test("o CSV ordena pela media do torneio e grava media com 3 casas e partidas", () => {
    const rows = indicatorsTableCsv([idea("Alto", 1.9, 1 / 3), idea("Baixo", 1, 2 / 3)])
      .trim()
      .split("\n");
    expect(rows[1]?.startsWith('"Baixo"')).toBe(true);
    expect(rows[1]?.endsWith(",0.667,3")).toBe(true);
    expect(rows[2]?.endsWith(",0.333,3")).toBe(true);
  });

  test("o tabelao mostra traco para ideia sem torneio", () => {
    const table = indicatorsTableMarkdown(cfg, [idea("Sem", 1.5, null)]);
    const row = table.split("\n").find((line) => line.includes("| Sem |")) ?? "";
    expect(row.endsWith("| - |")).toBe(true);
  });

  test("o dados.json grava torneio nulo e lista de partidas vazia sem torneio", () => {
    const data = [idea("Sem", 1.5, null)];
    const dados = JSON.parse(serializeDados(cfg, "", summarizeStudy(data), data)) as Record<string, unknown>;
    expect(dados["torneio_partidas"]).toEqual([]);
    expect((dados["ideias"] as Array<Record<string, unknown>>)[0]?.["torneio"]).toBeNull();
  });
});
