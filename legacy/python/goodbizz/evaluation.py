"""Indicators, aggregation, tiers and pain algorithm evaluation."""
from __future__ import annotations

from statistics import fmean, pstdev
from typing import Any

from . import algorithm as ALG
from . import pain_choice
from .decider import extract_probability, _p

LEVELS = {
    "fit": [
        "Ruim: exige escala corporativa ou processos maduros.",
        "Media: util, mas o dono precisa mudar muito sua rotina para usar.",
        "Excelente: resolve um problema caotico da operacao diaria sem exigir mudanca de habitos.",
    ],
    "venda": [
        "Alta: o beneficio e invisivel a curto prazo; dificil de explicar.",
        "Media: o beneficio e claro, mas requer provar valor antes de fechar.",
        "Baixa (venda facil): ataca perda de dinheiro direto ou reputacao imediata.",
    ],
    "disrupcao": [
        "Nada disruptivo: e o que todo mundo ja faz, apenas automatizado.",
        "Moderadamente novo: muda um processo interno, mas o cliente final nao percebe.",
        "Muito disruptivo: muda o modelo de operacao ou cria fonte de receita que nao existia.",
    ],
    "preco": [
        "Preco acima do valor percebido.",
        "Preco compativel com o valor percebido.",
        "Preco abaixo do valor percebido, com folga para cobrar mais.",
    ],
}
NIVEIS = LEVELS


def indicator_questions() -> dict[str, dict]:
    return {
        "fit": {
            "type": "score",
            "instructions": (
                "Qual a aderencia desta ideia para este mercado, onde o dono "
                "atende no balcao e nao tem tempo?"
            ),
            "criteria": LEVELS["fit"],
        },
        "venda": {
            "type": "score",
            "instructions": (
                "Quao dificil e vender isso para este dono por uma assinatura "
                "mensal barata?"
            ),
            "criteria": LEVELS["venda"],
        },
        "disrupcao": {
            "type": "score",
            "instructions": "Quao disruptiva e esta ideia para o setor, na pratica?",
            "criteria": LEVELS["disrupcao"],
        },
        "dor": {
            "type": "choice",
            "instructions": "Que tipo de dor esta ideia resolve?",
            "criteria": dict(pain_choice.OPTIONS),
        },
        "solo": {
            "type": "noul",
            "instructions": (
                "E viavel um consultor solo manter isso para 30 clientes sem "
                "enlouquecer com suporte?"
            ),
        },
    }


perguntas_indicadores = indicator_questions


def business_questions(monthly_ticket: int) -> dict[str, dict]:
    return {
        "wtp": {
            "type": "noul",
            "instructions": (
                f"O dono deste negocio pagaria R$ {monthly_ticket} por mes por esta "
                "solucao, considerando o valor percebido por ele?"
            ),
        },
        "meta30": {
            "type": "noul",
            "instructions": (
                "E realista um consultor solo conseguir 30 clientes pagantes com "
                "esta solucao em 24 meses, comecando nesta regiao?"
            ),
        },
        "preco": {
            "type": "score",
            "instructions": (
                f"R$ {monthly_ticket} por mes e caro, justo ou barato pelo retorno "
                "que ele tera?"
            ),
            "criteria": LEVELS["preco"],
        },
    }


perguntas_negocio = business_questions


class _ChoiceResult:
    """Adapts choice measurement to the format consumed by the rest of the pipeline."""

    def __init__(self, measured: dict) -> None:
        s = measured["sondas"]
        self.detail = s
        self.detalhe = s
        self.by_paraphrase = measured["por_parafrase"]
        self.por_parafrase = self.by_paraphrase
        self.pain_score = max(s["dinheiro"], s["reputacao"])
        self.score_dor = self.pain_score
        self.escore_dor = self.pain_score
        self.internal_score = max(s["processo"], s["tecnologia"])
        self.score_interna = self.internal_score
        self.escore_interna = self.internal_score
        self.margin = self.pain_score - self.internal_score
        self.margem = self.margin
        probes = list(next(iter(self.by_paraphrase.values())).keys())
        self.deviation = max(
            (pstdev([p[k] for p in self.by_paraphrase.values()]) for k in probes), default=0.0
        )
        self.desvio = self.deviation
        if self.deviation > ALG.UNSTABLE_THRESHOLD:
            self.label = "INSTAVEL"
        elif self.pain_score >= ALG.STRONG_THRESHOLD and self.pain_score > self.internal_score:
            self.label = "FORTE"
        elif self.internal_score >= ALG.WEAK_THRESHOLD and self.internal_score > self.pain_score:
            self.label = "FRACA"
        else:
            self.label = "INDETERMINADO"
        self.rotulo = self.label


