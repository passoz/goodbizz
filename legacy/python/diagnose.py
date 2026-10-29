#!/usr/bin/env python3
"""Diagnoses whether pain probes provide coherent signal with YOUR decider.

Why this exists:
Before recalibrating thresholds, it is essential to determine whether probes
respond coherently. Thresholds are merely cutoffs: if the underlying values are noise,
tuning the threshold accomplishes nothing.

This script measures two properties per probe:
1. CONSISTENCY: asks both the affirmative and negative statement. A coherent model returns
   P(affirmation) + P(negation) close to 1.0. If the sum exceeds `--threshold`, the probe
   is answering "yes" to both, indicating lack of discriminative signal.
2. STABILITY: repeats the same probe across 3 paraphrases and measures standard deviation.
   Probes that fluctuate wildly based on phrasing cannot sustain fine-grained thresholds.

Usage:
    goodbizz diagnose --ideas examples.json
    goodbizz diagnose --ideas examples.json --mock       # offline deterministic test
    goodbizz diagnose --ideas examples.json \
        --decider-url http://localhost:8770/api/predict --decider-model multilingual
"""
from __future__ import annotations

import argparse
import asyncio
import json
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from goodbizz import algorithm as ALG
from goodbizz.config import Config
from goodbizz.decider import build

NEGATIONS = {
    "dinheiro": (
        "E falso que o dono perca dinheiro de forma direta e perceptivel se este "
        "problema nao for resolvido: nao ha perda de dinheiro clara?"
    ),
    "reputacao": (
        "E falso que este produto proteja a imagem publica do negocio: ele nao tem "
        "relacao com avaliacao, nota ou boca a boca?"
    ),
    "processo": (
        "E falso que o valor principal deste produto seja organizar trabalho interno: "
        "os documentos, a burocracia e a planilha nao sao o ponto?"
    ),
    "tecnologia": (
        "E falso que este produto exista para proteger tecnologia que o negocio ja "
        "usa: ele nao tem relacao com sistema ou IA que o dono ja opera?"
    ),
}
NEGACOES = NEGATIONS


async def diagnose(cfg: Config, ideas: list[dict], threshold: float) -> int:
    decider = build(cfg)
    base = cfg.context()
    variants = list(ALG.PROBES)[: ALG.MIN_PARAPHRASES]

    async def measure_single(idea: dict) -> dict:
        state = f"{base}\nIdeia: {idea['nome']} — {idea['descricao']}"

        def call_probes() -> dict:
            positives = {
                v: decider.query_probes(state, ALG.PROBES[v]) for v in variants
            }
            negatives = {
                v: decider.query_probes(state, {k: NEGATIONS[k] for k in ALG.PROBES[v]})
                for v in variants
            }
            return {"positivas": positives, "negativas": negatives}

        return await asyncio.to_thread(call_probes)

    probe_count = len(ALG.PROBES[variants[0]])
    total_calls = len(ideas) * len(variants) * len(NEGATIONS) * 2
    print(f"\n{len(ideas)} ideias x {len(variants)} parafrases x {probe_count} sondas "
          f"(afirmacao + negacao = {total_calls} chamadas)\n")

    measurements = await asyncio.gather(*(measure_single(i) for i in ideas))

    print(f"  {'sonda':<12}{'media':>7}{'desvio':>8}{'contradicao':>13}   veredito")
    print("  " + "-" * 62)
    verdicts = {}
    for probe_name in NEGATIONS:
        means, devs, contradictions = [], [], []
        for m in measurements:
            pos_vals = [m["positivas"][v][probe_name] for v in variants]
            neg_vals = [m["negativas"][v][probe_name] for v in variants]
            means.append(st.fmean(pos_vals))
            devs.append(st.pstdev(pos_vals))
            contradictions.append(st.fmean(a + b for a, b in zip(pos_vals, neg_vals)))
        mean_val = st.fmean(means)
        dev_val = st.fmean(devs)
        cont_val = st.fmean(contradictions)

        issues = []
        if cont_val > threshold:
            issues.append("contraditoria")
        if dev_val > ALG.UNSTABLE_THRESHOLD:
            issues.append("instavel")
        verdict = "util" if not issues else " e ".join(issues)
        verdicts[probe_name] = verdict
        print(f"  {probe_name:<12}{mean_val:>7.2f}{dev_val:>8.3f}{cont_val:>13.2f}   {verdict}")

    usable = [s for s, v in verdicts.items() if v == "util"]
    print(f"\nsondas utilizaveis: {usable if usable else 'nenhuma'}")
    print(f"referencia: soma afirmacao+negacao de 1.00 e coerencia perfeita; "
          f"acima de {threshold} a sonda responde sim para as duas")

    if "dinheiro" not in usable and "reputacao" not in usable:
        print("\nAs duas sondas de dor forte estao comprometidas. Nesse estado, nenhum limiar"
              "\nsepara nada: troque a redacao das sondas (mais concreta, com exemplo do"
              "\nnicho) ou troque de decisor antes de perder tempo com recalibracao.")
    elif verdicts.get("processo") != "util" or verdicts.get("tecnologia") != "util":
        print("\nAs sondas de dor interna estao comprometidas. Elas marcam 'tecnologia' alto em"
              "\nideias que nao tem nada a ver com tecnologia, o que empurra tudo para"
              "\nINSTAVEL. Redija de novo ancorando em exemplo concreto do nicho.")

    return 0 if len(usable) >= 3 else 1


