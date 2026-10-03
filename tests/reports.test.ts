import { describe, expect, test } from "bun:test";

import {
  folderName,
  indexMarkdown,
  indicatorsTableCsv,
  indicatorsTableMarkdown,
  scopeNotice,
  slug,
} from "../src/application/reports.ts";
import type {
  BusinessBlock,
  StudyIdea,
  Indicators,
  PainBlock,
  StudyConfig,
  StudySummary,
} from "../src/domain/types.ts";

const config: StudyConfig = {
  niche: "Clinica Odontologica",
  description: "",
  cacheSeed: "",
  providerFingerprint: "",
  city: "Recife",
  monthlyTicket: 300,
  numIdeas: 3,
  outputDir: "estudo",
  ideasFile: "",
  evaluateOnly: false,
  painMethod: "choice",
  mock: true,
  mockLlm: true,
  mockDecider: true,
  pdf: false,
  paraphrases: 3,
  concurrency: 8,
  timeout: 60,
  llmBaseUrl: "",
  llmModel: "",
  llmKey: "",
  deciderUrl: "",
  deciderModel: "",
  deciderKey: "",
};

interface EvaluationInit {
  name: string;
  index: number;
  sector?: string;
  indicators?: Partial<Indicators>;
  business?: Partial<BusinessBlock>;
  algorithm?: Partial<PainBlock>;
}

function evaluation(init: EvaluationInit): StudyIdea {
  return {
    id: `id-${init.name}`,
    name: init.name,
    sector: init.sector ?? "",
    description: `desc de ${init.name}`,
    indicators: {
      fit: 1,
      fitConf: 1,
      sale: 1,
      saleConf: 1,
      disruption: 0.5,
      disruptionConf: 0.5,
      pain: "dinheiro_direto",
      painProbs: { dinheiro_direto: 1 },
      painConf: 1,
      solo: 1,
      ...init.indicators,
    },
    business: {
      wtp: 0.5,
      meta30: 0.2,
      price: 1,
      priceConf: 0.5,
      ...init.business,
    },
    algorithm: {
      label: "FORTE",
      painScore: 0.75,
      internalScore: 0.5,
      margin: 0.25,
      deviation: 0.1,
      probes: { dinheiro: 0.75 },
      byParaphrase: { v1: { dinheiro: 0.75 } },
      ...init.algorithm,
    },
    index: init.index,
    tier: "C",
  };
}

/** Mesma amostra usada para conferir o baseline Python linha a linha. */
function sampleData(): StudyIdea[] {
  return [
    evaluation({
      name: "Clinica Sorriso",
      sector: "Odontologia",
      index: 1,
      indicators: {
        fit: 1,
        fitConf: 1,
        sale: 1,
        saleConf: 0.75,
        disruption: 0.5,
        disruptionConf: 0.125,
        pain: "dinheiro_direto",
        painConf: 0.9,
        solo: 1,
      },
      business: { wtp: 0.85, meta30: 0.25, price: 1.5, priceConf: 0.7 },
      algorithm: { label: "FORTE", painScore: 0.75, internalScore: 0.5, margin: 0.25, deviation: 0.005 },
    }),
    evaluation({
      name: "Oficina Rapida",
      sector: "Automotivo",
      index: 0.6,
      indicators: {
        fit: 0.5,
        fitConf: 0.5,
        sale: 0.7,
        saleConf: 0.5,
        disruption: 0.3,
        disruptionConf: 0.5,
        pain: "backoffice",
        painConf: 0.6,
        solo: 0.5,
      },
      business: { wtp: 0.4, meta30: 0.1, price: 1.25, priceConf: 0.125 },
      algorithm: { label: "FRACA", painScore: 0.25, internalScore: 0.1, margin: -0.15, deviation: 0.125 },
    }),
    evaluation({
      name: "Adega Central",
      sector: "Varejo",
      index: 0.75,
      indicators: {
        fit: 0.9,
        fitConf: 0.8,
        sale: 0.6,
        saleConf: 0.9,
        disruption: 0.7,
        disruptionConf: 0.6,
        pain: "reputacao",
        solo: 0.9,
      },
      business: { wtp: 0.6, meta30: 0.35, price: 0.8, priceConf: 0.4 },
      algorithm: {
        label: "INDETERMINADO",
        painScore: 0.5,
        internalScore: 0.45,
        margin: 0.05,
        deviation: 0.3333,
      },
    }),
  ];
}

describe("slug", () => {
  test("normaliza acentos, espacos e pontuacao", () => {
    expect(slug("Clinica Odontologica")).toBe("clinica-odontologica");
    expect(slug("  Ação & Cia -- 2.0  ")).toBe("acao-cia-2-0");
    expect(slug("ÁÉÍÓÚ Ç")).toBe("aeiou-c");
  });

  test("cai em `idea` quando nao sobra nada", () => {
    expect(slug("")).toBe("idea");
    expect(slug("---")).toBe("idea");
  });
});

describe("folderName", () => {
  test("prefixa o rank com dois digitos", () => {
    expect(folderName(1, "X")).toBe("01-x");
    expect(folderName(12, "Clinica Odontologica")).toBe("12-clinica-odontologica");
  });
});