_ResultadoEscolha = _ChoiceResult


def extract_score(ans: Any) -> float:
    if isinstance(ans, (int, float)):
        return float(ans)
    if isinstance(ans, dict):
        for k in ("score", "value", "level", "nota", "posicao"):
            if k in ans:
                try:
                    return float(ans[k])
                except (TypeError, ValueError):
                    pass
    return 0.0


_score = extract_score


def extract_confidence(ans: Any) -> float:
    if isinstance(ans, (int, float)):
        return float(ans)
    if isinstance(ans, dict):
        for k in ("confidence", "conf", "confianca"):
            if k in ans:
                try:
                    return float(ans[k])
                except (TypeError, ValueError):
                    pass
    return 0.0


_conf = extract_confidence


def action_index(fit: float, sale: float) -> float:
    return round((fit + sale) / 2, 3)


indice_acao = action_index


def tier(index: float) -> str:
    if index >= 1.84:
        return "A"
    if index >= 1.60:
        return "B"
    return "C"


def evaluate_idea(idea: dict, decider, cfg) -> dict:
    """Evaluates all indicators for ONE idea and returns the full data block."""
    context_str = cfg.context() if hasattr(cfg, "context") else cfg.contexto()
    monthly_ticket = getattr(cfg, "monthly_ticket", getattr(cfg, "ticket_mes", 300))
    state = f"{context_str}\nIdeia: {idea['nome']} — {idea['descricao']}"

    ind = decider.ask(state, indicator_questions())
    neg = decider.ask(
        state + f"\nPreco proposto: R$ {monthly_ticket} por mes.",
        business_questions(monthly_ticket),
    )

    pain_method = getattr(cfg, "pain_method", getattr(cfg, "metodo_dor", "choice"))
    paraphrase_count = getattr(cfg, "paraphrases", getattr(cfg, "parafrases", 3))

    if pain_method == "choice":
        measured = pain_choice.measure_pain(decider, state)
        pain = _ChoiceResult(measured)
    else:
        variants = tuple(list(ALG.PROBES)[: max(ALG.MIN_PARAPHRASES, paraphrase_count)])
        pain = ALG.evaluate(
            idea["descricao"], backend=decider, context=context_str, variants=variants
        )

    fit = extract_score(ind.get("fit", {}))
    sale = extract_score(ind.get("venda", {}))
    idx = action_index(fit, sale)

    dor_ans = ind.get("dor", {})
    if isinstance(dor_ans, dict):
        dor_choice = dor_ans.get("choice") or ""
        dor_probs = dor_ans.get("probabilities") or dor_ans.get("probs") or {}
        if not dor_probs and dor_choice:
            dor_probs = {dor_choice: 1.0}
    else:
        dor_choice = str(dor_ans) if dor_ans else ""
        dor_probs = {dor_choice: 1.0} if dor_choice else {}

    solo_ans = ind.get("solo", {})
    wtp_ans = neg.get("wtp", {})
    meta30_ans = neg.get("meta30", {})

    return {
        "nome": idea["nome"],
        "setor": idea.get("setor", ""),
        "descricao": idea["descricao"],
        "indicadores": {
            "fit": fit,
            "fit_conf": extract_confidence(ind.get("fit")),
            "venda": sale,
            "venda_conf": extract_confidence(ind.get("venda")),
            "disrupcao": extract_score(ind.get("disrupcao")),
            "disrupcao_conf": extract_confidence(ind.get("disrupcao")),
            "dor": dor_choice,
            "dor_probs": dor_probs,
            "dor_conf": extract_confidence(dor_ans),
            "solo": extract_probability(solo_ans) if solo_ans else 0.0,
        },
        "negocio": {
            "wtp": extract_probability(wtp_ans) if wtp_ans else 0.0,
            "meta30": extract_probability(meta30_ans) if meta30_ans else 0.0,
            "preco": extract_score(neg.get("preco")),
            "preco_conf": extract_confidence(neg.get("preco")),
        },
        "algoritmo": {
            "rotulo": pain.label if hasattr(pain, "label") else pain.rotulo,
            "escore_dor": round(pain.pain_score if hasattr(pain, "pain_score") else pain.score_dor, 3),
            "escore_interna": round(pain.internal_score if hasattr(pain, "internal_score") else pain.score_interna, 3),
            "margem": round(pain.margin if hasattr(pain, "margin") else pain.margem, 3),
            "desvio": round(pain.deviation if hasattr(pain, "deviation") else pain.desvio, 3),
            "sondas": {
                k: round(v, 4) for k, v in (
                    (pain.detail if hasattr(pain, "detail") else pain.detalhe) or {}
                ).items()
            },
            "por_parafrase": {
                v: {k: round(x, 4) for k, x in d.items()}
                for v, d in (
                    (pain.by_paraphrase if hasattr(pain, "by_paraphrase") else pain.por_parafrase) or {}
                ).items()
            },
        },
        "indice": idx,
        "tier": tier(idx),
    }


