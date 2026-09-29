/**
 * Threshold recalibration (ported from `recalibrate.py`).
 *
 * Grid search over (strong, weak, unstable) with the executive priority order:
 *   1. zero false STRONG (the dangerous error), 2. maximum correct classifications,
 *   3. minimum escalation to human review.
 */
import { STRONG_THRESHOLD, UNSTABLE_THRESHOLD, WEAK_THRESHOLD } from "../domain/pain.ts";
import type { PainLabel } from "../domain/types.ts";

export const STRONG_GRID: number[] = Array.from({ length: 8 }, (_, index) => round2(0.45 + 0.05 * index));
export const WEAK_GRID: number[] = [0.4, 0.5, 0.6];
export const UNSTABLE_GRID: number[] = Array.from({ length: 5 }, (_, index) => round2(0.1 + 0.05 * index));

export const DEFAULT_CUTOFF = 1.4;
/** Case s below `cutoff - DEAD_ZONE` are ignored as ground truth for "not selling". */
export const DEAD_ZONE = 0.4;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;
}

/** Population standard deviation, matching Python's `statistics.pstdev`. */
function pstdev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const average = mean(values);
  return Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
}

export interface RecalibrateCase {
  name: string;
  probes: Record<string, number>;
  byParaphrase: Record<string, Record<string, number>>;
  sale: number;
  maxDeviation: number;
  painScore: number;
  internalScore: number;
}

export interface RecalibrateRow {
  strong: number;
  weak: number;
  unstable: number;
  tp: number;
  fp: number;
  tn: number;
  fn: number;
  escalate: number;
}

