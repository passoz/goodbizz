"""Indicadores, agregacao, tiers e o algoritmo de dor (reusa o modulo ja calibrado)."""
from __future__ import annotations

from statistics import fmean

from . import algoritmo as ALG

NIVEIS = {
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


def perguntas_indicadores() -> dict[str, dict]:
    return {
        "fit": {"type": "score",
                "instructions": "Qual a aderencia desta ideia para este mercado, onde o dono "
                                "atende no balcao e nao tem tempo?",
                "criteria": NIVEIS["fit"]},
        "venda": {"type": "score",
                  "instructions": "Quao dificil e vender isso para este dono por uma assinatura "
                                  "mensal barata?",
                  "criteria": NIVEIS["venda"]},
        "disrupcao": {"type": "score",
                      "instructions": "Quao disruptiva e esta ideia para o setor, na pratica?",
                      "criteria": NIVEIS["disrupcao"]},
        "dor": {"type": "choice",
                "instructions": "Que tipo de dor este produto resolve?",
                "criteria": {
                    "dinheiro_direto": "Evita perder vendas, aumenta ticket ou garante comissoes.",
                    "reputacao": "Protege a imagem publica que atrai clientes.",
                    "backoffice": "Organiza documentos, burocracia ou processos internos.",
                    "tecnologia": "Protege outras tecnologias.",
                }},
        "solo": {"type": "noul",
                 "instructions": "E viavel um consultor solo manter isso para 30 clientes sem "
                                 "enlouquecer com suporte?"},
    }


def perguntas_negocio(ticket_mes: int) -> dict[str, dict]:
    return {
        "wtp": {"type": "noul",
                "instructions": f"O dono deste negocio pagaria R$ {ticket_mes} por mes por esta "
                                "solucao, considerando o valor percebido por ele?"},
        "meta30": {"type": "noul",
                   "instructions": "E realista um consultor solo conseguir 30 clientes pagantes com "
                                   "esta solucao em 24 meses, comecando nesta regiao?"},
        "preco": {"type": "score",
                  "instructions": f"Quao defensavel e o preco de R$ {ticket_mes} por mes para esta "
                                  "solucao, comparado ao valor financeiro que ela gera para o dono?",
                  "criteria": NIVEIS["preco"]},
    }


def _score(ans: dict) -> float:
    return float(ans.get("score", 0.0))


def _conf(ans: dict) -> float:
    return float(ans.get("confidence", 0.0))


def indice_acao(fit: float, venda: float) -> float:
    return round((fit + venda) / 2, 3)


def tier(indice: float) -> str:
    if indice >= 1.84:
        return "A"
    if indice >= 1.60:
        return "B"
    return "C"


def avaliar_ideia(ideia: dict, decisor, cfg) -> dict:
    """Roda todos os indicadores de UMA ideia e devolve o bloco completo."""
    estado = f"{cfg.contexto()}\nIdeia: {ideia['nome']} — {ideia['descricao']}"

    ind = decisor.ask(estado, perguntas_indicadores())
    neg = decisor.ask(estado + f"\nPreco proposto: R$ {cfg.ticket_mes} por mes.",
                      perguntas_negocio(cfg.ticket_mes))
    # algoritmo de dor: 4 sondas x N parafrases, com limiar calibrado e escalonamento
    variantes = tuple(list(ALG.SONDAS)[: max(ALG.MIN_PARAFRASES, cfg.parafrases)])
    dor = ALG.avaliar(ideia["descricao"], backend=decisor, contexto=cfg.contexto(),
                      variantes=variantes)

    fit, venda = _score(ind["fit"]), _score(ind["venda"])
    idx = indice_acao(fit, venda)

    return {
        "nome": ideia["nome"],
        "setor": ideia.get("setor", ""),
        "descricao": ideia["descricao"],
        "indicadores": {
            "fit": fit, "fit_conf": _conf(ind["fit"]),
            "venda": venda, "venda_conf": _conf(ind["venda"]),
            "disrupcao": _score(ind["disrupcao"]), "disrupcao_conf": _conf(ind["disrupcao"]),
            "dor": ind["dor"].get("choice"), "dor_probs": ind["dor"].get("probabilities", {}),
            "dor_conf": _conf(ind["dor"]),
            "solo": float(ind["solo"].get("noul", ind["solo"].get("bool", 0.0))),
        },
        "negocio": {
            "wtp": float(neg["wtp"].get("noul", neg["wtp"].get("bool", 0.0))),
            "meta30": float(neg["meta30"].get("noul", neg["meta30"].get("bool", 0.0))),
            "preco": _score(neg["preco"]), "preco_conf": _conf(neg["preco"]),
        },
        "algoritmo": {
            "rotulo": dor.rotulo, "escore_dor": round(dor.score_dor, 3),
            "escore_interna": round(dor.score_interna, 3),
            "margem": round(dor.margem, 3), "desvio": round(dor.desvio, 3),
        },
        "indice": idx,
        "tier": tier(idx),
    }


def agrupar_por_dor(dados: list[dict]) -> dict[str, list[str]]:
    grupos: dict[str, list[str]] = {"forte": [], "mista": [], "fraca": []}
    for d in dados:
        probs = d["indicadores"].get("dor_probs") or {}
        dominante = max(probs, key=probs.get) if probs else d["indicadores"].get("dor")
        forte = (probs.get("dinheiro_direto", 0) + probs.get("reputacao", 0))
        fraca = (probs.get("backoffice", 0) + probs.get("tecnologia", 0))
        if dominante in ("dinheiro_direto", "reputacao") and forte > fraca:
            grupos["forte"].append(d["nome"])
        elif dominante in ("backoffice", "tecnologia") and fraca > forte:
            grupos["fraca"].append(d["nome"])
        else:
            grupos["mista"].append(d["nome"])
    return grupos


def resumo(dados: list[dict]) -> dict:
    ordenado = sorted(dados, key=lambda d: -d["indice"])
    grupos = agrupar_por_dor(dados)
    media = lambda chave: round(fmean(d["indicadores"][chave] for d in dados), 3)  # noqa: E731
    return {
        "ordenado": ordenado,
        "grupos_dor": grupos,
        "medias": {
            "fit": media("fit"), "venda": media("venda"),
            "disrupcao": media("disrupcao"), "solo": media("solo"),
            "wtp": round(fmean(d["negocio"]["wtp"] for d in dados), 3),
            "meta30": round(fmean(d["negocio"]["meta30"] for d in dados), 3),
        },
        "tiers": {t: [d["nome"] for d in ordenado if d["tier"] == t] for t in ("A", "B", "C")},
        "atacar": [d["nome"] for d in ordenado if d["algoritmo"]["rotulo"] == "FORTE"],
        "revisar": [d["nome"] for d in ordenado
                    if d["algoritmo"]["rotulo"] in ("INDETERMINADO", "INSTAVEL")],
    }
