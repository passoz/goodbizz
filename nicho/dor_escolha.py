"""Mede o tipo de dor por escolha, em vez de 4 sondas noul.

Por que existe (medido, nao teorizado)
--------------------------------------
As 4 sondas noul de `algoritmo.py` nao medem este eixo com um decisor real:

- a sonda `tecnologia` e um ima: vencia para QUALQUER coisa, inclusive "uma
  planilha de papel". A afirmacao e a negacao dela voltavam as duas altas
  (contradicao 1.16 a 1.24 num limiar de 1.20).
- as binarias tambem falharam: para a frase "a pousada perde reserva no feriado
  porque o dono nao le as mensagens", "o dono perde dinheiro que entra?" voltou
  0.00. Nao estavam medindo o eixo.
- com a pergunta de escolha, sem a opcao `tecnologia`, os casos passaram a
  classificar certo: 6 de 8 num conjunto de teste com dois negativos claros
  (uma planilha de papel e um caderno de receitas) e um caso de cada dor.

O que mudou
-----------
1. `tecnologia` saiu do conjunto de opcoes. Ela capturava tudo porque toda ideia
   deste tipo de projeto E tecnologia, entao a pergunta "isso protege
   tecnologia?" respondia sim para todas.
2. A dor e medida por uma escolha entre 3 consequencias concretas, repetida em 3
   redacoes diferentes da pergunta (a variancia vem da redacao; a ordem das
   opcoes e fixa e as probabilidades somam 1).
3. O valor de `tecnologia` fica em zero e o de `processo` vem de `backoffice`.

O que isso invalida
-------------------
A calibracao de limiares dos 17 casos de turismo foi feita sobre as 4 sondas noul.
Trocando o metodo, os limiares precisam ser refeitos: `goodbizz recalibrar`.
"""
from __future__ import annotations

SONDAS = ("dinheiro", "reputacao", "processo", "tecnologia")

OPCOES = {
    "dinheiro_direto": "Ele perde dinheiro que entra: venda que nao fecha, cobranca que nao "
                       "acontece, custo que sobe.",
    "reputacao": "Ele fica mal falado: avaliacao ruim publicada, cliente reclamando para "
                 "outros, nota caindo.",
    "backoffice": "Nada de grave acontece com dinheiro ou imagem: sobra trabalho manual e "
                  "desorganizacao para a equipe.",
}

INSTRUCOES = (
    "Se este problema nao for resolvido, o que acontece de pior com o dono tipico deste "
    "nicho? Escolha a consequencia mais direta para ELE.",
    "Qual e a pior consequencia, para o dono, de deixar este problema como esta?",
    "Que tipo de dor esta ideia resolve para o dono do negocio?",
)

# de opcao da escolha para sonda do classificador
MAPA = {"dinheiro_direto": "dinheiro", "reputacao": "reputacao", "backoffice": "processo"}


def perguntas() -> list[dict]:
    return [{"type": "choice", "instructions": i, "criteria": dict(OPCOES)} for i in INSTRUCOES]


def medir(decisor, estado: str) -> dict:
    """Devolve {"sondas": {...medias...}, "por_parafrase": {i: {...}}}."""
    por_parafrase: dict[str, dict[str, float]] = {}
    for n, q in enumerate(perguntas(), 1):
        probs = decisor.ask(estado, {"dor": q})["dor"]["probabilities"]
        por_parafrase[f"P{n}"] = {MAPA[k]: float(probs.get(k, 0.0)) for k in OPCOES}

    sondas = {s: 0.0 for s in SONDAS}
    for s in ("dinheiro", "reputacao", "processo"):
        sondas[s] = round(sum(p[s] for p in por_parafrase.values()) / len(por_parafrase), 4)
    sondas["tecnologia"] = 0.0  # removida: media tudo, ver o cabecalho
    return {"sondas": sondas, "por_parafrase": por_parafrase}
