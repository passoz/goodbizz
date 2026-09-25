"""Measures pain type by 3-way forced choice, rather than 4 binary probes.

Why this exists:
Binary probes ('noul') were found to be vulnerable to false positives on 'tecnology'.
A 3-way forced choice between direct consequences (direct money, public reputation,
internal backoffice disorganization) without 'technology' yields stable classification.
"""
from __future__ import annotations

PROBES = ("dinheiro", "reputacao", "processo", "tecnologia")
SONDAS = PROBES

OPTIONS = {
    "dinheiro_direto": (
        "Ele perde dinheiro que entra: venda que nao fecha, cobranca que nao acontece, "
        "custo que sobe."
    ),
    "reputacao": (
        "Ele fica mal falado: avaliacao ruim publicada, cliente reclamando para outros, "
        "nota caindo."
    ),
    "backoffice": (
        "Nada de grave acontece com dinheiro ou imagem: sobra trabalho manual e "
        "desorganizacao para a equipe."
    ),
}
OPCOES = OPTIONS

INSTRUCTIONS = (
    "Se este problema nao for resolvido, o que acontece de pior com o dono tipico deste "
    "nicho? Escolha a consequencia mais direta para ELE.",
    "Qual e a pior consequencia, para o dono, de deixar este problema como esta?",
    "Que tipo de dor esta ideia resolve para o dono do negocio?",
)
INSTRUCOES = INSTRUCTIONS

# Map from choice option to probe name
OPTION_MAP = {
    "dinheiro_direto": "dinheiro",
    "reputacao": "reputacao",
    "backoffice": "processo",
}
MAPA = OPTION_MAP


def choice_questions() -> list[dict]:
    return [
        {"type": "choice", "instructions": inst, "criteria": dict(OPTIONS)}
        for inst in INSTRUCTIONS
    ]


perguntas = choice_questions


def measure_pain(decider, state: str) -> dict:
    """Returns {"sondas": {...means...}, "por_parafrase": {i: {...}}}."""
    by_para: dict[str, dict[str, float]] = {}
    for n, q in enumerate(choice_questions(), 1):
        res = decider.ask(state, {"dor": q})
        ans = res.get("dor", {})
        if isinstance(ans, dict):
            probs = ans.get("probabilities") or ans.get("probs") or {}
            if not probs and "choice" in ans:
                probs = {ans["choice"]: 1.0}
        else:
            probs = {str(ans): 1.0} if ans else {}
        by_para[f"P{n}"] = {OPTION_MAP[k]: float(probs.get(k, 0.0)) for k in OPTIONS}

    probes = {s: 0.0 for s in PROBES}
    for s in ("dinheiro", "reputacao", "processo"):
        probes[s] = round(sum(p[s] for p in by_para.values()) / len(by_para), 4)
    probes["tecnologia"] = 0.0  # removed: captures everything
    return {"sondas": probes, "por_parafrase": by_para}


medir = measure_pain

__all__ = [
    "PROBES", "OPTIONS", "INSTRUCTIONS", "OPTION_MAP", "choice_questions", "measure_pain",
    "SONDAS", "OPCOES", "INSTRUCOES", "MAPA", "perguntas", "medir",
]
