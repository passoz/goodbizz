"""Deterministic reports: index, summary table, and CSV. No LLM calls here, strictly measured numbers."""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from . import verification


def slug(name: str) -> str:
    s = unicodedata.normalize("NFD", name)
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "idea"


def folder(n: int, name: str) -> str:
    return f"{n:02d}-{slug(name)}"


pasta = folder


def scope_notice(cfg) -> str:
    niche = getattr(cfg, "niche", getattr(cfg, "nicho", ""))
    city = getattr(cfg, "city", getattr(cfg, "cidade", ""))
    monthly_ticket = getattr(cfg, "monthly_ticket", getattr(cfg, "ticket_mes", 300))
    location = niche if not city else f"{niche} em {city}"
    return (
        f"> **Escopo e metodo:** este material foi gerado por `generate_study.py` a partir do "
        f"nicho **{location}**. Os indicadores vem de um decisor (System One) e o texto, de um "
        f"LLM. O ticket assumido e de R$ {monthly_ticket}/mes e a meta de clientes e de 10 a "
        "15 em 24 meses. **Confira os numeros de mercado antes de usar isto com cliente:** "
        "premissas marcadas `[INFERENCE]` sao estimativa, nao dado pesquisado.\n"
    )


aviso_escopo = scope_notice


def index_markdown(cfg, brief: str, r: dict, folder_by_name: dict[str, str]) -> str:
    niche = getattr(cfg, "niche", getattr(cfg, "nicho", ""))
    monthly_ticket = getattr(cfg, "monthly_ticket", getattr(cfg, "ticket_mes", 300))
    lines = [
        f"# Estudo de nicho: {niche}", "", scope_notice(cfg), "", "## Como ler", "",
        "1. `00-brief.md` — leitura de mercado que orientou a geracao das ideias.",
        "2. `00-tabelao.md` — todos os indicadores das ideias em uma tabela.",
        "3. Uma pasta por ideia, cada uma com o plano completo.", "",
        "## Ranking", "",
        "Ordenado pelo Indice de Acao (media de fit e facilidade de venda).",
        "`WTP` = probabilidade de o dono pagar o ticket mensal assumido.", "",
        "| # | Ideia | Setor | Indice | Tier | WTP | Dor verificada |",
        "|---|---|---|---|---|---|---|",
    ]
    for n, d in enumerate(r["ordenado"], 1):
        folder_name = folder_by_name[d["nome"]]
        lines.append(
            f"| {n:02d} | [{d['nome']}](./{folder_name}/) | {d['setor'] or '-'} | "
            f"**{d['indice']}** | {d['tier']} | {d['negocio']['wtp']:.2f} | "
            f"{d['algoritmo']['rotulo']} |"
        )
    m = r["medias"]
    tiers = r.get("tiers", {"A": [], "B": [], "C": []})
    lines += [
        "", "## Medias e grupos", "",
        f"- fit **{m['fit']}** · venda **{m['venda']}** · disrupcao **{m['disrupcao']}** · "
        f"suporte solo **{m['solo']}**",
        f"- pagaria o ticket mensal (media): **{m['wtp']}**",
        f"- 30 clientes em 24 meses (media): **{m['meta30']}**",
        f"- tiers — A: {len(tiers.get('A', []))} · B: {len(tiers.get('B', []))} · "
        f"C: {len(tiers.get('C', []))}", "",
        "**Agrupamento por natureza da dor** (o preditor mais forte):", "",
    ]
    labels = {
        "forte": "Dor forte (dinheiro direto ou reputacao)",
        "mista": "Dor mista",
        "fraca": "Dor fraca (backoffice ou tecnologia)",
    }
    for k in ("forte", "mista", "fraca"):
        lines.append(f"- {labels[k]}: {', '.join(r['grupos_dor'][k]) or 'nenhuma'}")
    lines += [
        "", "## Avisos que valem para todas as ideias", "",
        f"1. **O ticket de R$ {monthly_ticket}/mes e teto, nao piso.** A disposicao a pagar "
        f"medida ficou em {m['wtp']} na media.",
        "2. **A meta de 30 clientes em 24 meses e otimista** "
        f"({m['meta30']} de probabilidade media). Planejar 10 a 15 clientes.",
        "3. **TAM nacional nao serve como argumento.** Vender com o mercado da regiao e com o "
        "que um operador solo consegue atender.", "",
    ]
    if brief.strip():
        lines += ["## Brief de contexto", "", brief.strip(), ""]
    return "\n".join(lines)