describe("scopeNotice", () => {
  test("cita nicho, cidade e ticket", () => {
    const notice = scopeNotice(config);
    expect(notice).toContain("**Clinica Odontologica em Recife**");
    expect(notice).toContain("R$ 300/mês");
    expect(notice.endsWith("\n")).toBe(true);
  });

  test("sem cidade usa so o nicho", () => {
    expect(scopeNotice({ ...config, city: "" })).toContain("nicho **Clinica Odontologica**.");
  });
});

describe("indicatorsTableMarkdown", () => {
  test("toda linha da tabela tem a mesma contagem de `|` do separador", () => {
    const text = indicatorsTableMarkdown(config, sampleData());
    const lines = text.split("\n");
    const separator = lines.find((line) => line.startsWith("|---"));
    expect(separator).toBeDefined();
    const pipes = separator!.split("|").length;
    const rows = lines.filter((line) => line.startsWith("|"));
    expect(rows).toHaveLength(5); // cabecalho + separador + 3 ideias
    for (const row of rows) expect(row.split("|").length).toBe(pipes);
  });

  test("ordena pelo indice decrescente", () => {
    const rows = indicatorsTableMarkdown(config, sampleData())
      .split("\n")
      .filter((line) => line.startsWith("| 0"));
    expect(rows.map((row) => row.split("|")[2]?.trim())).toEqual([
      "Clinica Sorriso",
      "Adega Central",
      "Oficina Rapida",
    ]);
  });

  test("formata como o baseline (casas fixas, sinal na margem, empate para o par)", () => {
    const text = indicatorsTableMarkdown(config, sampleData());
    expect(text).toContain(
      "| 01 | Clinica Sorriso | Odontologia | 1.00 | 1.00 | 1.00 | 0.75 | 0.50 | 0.12 | " +
        "dinheiro_direto | 1.00 | **1.0** | C | FORTE | 0.75 | 0.50 | +0.25 | 0.005 | " +
        "0.85 | 0.25 | 1.50 |",
    );
    expect(text).toContain("| 03 | Oficina Rapida | Automotivo |");
    expect(text).toContain("| -0.15 | 0.125 |");
    expect(text.endsWith("\n")).toBe(true);
  });
});

describe("indicatorsTableCsv", () => {
  test("cabecalho igual ao do baseline", () => {
    const header = indicatorsTableCsv(sampleData()).split("\n")[0];
    expect(header).toBe(
      "ideia,setor,indice,tier,fit,fit_conf,venda,venda_conf,disrupcao,disrupcao_conf," +
        "dor,dor_conf,solo,algo,algo_dor,algo_interna,algo_margem,algo_desvio,wtp,meta30," +
        "preco,preco_conf",
    );
  });

  test("linha conhecida com os valores arredondados", () => {
    const rows = indicatorsTableCsv(sampleData()).split("\n");
    expect(rows[1]).toBe(
      '"Clinica Sorriso","Odontologia",1.000,C,1.00,1.00,1.00,0.75,0.50,0.12,' +
        '"dinheiro_direto",0.90,1.00,FORTE,0.750,0.500,+0.250,0.005,0.85,0.25,1.50,0.70',
    );
    expect(rows[3]).toBe(
      '"Oficina Rapida","Automotivo",0.600,C,0.50,0.50,0.70,0.50,0.30,0.50,' +
        '"backoffice",0.60,0.50,FRACA,0.250,0.100,-0.150,0.125,0.40,0.10,1.25,0.12',
    );
    expect(rows).toHaveLength(5); // cabecalho + 3 ideias + linha vazia final
  });
});

describe("indexMarkdown", () => {
  const data = sampleData();
  const ordered = [...data].sort((a, b) => b.index - a.index);
  const summary: StudySummary = {
    ordered,
    means: { fit: 0.8, sale: 0.767, disruption: 0.5, solo: 0.8, wtp: 0.617, meta30: 0.233 },
    painGroups: {
      forte: ["Clinica Sorriso", "Adega Central"],
      mista: [],
      fraca: ["Oficina Rapida"],
    },
    tiers: { A: [], B: [], C: ordered.map((idea) => idea.name) },
    attack: [],
    review: [],
  };
  const folders = Object.fromEntries(
    ordered.map((idea, position) => [idea.name, folderName(position + 1, idea.name)]),
  );

  test("lista as ideias em ordem decrescente de indice", () => {
    const text = indexMarkdown(config, "Brief curto de mercado.", summary, folders);
    const ranking = text
      .split("\n")
      .filter((line) => line.startsWith("| 0"))
      .map((line) => /\[(.+?)\]/.exec(line)?.[1]);
    expect(ranking).toEqual(["Clinica Sorriso", "Adega Central", "Oficina Rapida"]);
    expect(text).toContain(
      "| 01 | [Clinica Sorriso](./01-clinica-sorriso/) | Odontologia | **1.0** | C | 0.85 | FORTE |",
    );
  });

  test("inclui medias, grupos de dor e brief", () => {
    const text = indexMarkdown(config, "Brief curto de mercado.", summary, folders);
    expect(text).toContain("- fit **0.8** · venda **0.767** · disrupção **0.5** · suporte solo **0.8**");
    expect(text).toContain("- tiers — A: 0 · B: 0 · C: 3");
    expect(text).toContain("- Dor mista: nenhuma");
    expect(text).toContain("## Brief de contexto\n\nBrief curto de mercado.");
  });

  test("sem brief nao cria a secao", () => {
    const text = indexMarkdown(config, "  ", summary, folders);
    expect(text).not.toContain("## Brief de contexto");
  });
});
