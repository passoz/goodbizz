/**
 * Artefatos do torneio (Work 0017, task 1.4): tabelão, CSV, índice e `dados.json` seguem a ordem do
 * torneio e ganham a coluna `torneio` no fim, sem mudar as chaves que já existiam.
 */
import { describe, expect, test } from "bun:test";

import { buildArtifactFiles } from "../src/application/artifacts.ts";
import { summarizeStudy } from "../src/application/summary.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import type { StudyIdea, StudyTournament, TournamentStanding } from "../src/domain/types.ts";

const OLD_CSV_HEADERS =
  "ideia,setor,indice,tier,fit,fit_conf,venda,venda_conf,disrupcao,disrupcao_conf,dor,dor_conf,solo," +
  "algo,algo_dor,algo_interna,algo_margem,algo_desvio,wtp,meta30,preco,preco_conf,perda_mes,payback_meses";

const OLD_IDEA_KEYS = ["nome", "setor", "descricao", "indicadores", "negocio", "algoritmo", "indice", "tier"];

function idea(name: string, index: number, standing: TournamentStanding | null): StudyIdea {
  return {
    id: `id-${name}`,
    name,
    sector: "bebidas",
    description: `descrição de ${name}`,
    indicators: {
      fit: index,
      fitConf: 0.8,
      sale: index,
      saleConf: 0.8,
      disruption: 1,
      disruptionConf: 0.8,
      pain: "dinheiro_direto",
      painProbs: { dinheiro_direto: 1 },
      painConf: 0.8,
      solo: 0.5,
    },
    business: { wtp: 0.5, meta30: 0.5, price: 1, priceConf: 0.7 },
    algorithm: {
      label: "FORTE",
      painScore: 0.8,
      internalScore: 0.1,
      margin: 0.7,
      deviation: 0.01,
      probes: {},
      byParaphrase: {},
    },
    index,
    tier: index >= 1.84 ? "A" : index >= 1.6 ? "B" : "C",
    tournament: standing,
  };
}

const tournament: StudyTournament = {
  rounds: 3,
  matches: [
    {
      round: 1,
      a: "id-Fiado Digital",
      b: "id-Rota Certa",
      aName: "Fiado Digital",
      bName: "Rota Certa",
      pA: 0.75,
    },
  ],
  byes: [{ round: 1, idea: "id-Agenda Viva", name: "Agenda Viva" }],
  issues: [],
};

/** Índice e torneio discordam de propósito: o torneio decide a ordem. */
const data: StudyIdea[] = [
  idea("Agenda Viva", 1.9, { points: 1, games: 2, wins: 1, byes: 1, score: 0.5 }),
  idea("Rota Certa", 1.8, { points: 0.5, games: 2, wins: 0, byes: 1, score: 0.25 }),
  idea("Fiado Digital", 1.2, { points: 1.5, games: 2, wins: 2, byes: 1, score: 0.75 }),
];

const cfg = resolveStudyConfig({ niche: "depósitos de bebidas", numIdeas: 3, mock: true });

function files(ideas: StudyIdea[], withTournament: StudyTournament | null) {
  const summary = summarizeStudy(ideas, withTournament);
  const folders = Object.fromEntries(
    summary.ordered.map((item, position) => [item.name, `0${position + 1}-${item.id}`]),
  );
  const all = buildArtifactFiles(cfg, "brief", summary, ideas, folders, {}, []);
  return (path: string) => String(all.find((file) => file.path === path)?.content ?? "");
}

describe("artefatos do torneio", () => {
  test("coluna torneio: tabelao e CSV trazem a media e as partidas de cada ideia na ordem do torneio", () => {
    const read = files(data, tournament);
    const csv = read("00-tabelao.csv").trim().split("\n");
    expect(csv[0]?.endsWith(",torneio,partidas")).toBe(true);
    expect(csv.slice(1).map((row) => row.split(",")[0])).toEqual([
      '"Fiado Digital"',
      '"Agenda Viva"',
      '"Rota Certa"',
    ]);
    expect(csv[1]?.endsWith(",0.750,2")).toBe(true);

    const table = read("00-tabelao.md");
    expect(table).toContain("| Torneio |");
    const fiadoRow = table.split("\n").find((line) => line.includes("| Fiado Digital |")) ?? "";
    expect(fiadoRow.startsWith("| 01 |")).toBe(true);
    expect(fiadoRow).toContain("| 0.750 (2) |");
    expect(table).toContain("média de pontos por partida");
  });

  test("coluna torneio: o indice do estudo ordena pelo torneio e explica o criterio", () => {
    const readme = files(data, tournament)("README.md");
    expect(readme).toContain("torneio par a par");
    const rows = readme.split("\n").filter((line) => /^\| 0\d \|/.test(line));
    expect(rows.map((row) => row.split("|")[2]?.trim().split("]")[0])).toEqual([
      "[Fiado Digital",
      "[Agenda Viva",
      "[Rota Certa",
    ]);
    expect(rows[0]).toContain("0.750");
  });

  test("chaves: CSV e dados.json mantem as chaves antigas e acrescentam o torneio no fim", () => {
    const read = files(data, tournament);
    expect(read("00-tabelao.csv").split("\n")[0]).toBe(`${OLD_CSV_HEADERS},torneio,partidas`);

    const dados = JSON.parse(read("dados.json")) as Record<string, unknown>;
    expect(Object.keys(dados)).toEqual([
      "config",
      "medias",
      "grupos_dor",
      "tiers",
      "ideias",
      "evidencias",
      "torneio_partidas",
    ]);
    const ideias = dados["ideias"] as Array<Record<string, unknown>>;
    expect(Object.keys(ideias[0] ?? {})).toEqual([...OLD_IDEA_KEYS, "torneio"]);
    expect(ideias.map((item) => item["nome"])).toEqual(["Fiado Digital", "Agenda Viva", "Rota Certa"]);
    expect(ideias[0]?.["torneio"]).toEqual({ pontos: 1.5, partidas: 2, vitorias: 2, folgas: 1, media: 0.75 });
    // Índice e tier continuam os das notas.
    expect(ideias[0]?.["indice"]).toBe(1.2);
    expect(ideias[0]?.["tier"]).toBe("C");
    expect(dados["torneio_partidas"]).toEqual([
      { rodada: 1, a: "Fiado Digital", b: "Rota Certa", p_a: 0.75 },
    ]);
  });

  test("chaves: estudo sem torneio ordena pelo indice e deixa a coluna vazia", () => {
    const old = data.map((item) => ({ ...item, tournament: null }));
    const read = files(old, null);
    const csv = read("00-tabelao.csv").trim().split("\n");
    expect(csv.slice(1).map((row) => row.split(",")[0])).toEqual([
      '"Agenda Viva"',
      '"Rota Certa"',
      '"Fiado Digital"',
    ]);
    expect(csv[1]?.endsWith(",,")).toBe(true);
    const dados = JSON.parse(read("dados.json")) as Record<string, unknown>;
    expect((dados["ideias"] as Array<Record<string, unknown>>)[0]?.["torneio"]).toBeNull();
    expect(dados["torneio_partidas"]).toEqual([]);
  });
});