export interface RecalibrateReport {
  cases: number;
  positives: number;
  ignored: string[];
  warnings: string[];
  current: RecalibrateRow;
  best: RecalibrateRow;
  ranking: RecalibrateRow[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function numberOf(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function probeNumbers(value: unknown): Record<string, number> {
  const record = asRecord(value);
  const probes: Record<string, number> = {};
  for (const [key, raw] of Object.entries(record)) probes[key] = numberOf(raw);
  return probes;
}

function paraphraseMatrix(value: unknown): Record<string, Record<string, number>> {
  const record = asRecord(value);
  const matrix: Record<string, Record<string, number>> = {};
  for (const [variant, raw] of Object.entries(record)) matrix[variant] = probeNumbers(raw);
  return matrix;
}

/** Load labelled cases from one or more `dados.json` payloads. */
export function loadCases(
  payloads: readonly unknown[],
  cutoff: number,
): { cases: RecalibrateCase[]; ignored: string[] } {
  const cases: RecalibrateCase[] = [];
  const ignored: string[] = [];
  for (const payload of payloads) {
    const ideas = asRecord(payload)["ideias"];
    if (!Array.isArray(ideas)) continue;
    for (const rawIdea of ideas) {
      const idea = asRecord(rawIdea);
      const algorithm = asRecord(idea["algoritmo"]);
      const probes = probeNumbers(algorithm["sondas"]);
      const name = typeof idea["nome"] === "string" ? idea["nome"] : "?";
      if (Object.keys(probes).length === 0) {
        ignored.push(name);
        continue;
      }
      const sale = numberOf(asRecord(idea["negocio"])["venda"] ?? asRecord(idea["indicadores"])["venda"]);
      const byParaphrase = paraphraseMatrix(algorithm["por_parafrase"]);
      const probeKeys = Object.keys(byParaphrase[variantOf(byParaphrase)] ?? {});
      const maxDeviation = probeKeys.length
        ? Math.max(
            ...probeKeys.map((probe) =>
              pstdev(Object.values(byParaphrase).map((variant) => variant[probe] ?? 0)),
            ),
          )
        : 0;
      const entry: RecalibrateCase = {
        name,
        probes,
        byParaphrase,
        sale,
        maxDeviation,
        painScore: Math.max(probes["dinheiro"] ?? 0, probes["reputacao"] ?? 0),
        internalScore: Math.max(probes["processo"] ?? 0, probes["tecnologia"] ?? 0),
      };
      if (sale >= cutoff || sale <= cutoff - DEAD_ZONE) cases.push(entry);
      else ignored.push(name);
    }
  }
  return { cases, ignored };
}

function variantOf(matrix: Record<string, Record<string, number>>): string {
  return Object.keys(matrix)[0] ?? "";
}

/** Mirrors the decision ladder of `algorithm.py` with explicit thresholds. */
export function decideCase(
  entry: RecalibrateCase,
  strong: number,
  weak: number,
  unstable: number,
): PainLabel {
  if (entry.maxDeviation > unstable) return "INSTAVEL";
  if (entry.painScore >= strong && entry.painScore > entry.internalScore) return "FORTE";
  if (entry.internalScore >= weak && entry.internalScore > entry.painScore) return "FRACA";
  return "INDETERMINADO";
}

export function evaluateGrid(
  cases: readonly RecalibrateCase[],
  cutoff: number,
  strong: number,
  weak: number,
  unstable: number,
): RecalibrateRow {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  let escalate = 0;
  for (const entry of cases) {
    const positive = entry.sale >= cutoff;
    const label = decideCase(entry, strong, weak, unstable);
    if (label === "INSTAVEL" || label === "INDETERMINADO") {
      escalate += 1;
    } else if (label === "FORTE") {
      if (positive) tp += 1;
      else fp += 1;
    } else if (positive) {
      fn += 1;
    } else {
      tn += 1;
    }
  }
  return { strong, weak, unstable, tp, fp, tn, fn, escalate };
}

export function recalibrate(
  payloads: readonly unknown[],
  cutoff: number = DEFAULT_CUTOFF,
): RecalibrateReport {
  const { cases, ignored } = loadCases(payloads, cutoff);
  const positives = cases.filter((entry) => entry.sale >= cutoff).length;

  const warnings: string[] = [];
  if (cases.length < 12) {
    warnings.push(
      `menos de 12 casos (${cases.length}); a busca em grade pode sobreajustar em vez de medir limiares generalizaveis`,
    );
  }
  if (positives < 3 || cases.length - positives < 3) {
    warnings.push("uma classe tem menos de 3 casos; o resultado nao estabelece separacao confiavel");
  }

  const current = evaluateGrid(cases, cutoff, STRONG_THRESHOLD, WEAK_THRESHOLD, UNSTABLE_THRESHOLD);

  const ranking: RecalibrateRow[] = [];
  for (const strong of STRONG_GRID) {
    for (const weak of WEAK_GRID) {
      for (const unstable of UNSTABLE_GRID) {
        ranking.push(evaluateGrid(cases, cutoff, strong, weak, unstable));
      }
    }
  }
  ranking.sort((a, b) => a.fp - b.fp || b.tp + b.tn - (a.tp + a.tn) || a.escalate - b.escalate);

  const best = ranking[0] as RecalibrateRow;
  if (best.fp > 0) {
    warnings.push("nenhuma combinacao zerou o falso FORTE neste conjunto");
  } else if (best.escalate > cases.length / 2) {
    warnings.push("mais de metade dos casos escalou para revisao manual: a separacao e fraca nestas sondas");
  }

  return { cases: cases.length, positives, ignored, warnings, current, best, ranking: ranking.slice(0, 12) };
}

export function formatRecalibrateReport(report: RecalibrateReport): string {
  const header = "  strong    weak  unstable   falso forte   acertos   escalonados";
  const lines = [header];
  for (const row of report.ranking) {
    lines.push(
      `  ${row.strong.toFixed(2).padStart(6)}  ${row.weak.toFixed(2).padStart(6)}  ` +
        `${row.unstable.toFixed(2).padStart(8)}  ${String(row.fp).padStart(11)}  ` +
        `${String(row.tp + row.tn).padStart(7)}  ${String(row.escalate).padStart(12)}`,
    );
  }
  return lines.join("\n");
}
