#!/usr/bin/env python3
"""
Diagnostica se as sondas de dor estao medindo alguma coisa com o SEU decisor.

Por que existe
--------------
Antes de recalibrar limiares, e preciso saber se as sondas respondem de forma
coerente. Limiar e so um corte: se o valor por tras dele e ruido, mexer no corte
nao resolve nada.

Este script mede, para cada sonda:

1. CONSISTENCIA: pergunta a afirmacao e a negacao dela. Um modelo coerente devolve
   P(afirmacao) + P(negacao) proximo de 1.0. Se a soma passa de `--limiar`, a sonda
   esta respondendo "sim" para as duas coisas, e o valor nao mede nada.
2. ESTABILIDADE: repete a mesma sonda em 3 parafrases e mede o desvio. Sonda que
   muda de resposta conforme a redacao nao sustenta um limiar fino.

Saida: um veredito por sonda (util / instavel / contraditoria) e a recomendacao.

Uso
---
    goodbizz diagnosticar --ideias exemplos.json

Mede o metodo `noul` (as 4 sondas de afirmacao). Foi ele que expos o problema do
ima `tecnologia`. O metodo padrao hoje e `escolha`: a estabilidade dele entre as
3 redacoes fica em dados.json e e o que `recalibrar.py` consome. Para voltar ao
metodo antigo em qualquer rodada, use `goodbizz gerar --metodo-dor noul`.

`exemplos.json` aceita [{"nome": "...", "descricao": "..."}] ou ["descricao", ...].
O ideal e usar 5 a 10 ideias do nicho real, incluindo pelo menos uma que
claramente NAO tenha a caracteristica perguntada.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import statistics as st
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from nicho import algoritmo as ALG  # noqa: E402
from nicho.config import Config  # noqa: E402
from nicho.decisor import construir  # noqa: E402

# negacao de cada sonda, para o teste de consistencia
NEGACOES = {
    "dinheiro": "E falso que o dono perca dinheiro de forma direta e perceptivel se este "
                "problema nao for resolvido: nao ha perda de dinheiro clara?",
    "reputacao": "E falso que este produto proteja a imagem publica do negocio: ele nao tem "
                 "relacao com avaliacao, nota ou boca a boca?",
    "processo": "E falso que o valor principal deste produto seja organizar trabalho interno: "
                "os documentos, a burocracia e a planilha nao sao o ponto?",
    "tecnologia": "E falso que este produto exista para proteger tecnologia que o negocio ja "
                  "usa: ele nao tem relacao com sistema ou IA que o dono ja opera?",
}


async def diagnosticar(cfg: Config, ideias: list[dict], limiar: float) -> int:
    decisor = construir(cfg)
    base = cfg.contexto()
    variantes = list(ALG.SONDAS)[: ALG.MIN_PARAFRASES]

    async def medir(ideia: dict) -> dict:
        estado = f"{base}\nIdeia: {ideia['nome']} — {ideia['descricao']}"

        def chamar() -> dict:
            positivas = {v: decisor.perguntar(estado, ALG.SONDAS[v]) for v in variantes}
            negativas = {v: decisor.perguntar(estado, {k: NEGACOES[k] for k in ALG.SONDAS[v]})
                         for v in variantes}
            return {"positivas": positivas, "negativas": negativas}

        return await asyncio.to_thread(chamar)

    print(f"\n{len(ideias)} ideias x {len(variantes)} parafrases x "
          f"{len(ALG.SONDAS[variantes[0]])} sondas (afirmacao + negacao = "
          f"{len(ideias) * len(variantes) * len(NEGACOES) * 2} chamadas)\n")
    medidas = await asyncio.gather(*(medir(i) for i in ideias))

    print(f"  {'sonda':<12}{'media':>7}{'desvio':>8}{'contradicao':>13}   veredito")
    print("  " + "-" * 62)
    vereditos = {}
    for sonda in NEGACOES:
        medias, desvios, contradicoes = [], [], []
        for m in medidas:
            vals = [m["positivas"][v][sonda] for v in variantes]
            negs = [m["negativas"][v][sonda] for v in variantes]
            medias.append(st.fmean(vals))
            desvios.append(st.pstdev(vals))
            contradicoes.append(st.fmean(a + b for a, b in zip(vals, negs)))
        media, desvio, cont = st.fmean(medias), st.fmean(desvios), st.fmean(contradicoes)
        problemas = []
        if cont > limiar:
            problemas.append("contraditoria")
        if desvio > ALG.LIMIAR_INSTAVEL:
            problemas.append("instavel")
        veredito = "util" if not problemas else " e ".join(problemas)
        vereditos[sonda] = veredito
        print(f"  {sonda:<12}{media:>7.2f}{desvio:>8.3f}{cont:>13.2f}   {veredito}")

    uteis = [s for s, v in vereditos.items() if v == "util"]
    print(f"\nsondas utilizaveis: {uteis if uteis else 'nenhuma'}")
    print(f"referencia: soma afirmacao+negacao de 1.00 e coerencia perfeita; "
          f"acima de {limiar} a sonda responde sim para as duas")
    if "dinheiro" not in uteis and "reputacao" not in uteis:
        print("\nAs duas sondas de dor forte estao comprometidas. Nesse estado, nenhum limiar"
              "\nsepara nada: troque a redacao das sondas (mais concreta, com exemplo do"
              "\nnicho) ou troque de decisor antes de perder tempo com recalibracao.")
    elif vereditos.get("processo") != "util" or vereditos.get("tecnologia") != "util":
        print("\nAs sondas de dor interna estao comprometidas. Elas marcam 'tecnologia' alto em"
              "\nideias que nao tem nada a ver com tecnologia, o que empurra tudo para"
              "\nINSTAVEL. Redija de novo ancorando em exemplo concreto do nicho.")
    return 0 if len(uteis) >= 3 else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--ideias", required=True, help="JSON com 5 a 10 ideias do nicho")
    ap.add_argument("--nicho", default="o nicho em uma frase")
    ap.add_argument("--cidade", default="")
    ap.add_argument("--limiar", type=float, default=1.20,
                    help="soma afirmacao+negacao acima disto = contraditoria (padrao 1.20)")
    a = ap.parse_args()

    dados = json.loads(Path(a.ideias).read_text(encoding="utf-8"))
    if isinstance(dados, dict):
        dados = dados.get("ideias", [])
    ideias = []
    for i, d in enumerate(dados, 1):
        if isinstance(d, str):
            ideias.append({"nome": d[:40], "descricao": d})
        else:
            nome = d.get("nome") or f"Ideia {i}"
            ideias.append({"nome": nome, "descricao": d.get("descricao") or nome})
    if not ideias:
        print("nenhuma ideia no arquivo", file=sys.stderr)
        return 2

    try:
        cfg = Config(nicho=a.nicho, cidade=a.cidade)
    except ValueError as e:
        print(f"erro de configuracao: {e}", file=sys.stderr)
        return 2
    return asyncio.run(diagnosticar(cfg, ideias, a.limiar))


if __name__ == "__main__":
    raise SystemExit(main())
