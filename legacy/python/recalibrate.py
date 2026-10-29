#!/usr/bin/env python3
"""Recalibrates pain classifier thresholds against a labeled case dataset.

Finds the optimal triplet (STRONG_THRESHOLD, WEAK_THRESHOLD, UNSTABLE_THRESHOLD)
to maximize predictive accuracy while strictly minimizing dangerous false positives.

Priority hierarchy:
  1. ZERO false positives (false STRONG: recommending an idea that doesn't sell);
  2. Maximum correct classifications (true positives + true negatives);
  3. Minimum escalation to manual review.

Usage:
    goodbizz recalibrate path/to/dados.json
"""
from __future__ import annotations

import argparse
import json
import statistics as st
import sys
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from goodbizz import algorithm as ALG

STRONG_GRID = [round(0.45 + 0.05 * i, 2) for i in range(8)]      # 0.45 .. 0.80
WEAK_GRID = [0.40, 0.50, 0.60]
UNSTABLE_GRID = [round(0.10 + 0.05 * i, 2) for i in range(5)]   # 0.10 .. 0.30

GRADE_FORTE = STRONG_GRID
GRADE_FRACA = WEAK_GRID
GRADE_INSTAVEL = UNSTABLE_GRID


@dataclass
class Case:
    name: str
    probes: dict[str, float]
    by_paraphrase: dict[str, dict[str, float]]
    sale: float

    # Backwards compatibility properties
    @property
    def nome(self) -> str:
        return self.name

    @property
    def sondas(self) -> dict[str, float]:
        return self.probes

    @property
    def por_parafrase(self) -> dict[str, dict[str, float]]:
        return self.by_paraphrase

    @property
    def venda(self) -> float:
        return self.sale

    @property
    def max_deviation(self) -> float:
        if not self.by_paraphrase:
            return 0.0
        probe_keys = list(next(iter(self.by_paraphrase.values())).keys())
        return max(
            (st.pstdev([v[s] for v in self.by_paraphrase.values()]) for s in probe_keys),
            default=0.0,
        )

    @property
    def desvio(self) -> float:
        return self.max_deviation

    @property
    def pain_score(self) -> float:
        return max(self.probes.get("dinheiro", 0.0), self.probes.get("reputacao", 0.0))

    @property
    def score_dor(self) -> float:
        return self.pain_score

    @property
    def internal_score(self) -> float:
        return max(self.probes.get("processo", 0.0), self.probes.get("tecnologia", 0.0))

    @property
    def score_interna(self) -> float:
        return self.internal_score


Caso = Case


def decide(c: Case, t_strong: float, t_weak: float, t_unstable: float) -> str:
    """Mirrors decision logic in goodbizz/algorithm.py."""
    if c.max_deviation > t_unstable:
        return "INSTAVEL"
    if c.pain_score >= t_strong and c.pain_score > c.internal_score:
        return "FORTE"
    if c.internal_score >= t_weak and c.internal_score > c.pain_score:
        return "FRACA"
    return "INDETERMINADO"


decidir = decide


def load_cases(paths: list[str], cutoff: float) -> tuple[list[Case], list[Case]]:
    cases, ignored = [], []
    for path in paths:
        raw_data = json.loads(Path(path).read_text(encoding="utf-8"))
        for d in raw_data.get("ideias", []):
            a = d.get("algoritmo", {})
            probes = a.get("sondas") or {}
            if not probes:
                ignored.append(d.get("nome", "?"))
                continue
            c = Case(
                name=d.get("nome", "?"),
                probes=probes,
                by_paraphrase=a.get("por_parafrase") or {},
                sale=float(d.get("negocio", {}).get("venda", d.get("indicadores", {}).get("venda", 0))),
            )
            if c.sale >= cutoff or c.sale <= cutoff - 0.4:
                cases.append(c)
            else:
                ignored.append(c.name)
    return cases, ignored


carregar = load_cases


