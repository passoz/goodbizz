/**
 * Mede o tipo de dor por escolha forcada de três vias, em vez de quatro sondas binarias.
 *
 * Portado de `goodbizz/pain_choice.py`. As sondas binarias davam falso positivo em
 * "tecnologia"; a escolha forcada entre consequências diretas (dinheiro, reputação,
 * backoffice) e estável e não oferece "tecnologia" como opção.
 */
import { classifyPain, populationMean, populationStdDev, roundTo } from "./pain-algorithm.ts";
import type { DeciderClient } from "../domain/ports.ts";
import type { PainResult, Question } from "../domain/types.ts";

/** Consequencias oferecidas ao dono, sem a opção de tecnologia. */
export const PAIN_OPTIONS: Record<string, string> = {
  dinheiro_direto:
    "Ele perde dinheiro que entra: venda que não fecha, cobranca que não acontece, " + "custo que sobe.",
  reputacao:
    "Ele fica mal falado: avaliação ruim publicada, cliente reclamando para outros, " + "nota caindo.",
  backoffice:
    "Nada de grave acontece com dinheiro ou imagem: sobra trabalho manual e " +
    "desorganizacao para a equipe.",
};

/** Tres redacoes independentes da mesma pergunta de escolha. */
export const PAIN_INSTRUCTIONS: string[] = [
  "Se este problema não for resolvido, o que acontece de pior com o dono tipico deste " +
    "nicho? Escolha a consequência mais direta para ELE.",
  "Qual é a pior consequência, para o dono, de deixar este problema como está?",
  "Que tipo de dor esta ideia resolve para o dono do negócio?",
];

/** Opcao escolhida -> nome da sonda que ela representa. */
const OPTION_TO_PROBE: Record<string, string> = {
  dinheiro_direto: "dinheiro",
  reputacao: "reputacao",
  backoffice: "processo",
};

export function choiceQuestions(): Question[] {
  const questions: Question[] = [];
  for (const instructions of PAIN_INSTRUCTIONS) {
    questions.push({ type: "choice", instructions, criteria: { ...PAIN_OPTIONS } });
  }
  return questions;
}

export interface ChoiceMeasurement {
  probes: Record<string, number>;
  byParaphrase: Record<string, Record<string, number>>;
}

/** Extrai um mapa de probabilidades de um campo `probabilities`/`probs` útil. */
function probabilityMap(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entries = Object.entries(value);
  if (entries.length === 0) return null;
  const out: Record<string, number> = {};
  for (const [key, raw] of entries) out[key] = Number(raw);
  return out;
}

/**
 * Pergunta a escolha forçada três vezes e agrega as probabilidades por sonda.
 * "Tecnologia" e fixada em 0: ela capturava qualquer coisa e foi removida das opções.
 */
export async function measurePainChoice(decider: DeciderClient, state: string): Promise<ChoiceMeasurement> {
  const byParaphrase: Record<string, Record<string, number>> = {};

  for (const [index, question] of choiceQuestions().entries()) {
    const answers = await decider.ask(state, { dor: question });
    const answer = answers["dor"];
    let probabilities: Record<string, number> | null = null;
    if (answer && typeof answer === "object" && !Array.isArray(answer)) {
      const record = answer as Record<string, unknown>;
      probabilities = probabilityMap(record["probabilities"]) ?? probabilityMap(record["probs"]);
      if (probabilities === null && typeof record["choice"] === "string" && record["choice"]) {
        probabilities = { [record["choice"]]: 1 };
      }
    } else if (answer) {
      probabilities = { [String(answer)]: 1 };
    }

    const row: Record<string, number> = {};
    for (const option of Object.keys(PAIN_OPTIONS)) {
      const probe = OPTION_TO_PROBE[option];
      if (probe) row[probe] = Number(probabilities?.[option] ?? 0);
    }
    byParaphrase[`P${index + 1}`] = row;
  }

  const rows = Object.values(byParaphrase);
  const probes: Record<string, number> = {
    dinheiro: 0,
    reputacao: 0,
    processo: 0,
    tecnologia: 0,
  };
  for (const probe of ["dinheiro", "reputacao", "processo"]) {
    probes[probe] = roundTo(populationMean(rows.map((row) => row[probe] ?? 0)), 4);
  }

  return { probes, byParaphrase };
}

/** Adapta a medição de escolha ao formato consumido pelo resto do pipeline. */
export function painResultFromChoice(measured: ChoiceMeasurement): PainResult {
  const probes = measured.probes;
  const painScore = Math.max(probes["dinheiro"] ?? 0, probes["reputacao"] ?? 0);
  const internalScore = Math.max(probes["processo"] ?? 0, probes["tecnologia"] ?? 0);
  const rows = Object.values(measured.byParaphrase);
  const probeKeys = Object.keys(rows[0] ?? {});

  let deviation = 0;
  for (const probe of probeKeys) {
    const rowDeviation = populationStdDev(rows.map((row) => row[probe] ?? 0));
    if (rowDeviation > deviation) deviation = rowDeviation;
  }

  const { label, escalate, reason } = classifyPain(painScore, internalScore, deviation);

  const byParaphrase: Record<string, Record<string, number>> = {};
  for (const [variant, row] of Object.entries(measured.byParaphrase)) {
    byParaphrase[variant] = { ...row };
  }
  const detail: Record<string, number> = {};
  for (const [probe, value] of Object.entries(probes)) {
    detail[probe] = roundTo(value, 4);
  }

  return {
    label,
    escalate,
    reason,
    painScore,
    internalScore,
    margin: painScore - internalScore,
    deviation,
    detail,
    byParaphrase,
  };
}