indice_md = index_markdown


def indicators_table_markdown(cfg, data: list[dict]) -> str:
    niche = getattr(cfg, "niche", getattr(cfg, "nicho", ""))
    lines = [
        f"# Tabelao de indicadores — {niche}", "", scope_notice(cfg), "",
        "| # | Ideia | Setor | Fit | c | Venda | c | Disrupcao | c | Dor | Solo | Indice | "
        "Tier | Algo | Algo dor | Interna | Margem | Desvio | WTP | 30/24m | Preco |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for n, d in enumerate(sorted(data, key=lambda x: -x["indice"]), 1):
        i, g, a = d["indicadores"], d["negocio"], d["algoritmo"]
        lines.append(
            f"| {n:02d} | {d['nome']} | {d['setor'] or '-'} | {i['fit']:.2f} | "
            f"{i['fit_conf']:.2f} | {i['venda']:.2f} | {i['venda_conf']:.2f} | "
            f"{i['disrupcao']:.2f} | {i['disrupcao_conf']:.2f} | {i['dor']} | "
            f"{i['solo']:.2f} | **{d['indice']}** | {d['tier']} | {a['rotulo']} | "
            f"{a['escore_dor']:.2f} | {a['escore_interna']:.2f} | {a['margem']:+.2f} | "
            f"{a['desvio']:.3f} | {g['wtp']:.2f} | {g['meta30']:.2f} | {g['preco']:.2f} |"
        )
    lines += [
        "", "`c` = confianca (0 a 1). Confianca baixa significa que o modelo viu ambiguidade "
        "real na ideia, nao que o valor esteja errado.", "",
    ]
    return "\n".join(lines)


tabelao_md = indicators_table_markdown


def indicators_table_csv(data: list[dict]) -> str:
    headers = [
        "ideia", "setor", "indice", "tier", "fit", "fit_conf", "venda", "venda_conf",
        "disrupcao", "disrupcao_conf", "dor", "dor_conf", "solo", "algo", "algo_dor",
        "algo_interna", "algo_margem", "algo_desvio", "wtp", "meta30", "preco", "preco_conf",
    ]
    rows = [",".join(headers)]
    for d in sorted(data, key=lambda x: -x["indice"]):
        i, g, a = d["indicadores"], d["negocio"], d["algoritmo"]
        row = [
            f'"{d["nome"]}"', f'"{d["setor"]}"', f"{d['indice']:.3f}", d["tier"],
            f"{i['fit']:.2f}", f"{i['fit_conf']:.2f}", f"{i['venda']:.2f}", f"{i['venda_conf']:.2f}",
            f"{i['disrupcao']:.2f}", f"{i['disrupcao_conf']:.2f}", f'"{i["dor"]}"',
            f"{i['dor_conf']:.2f}", f"{i['solo']:.2f}", a["rotulo"],
            f"{a['escore_dor']:.3f}", f"{a['escore_interna']:.3f}", f"{a['margem']:+.3f}",
            f"{a['desvio']:.3f}", f"{g['wtp']:.2f}", f"{g['meta30']:.2f}",
            f"{g['preco']:.2f}", f"{g['preco_conf']:.2f}",
        ]
        rows.append(",".join(row))
    return "\n".join(rows) + "\n"


tabelao_csv = indicators_table_csv


def normalize_output(root: Path) -> list[str]:
    return verification.normalize_markdown(root)


normalizar_saida = normalize_output

__all__ = [
    "slug", "folder", "pasta", "scope_notice", "aviso_escopo",
    "index_markdown", "indice_md", "indicators_table_markdown", "tabelao_md",
    "indicators_table_csv", "tabelao_csv", "normalize_output", "normalizar_saida",
]