def evaluate_grid(
    cases: list[Case],
    cutoff: float,
    t_strong: float,
    t_weak: float,
    t_unstable: float,
) -> dict:
    tp = fp = tn = fn = esc = 0
    for c in cases:
        positive = c.sale >= cutoff
        r = decide(c, t_strong, t_weak, t_unstable)
        if r in ("INSTAVEL", "INDETERMINADO"):
            esc += 1
        elif r == "FORTE":
            if positive:
                tp += 1
            else:
                fp += 1
        else:  # FRACA
            if positive:
                fn += 1
            else:
                tn += 1
    return {"tp": tp, "fp": fp, "tn": tn, "fn": fn, "esc": esc}


avaliar = evaluate_grid


def print_table(rows: list[tuple], cutoff: float) -> None:
    print(f"{'strong':>7}{'weak':>7}{'unstable':>9}   {'true strong':>13}{'FALSE STRONG':>14}"
          f"{'true weak':>15}{'false weak':>16}{'escalate':>10}")
    for t_s, t_w, t_u, m in rows:
        print(f"{t_s:>7.2f}{t_w:>7.2f}{t_u:>9.2f}   {m['tp']:>13}{m['fp']:>14}"
              f"{m['tn']:>15}{m['fn']:>16}{m['esc']:>10}")


imprime_tabela = print_table


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("data", nargs="+", help="one or more dados.json files from previous runs")
    ap.add_argument("--cutoff", "--corte", dest="cutoff", type=float, default=1.40,
                    help="sale indicator >= cutoff counts as ground truth pain (default: 1.40)")
    args = ap.parse_args()

    cases, ignored = load_cases(args.data, args.cutoff)
    positives = sum(1 for c in cases if c.sale >= args.cutoff)
    print(f"\nDataset: {len(cases)} labeled cases "
          f"({positives} selling, {len(cases) - positives} not selling)")
    if ignored:
        print(f"Dead zone (sale between {args.cutoff - 0.4:.2f} and {args.cutoff:.2f}): "
              f"{len(ignored)} case(s) ignored")
    if len(cases) < 12:
        print("\nWARNING: fewer than 12 cases. Grid search may overfit rather than measure generalizable thresholds.")
    if positives < 3 or len(cases) - positives < 3:
        print("\nWARNING: one class has fewer than 3 cases. Results cannot establish reliable separation.")

    current = ALG.STRONG_THRESHOLD, ALG.WEAK_THRESHOLD, ALG.UNSTABLE_THRESHOLD
    m_current = evaluate_grid(cases, args.cutoff, *current)
    print(f"\nThreshold currently in use ({current[0]}/{current[1]}/{current[2]}): "
          f"true strong={m_current['tp']} FALSE STRONG={m_current['fp']} "
          f"true weak={m_current['tn']} escalate={m_current['esc']}")

    rows = []
    for t_s in STRONG_GRID:
        for t_w in WEAK_GRID:
            for t_u in UNSTABLE_GRID:
                rows.append((t_s, t_w, t_u, evaluate_grid(cases, args.cutoff, t_s, t_w, t_u)))

    # Sort order: 1) minimum false positives, 2) maximum correct, 3) minimum escalation
    rows.sort(key=lambda x: (x[3]["fp"], -(x[3]["tp"] + x[3]["tn"]), x[3]["esc"]))

    print("\nBest threshold combinations (false STRONG first, then accuracy, then escalation):")
    print_table(rows[:12], args.cutoff)

    best = rows[0]
    t_s, t_w, t_u, m = best
    print(f"\nRecommended: STRONG_THRESHOLD={t_s}  WEAK_THRESHOLD={t_w}  UNSTABLE_THRESHOLD={t_u}")
    print(f"  true strong={m['tp']}  FALSE STRONG={m['fp']}  "
          f"true weak={m['tn']}  false weak={m['fn']}  escalate={m['esc']}")

    if m["fp"] > 0:
        print("\nNo combination achieved zero false positives on this dataset.")
    elif m["esc"] > len(cases) / 2:
        print("\nMore than half of cases escalated to manual review: separation is weak on these probes.")

    print("\nTo apply, update constants in goodbizz/algorithm.py:")
    print(f"    STRONG_THRESHOLD = {t_s}\n    WEAK_THRESHOLD = {t_w}\n    UNSTABLE_THRESHOLD = {t_u}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
