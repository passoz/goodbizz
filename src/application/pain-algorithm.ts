/**
 * Teste automatico de "dor forte x dor fraca" para ideias de produto.
 *
 * Portado de `goodbizz/algorithm.py`. Quatro sondas atomicas em tres parafrases
 * independentes; o desvio entre parafrases acima do limiar marca a medicao como instavel.
 * Os limiares foram calibrados sobre 17 casos reais e nao devem mudar.
 */
import { ValidationError } from "../domain/errors.ts";
import {
  DEFAULT_CONTEXT,
  DEFAULT_VARIANTS,
  INTERNAL_PROBES,
  MIN_PARAPHRASES,
  PAIN_PROBES,
  STRONG_PROBES,
  STRONG_THRESHOLD,
  UNSTABLE_THRESHOLD,
  WEAK_THRESHOLD,
  probeQuestions,
} from "../domain/pain.ts";
import type { DeciderClient } from "../domain/ports.ts";
import type { PainLabel, PainResult } from "../domain/types.ts";

/** Decisor minimo exigido pelo algoritmo: devolve P(sim) por id de sonda. */
export interface PainBackend {
  queryProbes(state: string, probes: Record<string, string>): Promise<Record<string, number>>;
}

/**
 * Arredondamento decimal meio-para-par (mesma regra do `round()` do Python).
 * Utilitario compartilhado por evaluate/summary, evitando reimplementacoes divergentes.
 */
export function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const sign = scaled < 0 ? -1 : 1;
  const absolute = Math.abs(scaled);
  const floor = Math.floor(absolute);
  const diff = absolute - floor;
  const rounded = diff > 0.5 ? floor + 1 : diff < 0.5 ? floor : floor % 2 === 0 ? floor : floor + 1;
  return (sign * rounded) / factor;
}

/** Media populacional (equivale a statistics.mean); exata quando todos os valores sao iguais. */
export function populationMean(values: readonly number[]): number {
  const base = values[0] ?? 0;
  return base + values.reduce((total, value) => total + (value - base), 0) / values.length;
}

/** Desvio padrao populacional (equivale a statistics.pstdev; divide por N). */
export function populationStdDev(values: readonly number[]): number {
  const mean = populationMean(values);
  return Math.sqrt(values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length);
}

/** Formata com sinal explicito, como o `{:+.2f}` do Python. */
function signed(value: number, digits: number): string {
  return `${value < 0 ? "-" : "+"}${Math.abs(value).toFixed(digits)}`;
}

/**
 * Escada de classificacao compartilhada com a medicao por escolha forcada.
 * A ordem dos testes e a do baseline: instabilidade, dor forte, dor interna, resto.
 */
export function classifyPain(
  painScore: number,
  internalScore: number,
  maxDeviation: number,
): { label: PainLabel; escalate: boolean; reason: string } {
  const margin = painScore - internalScore;
  if (maxDeviation > UNSTABLE_THRESHOLD) {
    return {
      label: "INSTAVEL",
      escalate: true,
      reason: `sondas divergem entre paráfrases (desvio ${maxDeviation.toFixed(3)} > ${UNSTABLE_THRESHOLD})`,
    };
  }
  if (painScore >= STRONG_THRESHOLD && painScore > internalScore) {
    return { label: "FORTE", escalate: false, reason: "dor com dono claro e dominante" };
  }
  if (internalScore >= WEAK_THRESHOLD && internalScore > painScore) {
    return { label: "FRACA", escalate: false, reason: "dor interna, sem dono claro do prejuízo" };
  }
  if (painScore < STRONG_THRESHOLD && internalScore < WEAK_THRESHOLD) {
    return {
      label: "INDETERMINADO",
      escalate: true,
      reason: `zona cinzenta: dor=${painScore.toFixed(2)} não supera o limiar seguro ${STRONG_THRESHOLD}`,
    };
  }
  return {
    label: "INDETERMINADO",
    escalate: true,
    reason: `empate técnico: dor=${painScore.toFixed(2)} vs interna=${internalScore.toFixed(2)} (margem ${signed(margin, 2)})`,
  };
}

/**
 * Roda as sondas em todas as parafrases e combina os resultados.
 * @param variants parafrases usadas; menos de `MIN_PARAPHRASES` nao e confiavel.
 */
export async function evaluatePain(
  description: string,
  backend: DeciderClient,
  context: string,
  variants: readonly string[] = DEFAULT_VARIANTS,
): Promise<PainResult> {
  if (variants.length < MIN_PARAPHRASES) {
    throw new ValidationError(`need at least ${MIN_PARAPHRASES} paraphrases (received ${variants.length})`);
  }

  const state = `${context}\n\nIdeia:\n${description}`;
  const byParaphrase: Record<string, Record<string, number>> = {};

  for (const variant of variants) {
    const probes = PAIN_PROBES[variant] ?? {};
    const raw = await backend.queryProbes(state, probeQuestions(variant));
    const row: Record<string, number> = {};
    for (const key of Object.keys(probes)) {
      row[key] = Number(raw[`p_${key}`] ?? 0);
    }
    byParaphrase[variant] = row;
  }

  const [firstVariant] = variants;
  const probeKeys = firstVariant === undefined ? [] : Object.keys(byParaphrase[firstVariant] ?? {});
  const means: Record<string, number> = {};
  const deviations: number[] = [];
  for (const key of probeKeys) {
    const values = variants.map((variant) => byParaphrase[variant]?.[key] ?? 0);
    means[key] = populationMean(values);
    deviations.push(populationStdDev(values));
  }

  const maxDeviation = deviations.length > 0 ? Math.max(...deviations) : 0;
  const painScore = Math.max(...STRONG_PROBES.map((probe) => means[probe] ?? 0));
  const internalScore = Math.max(...INTERNAL_PROBES.map((probe) => means[probe] ?? 0));
  const margin = painScore - internalScore;
  const { label, escalate, reason } = classifyPain(painScore, internalScore, maxDeviation);

  const rows: Record<string, Record<string, number>> = {};
  for (const [variant, row] of Object.entries(byParaphrase)) {
    rows[variant] = { ...row };
  }

  return {
    label,
    escalate,
    reason,
    painScore: roundTo(painScore, 4),
    internalScore: roundTo(internalScore, 4),
    margin: roundTo(margin, 4),
    deviation: roundTo(maxDeviation, 4),
    detail: Object.fromEntries(probeKeys.map((key) => [key, roundTo(means[key] ?? 0, 4)])),
    byParaphrase: rows,
  };
}

