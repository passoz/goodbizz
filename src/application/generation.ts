/**
 * Generation calls: market brief, idea list, and the per-idea strategy document.
 *
 * Core rule: NUMBERS are calculated by code. The LLM only writes prose around them and is
 * never allowed to invent new numbers. Ported from the Python baseline `goodbizz/generation.py`
 * plus the `load_ideas` helper of `generate_study.py`.
 */
import { ValidationError } from "../domain/errors.ts";
import { extractJson } from "../infrastructure/json.ts";
import type { LlmClient } from "../domain/ports.ts";
import type { Idea, IdeaEvaluation, StudyConfig } from "../domain/types.ts";
import { BRIEF_SYSTEM_PROMPT, DOC_SYSTEM_PROMPT, IDEAS_SYSTEM_PROMPT } from "./prompts.ts";

/**
 * Normalises a decoded ideas payload into `Idea[]`.
 * Accepts an array of strings or objects, or a wrapper object with `ideias`/`ideas`.
 * Numbers the ideas from 1 and throws `ValidationError` when nothing usable is found.
 */
export function parseIdeas(data: unknown): Idea[] {
  let items: unknown[] = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (data !== null && typeof data === "object") {
    const wrapper = data as Record<string, unknown>;
    const inner = wrapper.ideias || wrapper.ideas;
    if (Array.isArray(inner)) items = inner;
  }

  const ideas: Idea[] = [];
  for (const [offset, item] of items.entries()) {
    const position = offset + 1;
    if (typeof item === "string") {
      const text = item.trim();
      ideas.push({ name: text, sector: "", description: text });
      continue;
    }
    if (item === null || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const name = String(record.nome || record.name || `Ideia ${position}`).trim();
    const sector = String(record.setor || record.sector || "").trim();
    const description = String(record.descricao || record.description || name).trim();
    ideas.push({ name, sector, description });
  }

  if (ideas.length === 0) {
    throw new ValidationError("ideas payload does not contain usable ideas");
  }
  return ideas;
}

/** Writes a short market brief for the configured niche. */
export async function generateBrief(llm: LlmClient, cfg: StudyConfig): Promise<string> {
  const user =
    `Nicho: ${cfg.niche}\n` +
    `Cidade ou regiao alvo: ${cfg.city || "nao informada"}\n` +
    `Ticket mensal considerado: R$ ${cfg.monthlyTicket}\n`;
  const text = await llm.generateText(BRIEF_SYSTEM_PROMPT, user);
  return text.trim();
}

/** Asks the LLM for `count` product ideas grounded on the brief. */
export async function generateIdeas(
  llm: LlmClient,
  cfg: StudyConfig,
  brief: string,
  count: number,
): Promise<Idea[]> {
  const user =
    `Nicho: ${cfg.niche}\n` +
    `Cidade ou regiao alvo: ${cfg.city || "nao informada"}\n` +
    `Ticket mensal considerado: R$ ${cfg.monthlyTicket}\n\n` +
    `Brief de mercado:\n${brief}\n\n` +
    `Gere exatamente ${count} ideias em JSON. Retorne apenas o array.`;
  const text = await llm.generateText(IDEAS_SYSTEM_PROMPT, user);
  const raw = extractJson(text);
  if (!Array.isArray(raw)) {
    throw new ValidationError(`expected JSON array of ideas, got: ${typeof raw}`);
  }
  // The requested count is authoritative: a provider (or the offline fixture) that returns more
  // ideas than asked is trimmed, so `--ideas N` always yields N ideas.
  const ideas = parseIdeas(raw);
  return count > 0 ? ideas.slice(0, count) : ideas;
}

/**
 * Formatted text with ALL measured numbers for one idea.
 * This is the only source of numbers the document generator may use.
 */
export function dataBlock(evaluation: IdeaEvaluation, cfg: StudyConfig): string {
  const ind = evaluation.indicators;
  const biz = evaluation.business;
  const algo = evaluation.algorithm;
  const probs = Object.keys(ind.painProbs)
    .sort()
    .map((key) => `${key}=${(ind.painProbs[key] ?? 0).toFixed(2)}`)
    .join(", ");

  return [
    `Ideia: ${evaluation.name} (setor: ${evaluation.sector || "nao informado"})`,
    `Descricao: ${evaluation.description}`,
    `Nicho: ${cfg.niche}` + (cfg.city ? ` | Cidade/regiao: ${cfg.city}` : ""),
    `Ticket assumido: R$ ${cfg.monthlyTicket}/mes (R$ ${cfg.monthlyTicket * 12}/ano)`,
    "",
    `INDICE DE ACAO: ${evaluation.index} | TIER: ${evaluation.tier}`,
    `fit: ${ind.fit}/2.00 (confianca ${ind.fitConf.toFixed(2)})`,
    `facilidade de venda: ${ind.sale}/2.00 (confianca ${ind.saleConf.toFixed(2)})`,
    `disrupcao: ${ind.disruption}/2.00 (confianca ${ind.disruptionConf.toFixed(2)})`,
    `tipo de dor: ${ind.pain} (confianca ${ind.painConf.toFixed(2)}) | distribuicao: ${probs}`,
    `suporte solo: ${ind.solo.toFixed(2)}`,
    "",
    `ALGORITMO DA DOR: ${algo.label} | escore de dor ${algo.painScore} | ` +
      `dor interna ${algo.internalScore} | margem ${algo.margin >= 0 ? "+" : "-"}${Math.abs(algo.margin).toFixed(2)} | desvio ${algo.deviation}`,
    `VALIDACAO: pagaria R$ ${cfg.monthlyTicket}/mes = ${biz.wtp.toFixed(2)} | ` +
      `30 clientes em 24 meses = ${biz.meta30.toFixed(2)} | ` +
      `preco vs valor = ${biz.price}/2.00 (confianca ${biz.priceConf.toFixed(2)})`,
    "",
    "Escalas: fit 0=exige escala corporativa, 1=exige mudar rotina, 2=resolve o caos sem " +
      "mudar habito. Venda 0=beneficio invisivel, 2=ataca perda de dinheiro/reputacao " +
      "imediata. Disrupcao 0=so automatiza o que existe, 2=muda o modelo de operacao. " +
      "Preco 0=acima do valor percebido, 2=abaixo do valor com folga.",
    "",
    "Regras de negocio para este plano: o ticket e TETO, nao piso; a meta de clientes e de " +
      "10 a 15 em 24 meses (o 30 medido e upside, nao base); nenhum TAM nacional deve ser " +
      "usado como argumento principal.",
  ].join("\n");
}

/** Writes the full strategy document for one evaluated idea. */
export async function generateDocument(
  llm: LlmClient,
  evaluation: IdeaEvaluation,
  cfg: StudyConfig,
  brief: string,
): Promise<string> {
  const user =
    `DADOS MEDIDOS\n${dataBlock(evaluation, cfg)}\nFIM DOS DADOS\n\n` +
    `Brief de contexto do nicho:\n${brief}\n\n` +
    "Escreva o documento desta ideia seguindo a estrutura obrigatoria.";
  const text = await llm.generateText(DOC_SYSTEM_PROMPT, user);
  return text.trim();
}
