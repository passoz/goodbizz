import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildArtifactFiles } from "../src/application/artifacts.ts";
import {
  DADOS_CONFIG_KEYS,
  evaluationFromJson,
  evaluationToJson,
  loadIdeas,
  serializeDados,
} from "../src/application/dados.ts";
import { folderName, indexMarkdown, scopeNotice } from "../src/application/reports.ts";
import type {
  BusinessBlock,
  IdeaEvaluation,
  Indicators,
  PainBlock,
  StudyConfig,
  StudySummary,
} from "../src/domain/types.ts";

const config: StudyConfig = {
  niche: "Clinica Odontologica",
  city: "Recife",
  monthlyTicket: 300,
  numIdeas: 2,
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

function evaluation(init: EvaluationInit): IdeaEvaluation {
  return {
    name: init.name,
    sector: init.sector ?? "",
    description: `desc de ${init.name}`,
    indicators: {
      fit: 1,
      fitConf: 0.75,
      sale: 0.5,
      saleConf: 0.25,
      disruption: 0.5,
      disruptionConf: 0.125,
      pain: "dinheiro_direto",
      painProbs: { dinheiro_direto: 0.8, reputacao: 0.2 },
      painConf: 0.9,
      solo: 0.5,
      ...init.indicators,
    },
    business: {
      wtp: 0.85,
      meta30: 0.25,
      price: 1.5,
      priceConf: 0.7,
      ...init.business,
    },
    algorithm: {
      label: "FORTE",
      painScore: 0.75,
      internalScore: 0.5,
      margin: 0.25,
      deviation: 0.125,
      probes: { dinheiro: 0.75, reputacao: 0.4 },
      byParaphrase: { v1: { dinheiro: 0.75, reputacao: 0.4 }, v2: { dinheiro: 0.75, reputacao: 0.4 } },
      ...init.algorithm,
    },
    index: init.index,
    tier: "A",
  };
}

const data: IdeaEvaluation[] = [
  evaluation({ name: "Clinica Sorriso", sector: "Odontologia", index: 1 }),
  evaluation({
    name: "Oficina Rapida",
    sector: "Automotivo",
    index: 0.6,
    business: { wtp: 0.4, meta30: 0.1, price: 1.25, priceConf: 0.125 },
    algorithm: { label: "FRACA", painScore: 0.25, internalScore: 0.1, margin: -0.15, deviation: 0.3333 },
  }),
];
const ordered = [...data].sort((a, b) => b.index - a.index);
const folders: Record<string, string> = Object.fromEntries(
  ordered.map((idea, position) => [idea.name, folderName(position + 1, idea.name)]),
);
const summary: StudySummary = {
  ordered,
  means: { fit: 0.75, sale: 0.45, disruption: 0.6, solo: 0.5, wtp: 0.617, meta30: 0.175 },
  painGroups: { forte: ["Clinica Sorriso"], mista: [], fraca: ["Oficina Rapida"] },
  tiers: { A: ["Clinica Sorriso"], B: [], C: ["Oficina Rapida"] },
  attack: ["Clinica Sorriso"],
  review: [],
};
const brief = "Brief de contexto do teste.";

describe("buildArtifactFiles", () => {
  test("lista os arquivos na ordem do baseline", () => {
    const files = buildArtifactFiles(config, brief, summary, data, folders, {
      "Clinica Sorriso": "# Plano\n\nconteudo do plano\n",
    });
    expect(files.map((file) => file.path)).toEqual([
      "00-brief.md",
      "00-tabelao.md",
      "00-tabelao.csv",
      "README.md",
      "dados.json",
      "01-clinica-sorriso/README.md",
    ]);
  });

  test("00-brief.md junta titulo, aviso de escopo e brief", () => {
    const files = buildArtifactFiles(config, brief, summary, data, folders, {});
    const file = files.find((candidate) => candidate.path === "00-brief.md");
    expect(file?.content).toBe(
      `# Brief de contexto — ${config.niche}\n\n${scopeNotice(config)}\n${brief.trim()}\n`,
    );
  });

  test("README.md e o indice e nao existe quando nao ha pastas", () => {
    const withFolders = buildArtifactFiles(config, brief, summary, data, folders, {});
    const index = withFolders.find((file) => file.path === "README.md");
    expect(index?.content).toBe(indexMarkdown(config, brief, summary, folders));

    const withoutFolders = buildArtifactFiles(config, brief, summary, data, {}, {});
    expect(withoutFolders.map((file) => file.path)).toEqual([
      "00-brief.md",
      "00-tabelao.md",
      "00-tabelao.csv",
      "dados.json",
    ]);
  });

  test("ideia sem documento nao vira pasta", () => {
    const files = buildArtifactFiles(config, brief, summary, data, folders, {
      "Oficina Rapida": "   ",
    });
    expect(files.some((file) => file.path.includes("README.md") && file.path !== "README.md")).toBe(false);
  });

  test("dados.json traz config, medias, grupos_dor, tiers e ideias", () => {
    const files = buildArtifactFiles(config, brief, summary, data, folders, {});
    const raw = files.find((file) => file.path === "dados.json")?.content;
    const parsed = JSON.parse(String(raw)) as Record<string, any>;
    expect(Object.keys(parsed)).toEqual(["config", "medias", "grupos_dor", "tiers", "ideias"]);
    expect(Object.keys(parsed["config"])).toEqual(Object.values(DADOS_CONFIG_KEYS));
    expect(parsed["config"]).toEqual({
      nicho: "Clinica Odontologica",
      cidade: "Recife",
      ticket_mes: 300,
      n_ideias: 2,
      mock: true,
      so_avaliar: false,
    });
    expect(parsed["medias"]).toEqual({
      fit: 0.75,
      venda: 0.45,
      disrupcao: 0.6,
      solo: 0.5,
      wtp: 0.617,
      meta30: 0.175,
    });
    expect(parsed["grupos_dor"]).toEqual({
      forte: ["Clinica Sorriso"],
      mista: [],
      fraca: ["Oficina Rapida"],
    });
    expect(parsed["tiers"]).toEqual({ A: ["Clinica Sorriso"], B: [], C: ["Oficina Rapida"] });
    expect(parsed["ideias"]).toHaveLength(2);
    expect(parsed["ideias"][0]["nome"]).toBe("Clinica Sorriso");
    expect(String(raw)).toContain('\n "medias": {');
  });
});

describe("evaluation <-> json", () => {
  test("round-trip preserva todos os campos numericos", () => {
    for (const idea of data) {
      const restored = evaluationFromJson(evaluationToJson(idea));
      expect(restored).toEqual(idea);
      expect(restored.index).toBe(idea.index);
      expect(restored.indicators.disruptionConf).toBe(0.125);
      expect(restored.business.priceConf).toBe(idea.business.priceConf);
      expect(restored.algorithm.deviation).toBe(idea.algorithm.deviation);
      expect(restored.algorithm.probes).toEqual(idea.algorithm.probes);
      expect(restored.algorithm.byParaphrase).toEqual(idea.algorithm.byParaphrase);
    }
  });

  test("json usa as chaves do baseline", () => {
    expect(evaluationToJson(data[0]!)).toEqual({
      nome: "Clinica Sorriso",
      setor: "Odontologia",
      descricao: "desc de Clinica Sorriso",
      indicadores: {
        fit: 1,
        fit_conf: 0.75,
        venda: 0.5,
        venda_conf: 0.25,
        disrupcao: 0.5,
        disrupcao_conf: 0.125,
        dor: "dinheiro_direto",
        dor_probs: { dinheiro_direto: 0.8, reputacao: 0.2 },
        dor_conf: 0.9,
        solo: 0.5,
      },
      negocio: { wtp: 0.85, meta30: 0.25, preco: 1.5, preco_conf: 0.7 },
      algoritmo: {
        rotulo: "FORTE",
        escore_dor: 0.75,
        escore_interna: 0.5,
        margem: 0.25,
        desvio: 0.125,
        sondas: { dinheiro: 0.75, reputacao: 0.4 },
        por_parafrase: { v1: { dinheiro: 0.75, reputacao: 0.4 }, v2: { dinheiro: 0.75, reputacao: 0.4 } },
      },
      indice: 1,
      tier: "A",
    });
  });

  test("entrada parcial ou invalida vira valores neutros", () => {
    for (const raw of [undefined, null, 42, {}, { indicadores: { fit: "x" } }]) {
      const parsed = evaluationFromJson(raw);
      expect(parsed.name).toBe("");
      expect(parsed.indicators.fit).toBe(0);
      expect(parsed.indicators.painProbs).toEqual({});
      expect(parsed.business.wtp).toBe(0);
      expect(parsed.algorithm.probes).toEqual({});
      expect(parsed.algorithm.byParaphrase).toEqual({});
      expect(parsed.index).toBe(0);
      expect(parsed.tier).toBe("C");
    }
  });
});

describe("serializeDados", () => {
  test("identado com 1 espaco e sem o brief", () => {
    const text = serializeDados(config, brief, summary, data);
    expect(text).toContain('\n "config": {');
    expect(text).not.toContain(brief);
    expect(JSON.parse(text)["ideias"]).toHaveLength(2);
  });
});

describe("loadIdeas", () => {
  function writeIdeas(content: unknown): string {
    const dir = mkdtempSync(join(tmpdir(), "goodbizz-"));
    const path = join(dir, "ideias.json");
    writeFileSync(path, JSON.stringify(content), "utf-8");
    return path;
  }

  test("aceita lista de descricoes", () => {
    expect(loadIdeas(writeIdeas(["  Adega do Ze ", "Oficina"]))).toEqual([
      { name: "Adega do Ze", sector: "", description: "Adega do Ze" },
      { name: "Oficina", sector: "", description: "Oficina" },
    ]);
  });

  test("aceita objetos em portugues e em ingles", () => {
    const path = writeIdeas({
      ideias: [
        { nome: "Adega", setor: "Varejo", descricao: "vende vinho" },
        { name: "Oficina", sector: "Automotivo", description: "troca oleo" },
        { nome: "  " },
      ],
    });
    expect(loadIdeas(path)).toEqual([
      { name: "Adega", sector: "Varejo", description: "vende vinho" },
      { name: "Oficina", sector: "Automotivo", description: "troca oleo" },
      { name: "", sector: "", description: "" },
    ]);
  });

  test("recusa arquivo sem ideias", () => {
    const path = writeIdeas({ ideias: [] });
    expect(() => loadIdeas(path)).toThrow("does not contain usable ideas");
  });
});