/** Traduz o rotulo em recomendacao de negocio. */
export function recommendPain(result: PainResult): string {
  if (result.label === "FORTE" && !result.escalate) {
    return "AVANÇAR — dor validada com dono claro; vá para precificação e pré-venda.";
  }
  if (result.label === "FRACA" && !result.escalate) {
    return "DESCARTAR OU REPOSICIONAR — dor interna; o dono não vê urgência em pagar.";
  }
  return "REVISAR À MÃO — não decida por este teste; veja o motivo e a margem.";
}

/** Linha de resumo de uma medicao, no formato do baseline. */
function painSummary(result: PainResult): string {
  const tag = result.escalate ? "[ESCALATE]" : "          ";
  return (
    `${result.label.padEnd(13)} pain=${result.painScore.toFixed(2)} ` +
    `internal=${result.internalScore.toFixed(2)} margin=${signed(result.margin, 2)} ` +
    `dev=${result.deviation.toFixed(3)}  ${tag}  ${result.reason}`
  );
}

/** Decisor deterministico de teste: respostas fixas por id, com valor padrao. */
function stubDecider(answers: Record<string, number>, fallback = 0.5): DeciderClient {
  return {
    ask: async () => ({}),
    queryProbes: async (_state, probes) => {
      const out: Record<string, number> = {};
      for (const id of Object.keys(probes)) {
        out[id] = answers[id] ?? fallback;
      }
      return out;
    },
  };
}

/** Decisor de teste que alterna a probabilidade de dinheiro a cada chamada. */
function noisyDecider(): DeciderClient {
  let calls = 0;
  return {
    ask: async () => ({}),
    queryProbes: async (_state, probes) => {
      calls += 1;
      const value = calls === 1 ? 0.9 : 0.2;
      const out: Record<string, number> = {};
      for (const id of Object.keys(probes)) {
        out[id] = id === "p_dinheiro" ? value : 0.1;
      }
      return out;
    },
  };
}

/** Autoteste offline: forte, fraca, cinzenta, guarda de parafrases e medicao ruidosa. */
export async function runPainSelfTest(): Promise<{
  ok: boolean;
  failures: number;
  lines: string[];
}> {
  const lines: string[] = [];
  let failures = 0;

  const cases: Array<[string, string, DeciderClient, PainLabel]> = [
    [
      "forte",
      "forte     ",
      stubDecider({ p_dinheiro: 0.85, p_reputacao: 0.4, p_processo: 0.1, p_tecnologia: 0.05 }),
      "FORTE",
    ],
    [
      "fraca",
      "fraca     ",
      stubDecider({ p_dinheiro: 0.2, p_reputacao: 0.15, p_processo: 0.7, p_tecnologia: 0.3 }),
      "FRACA",
    ],
    [
      "cinzenta",
      "cinzenta  ",
      stubDecider({ p_dinheiro: 0.55, p_reputacao: 0.5, p_processo: 0.4, p_tecnologia: 0.2 }),
      "INDETERMINADO",
    ],
  ];

  for (const [name, prefix, backend, want] of cases) {
    const result = await evaluatePain(`Ideia ${name}`, backend, DEFAULT_CONTEXT);
    if (result.label === want) {
      lines.push(`[ok ] ${prefix}-> ${painSummary(result)}`);
    } else {
      lines.push(`[FAIL] ${name}: ${painSummary(result)}`);
      failures += 1;
    }
  }

  try {
    await evaluatePain(
      "Ideia curta",
      stubDecider({ p_dinheiro: 0.85, p_reputacao: 0.4, p_processo: 0.1, p_tecnologia: 0.05 }),
      DEFAULT_CONTEXT,
      ["v1"],
    );
    lines.push("[FAIL] permitiu 1 paráfrase só");
    failures += 1;
  } catch (error) {
    if (!(error instanceof ValidationError)) throw error;
    lines.push("[ok ] rejeitou 1 paráfrase (guarda funcionando)");
  }

  const noisy = await evaluatePain("Ideia ruidosa", noisyDecider(), DEFAULT_CONTEXT);
  if (noisy.label === "INSTAVEL" && noisy.escalate) {
    lines.push(`[ok ] ruidosa   -> ${painSummary(noisy)}`);
  } else {
    lines.push(`[FAIL] ruidosa: ${painSummary(noisy)}`);
    failures += 1;
  }

  lines.push(`SELF-TEST: ${failures === 0 ? "PASSOU" : `${failures} FALHAS`}`);
  return { ok: failures === 0, failures, lines };
}
