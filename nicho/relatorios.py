"""Relatorios deterministicos: indice e tabelao. Nenhum LLM aqui, so os numeros medidos."""
from __future__ import annotations

import re
import unicodedata

from . import verificacao


def slug(nome: str) -> str:
    s = unicodedata.normalize("NFD", nome)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "ideia"


def pasta(n: int, nome: str) -> str:
    return f"{n:02d}-{slug(nome)}"


def aviso_escopo(cfg) -> str:
    nicho = cfg.nicho if not cfg.cidade else f"{cfg.nicho} em {cfg.cidade}"
    return (f"> **Escopo e metodo:** este material foi gerado por `gerar_estudo.py` a partir do "
            f"nicho **{nicho}**. Os indicadores vem de um decisor (System One) e o texto, de um "
            f"LLM. O ticket assumido e de R$ {cfg.ticket_mes}/mes e a meta de clientes e de 10 a "
            "15 em 24 meses. **Confira os numeros de mercado antes de usar isto com cliente:** "
            "premissas marcadas `[INFERENCE]` sao estimativa, nao dado pesquisado.\n")


def indice_md(cfg, brief: str, r: dict, pasta_por_nome: dict[str, str]) -> str:
    L = [f"# Estudo de nicho: {cfg.nicho}", "", aviso_escopo(cfg), "", "## Como ler", "",
         "1. `00-brief.md` — leitura de mercado que orientou a geracao das ideias.",
         "2. `00-tabelao.md` — todos os indicadores das ideias em uma tabela.",
         "3. Uma pasta por ideia, cada uma com o plano completo.", "",
         "## Ranking", "",
         "Ordenado pelo Indice de Acao (media de fit e facilidade de venda).",
         "`WTP` = probabilidade de o dono pagar o ticket mensal assumido.", "",
         "| # | Ideia | Setor | Indice | Tier | WTP | Dor verificada |",
         "|---|---|---|---|---|---|---|"]
    for n, d in enumerate(r["ordenado"], 1):
        pasta_nome = pasta_por_nome[d["nome"]]
        L.append(f"| {n:02d} | [{d['nome']}](./{pasta_nome}/) | {d['setor'] or '-'} | "
                 f"**{d['indice']}** | {d['tier']} | {d['negocio']['wtp']:.2f} | "
                 f"{d['algoritmo']['rotulo']} |")
    m = r["medias"]
    L += ["", "## Medias e grupos", "",
          f"- fit **{m['fit']}** · venda **{m['venda']}** · disrupcao **{m['disrupcao']}** · "
          f"suporte solo **{m['solo']}**",
          f"- pagaria o ticket mensal (media): **{m['wtp']}**",
          f"- 30 clientes em 24 meses (media): **{m['meta30']}**",
          f"- tiers — A: {len(r['tiers']['A'])} · B: {len(r['tiers']['B'])} · "
          f"C: {len(r['tiers']['C'])}", "",
          "**Agrupamento por natureza da dor** (o preditor mais forte):", ""]
    rotulos = {"forte": "Dor forte (dinheiro direto ou reputacao)",
               "mista": "Dor mista", "fraca": "Dor fraca (backoffice ou tecnologia)"}
    for k in ("forte", "mista", "fraca"):
        L.append(f"- {rotulos[k]}: {', '.join(r['grupos_dor'][k]) or 'nenhuma'}")
    L += ["", "## Avisos que valem para todas as ideias", "",
          f"1. **O ticket de R$ {cfg.ticket_mes}/mes e teto, nao piso.** A disposicao a pagar "
          f"medida ficou em {m['wtp']} na media.",
          "2. **A meta de 30 clientes em 24 meses e otimista** "
          f"({m['meta30']} de probabilidade media). Planejar 10 a 15 clientes.",
          "3. **TAM nacional nao serve como argumento.** Vender com o mercado da regiao e com o "
          "que um operador solo consegue atender.", ""]
    if brief.strip():
        L += ["## Brief de contexto", "", brief.strip(), ""]
    return "\n".join(L)


def tabelao_md(cfg, dados: list[dict]) -> str:
    L = [f"# Tabelao de indicadores — {cfg.nicho}", "", aviso_escopo(cfg), "",
         "| # | Ideia | Setor | Fit | c | Venda | c | Disrupcao | c | Dor | Solo | Indice | "
         "Tier | Algo | Algo dor | Interna | Margem | Desvio | WTP | 30/24m | Preco |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for n, d in enumerate(sorted(dados, key=lambda x: -x["indice"]), 1):
        i, g, a = d["indicadores"], d["negocio"], d["algoritmo"]
        L.append(f"| {n:02d} | {d['nome']} | {d['setor'] or '-'} | {i['fit']:.2f} | "
                 f"{i['fit_conf']:.2f} | {i['venda']:.2f} | {i['venda_conf']:.2f} | "
                 f"{i['disrupcao']:.2f} | {i['disrupcao_conf']:.2f} | {i['dor']} | "
                 f"{i['solo']:.2f} | **{d['indice']}** | {d['tier']} | {a['rotulo']} | "
                 f"{a['escore_dor']:.2f} | {a['escore_interna']:.2f} | {a['margem']:+.2f} | "
                 f"{a['desvio']:.3f} | {g['wtp']:.2f} | {g['meta30']:.2f} | {g['preco']:.2f} |")
    L += ["", "`c` = confianca (0 a 1). Confianca baixa significa que o modelo viu ambiguidade "
          "real na ideia, nao que o valor esteja errado.", ""]
    return "\n".join(L)


def tabelao_csv(dados: list[dict]) -> str:
    cab = ["ideia", "setor", "indice", "tier", "fit", "fit_conf", "venda", "venda_conf",
           "disrupcao", "disrupcao_conf", "dor", "dor_conf", "solo", "algo", "algo_dor",
           "algo_interna", "algo_margem", "algo_desvio", "wtp", "meta30", "preco", "preco_conf"]
    L = [";".join(cab)]
    for d in sorted(dados, key=lambda x: -x["indice"]):
        i, g, a = d["indicadores"], d["negocio"], d["algoritmo"]
        linha = [d["nome"], d["setor"], str(d["indice"]), d["tier"],
                 f"{i['fit']:.2f}", f"{i['fit_conf']:.2f}", f"{i['venda']:.2f}",
                 f"{i['venda_conf']:.2f}", f"{i['disrupcao']:.2f}", f"{i['disrupcao_conf']:.2f}",
                 str(i["dor"]), f"{i['dor_conf']:.2f}", f"{i['solo']:.2f}",
                 a["rotulo"], f"{a['escore_dor']:.3f}", f"{a['escore_interna']:.3f}",
                 f"{a['margem']:+.3f}", f"{a['desvio']:.3f}", f"{g['wtp']:.2f}",
                 f"{g['meta30']:.2f}", f"{g['preco']:.2f}", f"{g['preco_conf']:.2f}"]
        L.append(";".join(c.replace(";", ",") for c in linha))
    return "\n".join(L) + "\n"


def normalizar_saida(raiz) -> list[str]:
    return verificacao.normalizar(raiz)