diagnosticar = diagnose


def main() -> int:
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("--ideas", "--ideias", dest="ideas", required=True, help="JSON file with 5 to 10 ideas")
    ap.add_argument("--niche", "--nicho", dest="niche", default="o nicho em uma frase")
    ap.add_argument("--city", "--cidade", dest="city", default="")
    ap.add_argument("--threshold", "--limiar", dest="threshold", type=float, default=1.20,
                    help="affirmation+negation sum above this = contradictory (default: 1.20)")
    ap.add_argument("--decider-url", "--decisor-url", dest="decider_url", default=None,
                    help="System One endpoint URL (Jev, Laya, local, etc.)")
    ap.add_argument("--decider-model", "--decisor-model", dest="decider_model", default=None,
                    help="decider model (e.g. jev-latest, laya-multilingual-v1)")
    ap.add_argument("--decider-key", "--decisor-key", dest="decider_key", default=None,
                    help="decider authentication key")
    ap.add_argument("--mock", action="store_true", help="simulate decider with deterministic answers")
    args = ap.parse_args()

    raw_data = json.loads(Path(args.ideas).read_text(encoding="utf-8"))
    if isinstance(raw_data, dict):
        raw_data = raw_data.get("ideias") or raw_data.get("ideas") or []
    ideas = []
    for i, d in enumerate(raw_data, 1):
        if isinstance(d, str):
            ideas.append({"nome": d[:40], "descricao": d})
        else:
            name = d.get("nome") or d.get("name") or f"Ideia {i}"
            ideas.append({"nome": name, "descricao": d.get("descricao") or d.get("description") or name})
    if not ideas:
        print("no ideas found in file", file=sys.stderr)
        return 2

    cfg_args = {
        "niche": args.niche,
        "city": args.city,
        "mock_llm": True,
        "mock_decider": args.mock,
    }
    if args.decider_url is not None:
        cfg_args["decider_url"] = args.decider_url
    if args.decider_model is not None:
        cfg_args["decider_model"] = args.decider_model
    if args.decider_key is not None:
        cfg_args["decider_key"] = args.decider_key

    try:
        cfg = Config(**cfg_args)
    except ValueError as err:
        print(f"configuration error: {err}", file=sys.stderr)
        return 2

    return asyncio.run(diagnose(cfg, ideas, args.threshold))


if __name__ == "__main__":
    raise SystemExit(main())
