import { describe, expect, test } from "bun:test";

import { buildZip } from "../src/application/artifacts.ts";
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

/** Mesma forma do baseline, sem o `id`: ele vive na coluna `idea_id` (CON-006). */
function baselineShape(idea: StudyIdea): IdeaEvaluation {
  const copy = { ...idea } as IdeaEvaluation;
  delete (copy as Partial<StudyIdea>).id;
  return copy;
}

function evaluation(init: EvaluationInit): StudyIdea {
  return {
    id: `id-${init.name}`,
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

const data: StudyIdea[] = [
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

  test("o plano assina a data de geracao da ideia, e ideia sem data nao ganha rodape", () => {
    const documents = { "Clinica Sorriso": "# Plano\n\nconteudo do plano\n" };
    const dated = [...data];
    dated[0] = { ...data[0]!, generatedAt: "2026-09-25T14:32:00.000Z" };

    const withDate = buildArtifactFiles(config, brief, summary, dated, folders, documents);
    const plan = withDate.find((file) => file.path === "01-clinica-sorriso/README.md");
    // A data sai no rodape, nao no corpo do prompt (o guardrail de numeros confere o texto do LLM).
    expect(plan?.content).toMatch(/\n\n---\n\n_Gerada em \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}_\n$/);
    expect(plan?.content).toContain("conteudo do plano");

    const withoutDate = buildArtifactFiles(config, brief, summary, data, folders, documents);
    const plain = withoutDate.find((file) => file.path === "01-clinica-sorriso/README.md");
    expect(plain?.content).not.toContain("Gerada em");
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
      // O `id` nao faz parte da forma do baseline: ele vive na coluna `idea_id`, nao no JSON
      // lido pelas ferramentas Python (CON-006). O round-trip compara a forma, sem a identidade.
      expect(restored).toEqual(baselineShape(idea));
      expect(Object.keys(evaluationToJson(idea))).not.toContain("id");
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

/** Le um ZIP pelo diretorio central: verifica a estrutura de verdade, nao so o gerador. */
function readZip(
  bytes: Uint8Array<ArrayBuffer>,
): Array<{ name: string; size: number; method: number; text: string }> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const entries: Array<{ name: string; size: number; method: number; text: string }> = [];
  for (let index = 0; index < count; index++) {
    expect(view.getUint32(cursor, true)).toBe(0x02014b50);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = bytes.subarray(start, start + compressedSize);
    const payload = method === 8 ? Bun.inflateSync(raw) : raw;
    entries.push({ name, size, method, text: new TextDecoder().decode(payload) });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

describe("buildZip", () => {
  const encoder = new TextEncoder();

  test("produz um ZIP legivel pelo diretorio central, com deflate e store", () => {
    const zip = buildZip(
      [
        { path: "a.txt", data: new Uint8Array(encoder.encode("ola")) },
        { path: "pasta/b.md", data: new Uint8Array(encoder.encode("# titulo\n".repeat(40))) },
      ],
      new Date("2026-01-02T03:04:06Z"),
    );

    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    const entries = readZip(zip);
    expect(entries.map((entry) => entry.name)).toEqual(["a.txt", "pasta/b.md"]);
    expect(entries[0]?.text).toBe("ola");
    expect(entries[1]?.text).toBe("# titulo\n".repeat(40));
    expect(entries[0]?.size).toBe(3);
    // Texto repetitivo comprime; arquivo minusculo fica em store para nao crescer.
    expect(entries[1]?.method).toBe(8);
    expect(entries[0]?.method).toBe(0);
  });

  test("e deterministico para a mesma entrada e data", () => {
    const at = new Date("2026-01-02T03:04:06Z");
    const once = buildZip([{ path: "x.md", data: new Uint8Array(encoder.encode("conteudo")) }], at);
    const twice = buildZip([{ path: "x.md", data: new Uint8Array(encoder.encode("conteudo")) }], at);
    expect(Array.from(once)).toEqual(Array.from(twice));
  });
});
