/**
 * Probe coherence diagnosis (ported from `diagnose.py`).
 *
 * Thresholds are only cutoffs: if the underlying values are noise, tuning the threshold changes
 * nothing. This module measures whether the decider answers coherently before recalibration.
 */
import type { DeciderAnswers, Idea } from "../domain/types.ts";
import { INTERNAL_PROBES, MIN_PARAPHRASES, PAIN_PROBES, UNSTABLE_THRESHOLD } from "../domain/pain.ts";
import type { DeciderClient } from "../domain/ports.ts";
import { extractProbability } from "../infrastructure/decider.ts";

/** Contra-positive statement of each probe: P(affirmation) + P(negation) ~= 1.0 when coherent. */
export const NEGATIONS: Record<string, string> = {
  dinheiro:
    "E falso que o dono perca dinheiro de forma direta e perceptivel se este " +
    "problema nao for resolvido: nao ha perda de dinheiro clara?",
  reputacao:
    "E falso que este produto proteja a imagem publica do negocio: ele nao tem " +
    "relacao com avaliacao, nota ou boca a boca?",
  processo:
    "E falso que o valor principal deste produto seja organizar trabalho interno: " +
    "os documentos, a burocracia e a planilha nao sao o ponto?",
  tecnologia:
    "E falso que este produto exista para proteger tecnologia que o negocio ja " +
    "usa: ele nao tem relacao com sistema ou IA que o dono ja opera?",
};

export const DEFAULT_THRESHOLD = 1.2;

export interface ProbeDiagnosis {
  probe: string;
  mean: number;
  deviation: number;
  contradiction: number;
  verdict: string;
}

export interface DiagnoseReport {
  threshold: number;
  ideas: number;
  variants: number;
  probes: ProbeDiagnosis[];
  usable: string[];
  notes: string[];
}

function mean(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Population standard deviation, matching Python's `statistics.pstdev`. */
function pstdev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

async function measureIdea(
  idea: Idea,
  decider: DeciderClient,
  base: string,
  variants: readonly string[],
): Promise<{
  positive: Record<string, Record<string, number>>;
  negative: Record<string, Record<string, number>>;
}> {
  const positive: Record<string, Record<string, number>> = {};
  const negative: Record<string, Record<string, number>> = {};
  for (const variant of variants) {
    const probes = PAIN_PROBES[variant] as Record<string, string>;
    const state = `${base}\nIdeia: ${idea.name} — ${idea.description}`;
    const positiveAnswers: DeciderAnswers = await decider.ask(
      state,
      Object.fromEntries(
        Object.entries(probes).map(([key, text]) => [key, { type: "noul" as const, instructions: text }]),
      ),
    );
    const negativeAnswers: DeciderAnswers = await decider.ask(
      state,
      Object.fromEntries(
        Object.keys(probes).map((key) => [
          key,
          { type: "noul" as const, instructions: NEGATIONS[key] as string },
        ]),
      ),
    );
    positive[variant] = Object.fromEntries(
      Object.entries(positiveAnswers).map(([key, answer]) => [key, extractProbability(answer)]),
    );
    negative[variant] = Object.fromEntries(
      Object.entries(negativeAnswers).map(([key, answer]) => [key, extractProbability(answer)]),
    );
  }
  return { positive, negative };
}

export async function diagnoseProbes(
  ideas: readonly Idea[],
  decider: DeciderClient,
  context: string,
  threshold: number = DEFAULT_THRESHOLD,
): Promise<DiagnoseReport> {
  const variants = Object.keys(PAIN_PROBES).slice(0, MIN_PARAPHRASES);
  const measurements = [];
  for (const idea of ideas) {
    measurements.push(await measureIdea(idea, decider, context, variants));
  }

  const probes: ProbeDiagnosis[] = [];
  for (const probe of Object.keys(NEGATIONS)) {
    const means: number[] = [];
    const deviations: number[] = [];
    const contradictions: number[] = [];
    for (const measurement of measurements) {
      const positive = variants.map((variant) => measurement.positive[variant]?.[probe] ?? 0);
      const negative = variants.map((variant) => measurement.negative[variant]?.[probe] ?? 0);
      means.push(mean(positive));
      deviations.push(pstdev(positive));
      contradictions.push(mean(positive.map((value, index) => value + (negative[index] ?? 0))));
    }
    const probeMean = mean(means);
    const probeDeviation = mean(deviations);
    const probeContradiction = mean(contradictions);

    const issues: string[] = [];
    if (probeContradiction > threshold) issues.push("contraditoria");
    if (probeDeviation > UNSTABLE_THRESHOLD) issues.push("instavel");

    probes.push({
      probe,
      mean: round(probeMean, 4),
      deviation: round(probeDeviation, 4),
      contradiction: round(probeContradiction, 4),
      verdict: issues.length === 0 ? "util" : issues.join(" e "),
    });
  }

  const usable = probes.filter((probe) => probe.verdict === "util").map((probe) => probe.probe);
  const notes: string[] = [];
  if (!usable.includes("dinheiro") && !usable.includes("reputacao")) {
    notes.push(
      "As duas sondas de dor forte estao comprometidas. Nesse estado, nenhum limiar separa nada: " +
        "troque a redacao das sondas (mais concreta, com exemplo do nicho) ou troque de decisor antes " +
        "de perder tempo com recalibracao.",
    );
  } else if (INTERNAL_PROBES.some((probe) => !usable.includes(probe))) {
    notes.push(
      "As sondas de dor interna estao comprometidas. Elas marcam 'tecnologia' alto em ideias que nao " +
        "tem nada a ver com tecnologia, o que empurra tudo para INSTAVEL. Redija de novo ancorando em " +
        "exemplo concreto do nicho.",
    );
  }

  return { threshold, ideas: ideas.length, variants: variants.length, probes, usable, notes };
}

/** Exit code of the diagnose command: 0 when at least three probes are usable. */
export function diagnoseExitCode(report: DiagnoseReport): number {
  return report.usable.length >= 3 ? 0 : 1;
}
