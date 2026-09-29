/**
 * `dados.json`: o esquema de chaves em portugues que o `recalibrate` le.
 * Mantenha os nomes estaveis — o leitor do baseline depende deles.
 */
import { readFileSync } from "node:fs";

import { ValidationError } from "../domain/errors.ts";
import type { Idea, IdeaEvaluation, StudyConfig, StudySummary, Tier } from "../domain/types.ts";

/**
 * Mapa campo do `StudyConfig` -> chave gravada em `config` dentro de dados.json.
 * Ordem das chaves = ordem de gravacao.
 */
export const DADOS_CONFIG_KEYS: Record<string, string> = {
  niche: "nicho",
  city: "cidade",
  monthlyTicket: "ticket_mes",
  numIdeas: "n_ideias",
  mock: "mock",
  evaluateOnly: "so_avaliar",
};

/** Converte uma avaliacao para o formato gravado em dados.json. */
export function evaluationToJson(evaluation: IdeaEvaluation): Record<string, unknown> {
  const i = evaluation.indicators;
  const g = evaluation.business;
  const a = evaluation.algorithm;
  return {
    nome: evaluation.name,
    setor: evaluation.sector,
    descricao: evaluation.description,
    indicadores: {
      fit: i.fit,
      fit_conf: i.fitConf,
      venda: i.sale,
      venda_conf: i.saleConf,
      disrupcao: i.disruption,
      disrupcao_conf: i.disruptionConf,
      dor: i.pain,
      dor_probs: i.painProbs,
      dor_conf: i.painConf,
      solo: i.solo,
    },
    negocio: {
      wtp: g.wtp,
      meta30: g.meta30,
      preco: g.price,
      preco_conf: g.priceConf,
    },
    algoritmo: {
      rotulo: a.label,
      escore_dor: a.painScore,
      escore_interna: a.internalScore,
      margem: a.margin,
      desvio: a.deviation,
      sondas: a.probes,
      por_parafrase: a.byParaphrase,
    },
    indice: evaluation.index,
    tier: evaluation.tier,
  };
}

/** Le uma avaliacao de dados.json; entrada desconhecida ou parcial vira valores neutros. */
export function evaluationFromJson(raw: unknown): IdeaEvaluation {
  const root = asRecord(raw);
  const ind = asRecord(root["indicadores"]);
  const neg = asRecord(root["negocio"]);
  const alg = asRecord(root["algoritmo"]);
  const rawTier = root["tier"];
  const tier: Tier = rawTier === "A" || rawTier === "B" || rawTier === "C" ? rawTier : "C";
  return {
    name: asString(root["nome"]),
    sector: asString(root["setor"]),
    description: asString(root["descricao"]),
    indicators: {
      fit: asNumber(ind["fit"]),
      fitConf: asNumber(ind["fit_conf"]),
      sale: asNumber(ind["venda"]),
      saleConf: asNumber(ind["venda_conf"]),
      disruption: asNumber(ind["disrupcao"]),
      disruptionConf: asNumber(ind["disrupcao_conf"]),
      pain: asString(ind["dor"]),
      painProbs: asNumberRecord(ind["dor_probs"]),
      painConf: asNumber(ind["dor_conf"]),
      solo: asNumber(ind["solo"]),
    },
    business: {
      wtp: asNumber(neg["wtp"]),
      meta30: asNumber(neg["meta30"]),
      price: asNumber(neg["preco"]),
      priceConf: asNumber(neg["preco_conf"]),
    },
    algorithm: {
      label: asString(alg["rotulo"]),
      painScore: asNumber(alg["escore_dor"]),
      internalScore: asNumber(alg["escore_interna"]),
      margin: asNumber(alg["margem"]),
      deviation: asNumber(alg["desvio"]),
      probes: asNumberRecord(alg["sondas"]),
      byParaphrase: asParaphraseMatrix(alg["por_parafrase"]),
    },
    index: asNumber(root["indice"]),
    tier,
  };
}

/**
 * Serializa o conteudo de dados.json.
 * @param _brief guardado no banco, nao em dados.json (o baseline nao o grava aqui).
 */
export function serializeDados(
  cfg: StudyConfig,
  _brief: string,
  summary: StudySummary,
  data: IdeaEvaluation[],
): string {
  const value = {
    config: {
      nicho: cfg.niche,
      cidade: cfg.city,
      ticket_mes: cfg.monthlyTicket,
      n_ideias: cfg.numIdeas,
      mock: cfg.mock,
      so_avaliar: cfg.evaluateOnly,
    },
    medias: {
      fit: summary.means.fit,
      venda: summary.means.sale,
      disrupcao: summary.means.disruption,
      solo: summary.means.solo,
      wtp: summary.means.wtp,
      meta30: summary.means.meta30,
    },
    grupos_dor: summary.painGroups,
    tiers: summary.tiers,
    ideias: data.map(evaluationToJson),
  };
  return JSON.stringify(value, null, 1);
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** Usado em ~14 campos numericos: ausencia ou tipo errado vira 0. */
function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Usado em todos os campos de texto: ausencia ou tipo errado vira "". */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumberRecord(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(asRecord(value))) {
    if (typeof raw === "number" && Number.isFinite(raw)) out[key] = raw;
  }
  return out;
}

function asParaphraseMatrix(value: unknown): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const [key, raw] of Object.entries(asRecord(value))) out[key] = asNumberRecord(raw);
  return out;
}

/**
 * Le a lista de ideias de um arquivo: aceita `[{"nome","setor","descricao"}]`,
 * `[{"name","sector","description"}]`, `["descricao"]` ou um objeto com `ideias`/`ideas`.
 */
export function loadIdeas(path: string): Idea[] {
  const parsed: unknown = JSON.parse(readFileSync(path, "utf-8"));
  const entries = Array.isArray(parsed)
    ? parsed
    : (nonEmptyList(asRecord(parsed)["ideias"]) ?? nonEmptyList(asRecord(parsed)["ideas"]) ?? []);
  const ideas = entries.map((entry, position): Idea => {
    const index = position + 1;
    if (typeof entry === "string") {
      const text = entry.trim();
      return { name: text, sector: "", description: text };
    }
    const row = asRecord(entry);
    const name = (asString(row["nome"]) || asString(row["name"]) || `Ideia ${index}`).trim();
    return {
      name,
      sector: (asString(row["setor"]) || asString(row["sector"])).trim(),
      description: (asString(row["descricao"]) || asString(row["description"]) || name).trim(),
    };
  });
  if (ideas.length === 0) throw new ValidationError(`${path} does not contain usable ideas`);
  return ideas;
}

/** Espelha o `or` do Python: lista vazia/ausente vira `null` para o fallback seguinte. */
function nonEmptyList(value: unknown): unknown[] | null {
  return Array.isArray(value) && value.length > 0 ? value : null;
}