avaliar_ideia = evaluate_idea


def group_by_pain(data: list[dict]) -> dict[str, list[str]]:
    groups: dict[str, list[str]] = {"forte": [], "mista": [], "fraca": []}
    for d in data:
        probs = d["indicadores"].get("dor_probs") or {}
        dominant = max(probs, key=probs.get) if probs else d["indicadores"].get("dor")
        strong = probs.get("dinheiro_direto", 0) + probs.get("reputacao", 0)
        weak = probs.get("backoffice", 0) + probs.get("tecnologia", 0)
        if dominant in ("dinheiro_direto", "reputacao") and strong > weak:
            groups["forte"].append(d["nome"])
        elif dominant in ("backoffice", "tecnologia") and weak > strong:
            groups["fraca"].append(d["nome"])
        else:
            groups["mista"].append(d["nome"])
    return groups


agrupar_por_dor = group_by_pain


def summary(data: list[dict]) -> dict:
    ordered = sorted(data, key=lambda d: -d["indice"])
    groups = group_by_pain(data)
    media = lambda key: round(fmean(d["indicadores"][key] for d in data), 3)  # noqa: E731
    means = {
        "fit": media("fit"),
        "venda": media("venda"),
        "disrupcao": media("disrupcao"),
        "solo": media("solo"),
        "wtp": round(fmean(d["negocio"]["wtp"] for d in data), 3),
        "meta30": round(fmean(d["negocio"]["meta30"] for d in data), 3),
    }
    return {
        "ordenado": ordered,
        "grupos_dor": groups,
        "medias": means,
        "tiers": {t: [d["nome"] for d in ordered if d["tier"] == t] for t in ("A", "B", "C")},
        "atacar": [d["nome"] for d in ordered if d["algoritmo"]["rotulo"] == "FORTE"],
        "revisar": [
            d["nome"] for d in ordered
            if d["algoritmo"]["rotulo"] in ("INDETERMINADO", "INSTAVEL")
        ],
    }

resumo = summary

__all__ = [
    "LEVELS", "indicator_questions", "business_questions", "action_index", "tier",
    "evaluate_idea", "group_by_pain", "summary", "extract_score", "extract_confidence",
    "NIVEIS", "perguntas_indicadores", "perguntas_negocio", "indice_acao",
    "avaliar_ideia", "agrupar_por_dor", "resumo", "_score", "_conf", "_ResultadoEscolha",
]
