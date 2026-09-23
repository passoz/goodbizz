"""Checagens estruturais do que foi gerado: secoes, acentos, tabelas e numeros."""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

SECOES = [
    "1. Resumo executivo", "2. Indicadores coletados", "3. Como funciona",
    "4. Estrategia de venda", "5. Estrategia de marketing",
    "6. Precificacao e economia unitaria", "7. SWOT", "8. Business Model Canvas",
    "9. Ferramentas complementares", "10. Proximos passos",
]
ACC = re.compile(r"[áàâãäçéèêëíìîïñóòôõöúùûüÁÀÂÃÄÇÉÈÊËÍÌÎÏÑÓÒÔÕÖÚÙÛÜ]")


def sem_acento(txt: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", txt) if not unicodedata.combining(c))


def tabelas_desalinhadas(txt: str) -> list[int]:
    """Linha inicial de cada bloco de tabela com numero de colunas inconsistente.
    Ignora o que esta dentro de cerca de codigo."""
    ruins, bloco, cerca = [], [], False
    for n, linha in enumerate(txt.splitlines(), 1):
        if linha.strip().startswith("```"):
            cerca, bloco = not cerca, []
            continue
        if cerca:
            continue
        if linha.strip().startswith("|"):
            bloco.append((n, linha.count("|")))
        else:
            if len(bloco) > 1 and len({c for _, c in bloco}) > 1:
                ruins.append(bloco[0][0])
            bloco = []
    if len(bloco) > 1 and len({c for _, c in bloco}) > 1:
        ruins.append(bloco[0][0])
    return ruins


def _variantes(valor: object) -> set[str]:
    """Aceita o mesmo numero escrito de formas equivalentes: 0.6 e 0.60, 1.85 e 1.9 nao."""
    s = str(valor).strip()
    formas = {s}
    try:
        f = float(s)
    except ValueError:
        return formas
    formas.add(f"{f:g}")
    formas.add(f"{f:.1f}")
    formas.add(f"{f:.2f}")
    if f == int(f):
        formas.add(str(int(f)))
    return {x for x in formas if x}


def checar_documento(txt: str, numeros: list = (), literais: list[str] = (),
                     min_linhas: int = 80) -> list[str]:
    """Devolve a lista de problemas encontrados (vazia = aprovado).

    `numeros` sao os valores medidos que precisam aparecer (comparados de forma tolerante);
    `literais` sao trechos que precisam existir como texto exato.
    """
    problemas = []
    faltando = [s for s in SECOES if f"## {s}" not in txt]
    if faltando:
        problemas.append(f"{len(faltando)} secao(oes) ausente(s): {faltando}")
    acentos = len(ACC.findall(txt))
    if acentos:
        problemas.append(f"{acentos} caractere(s) acentuado(s)")
    desalinhadas = tabelas_desalinhadas(txt)
    if desalinhadas:
        problemas.append(f"tabela desalinhada na(s) linha(s) {desalinhadas}")
    # valores <= 0 sao ignorados: o token "0" aparece em qualquer texto e nao prova nada
    checaveis = [v for v in numeros if not isinstance(v, (int, float)) or float(v) > 0]
    tokens = set(re.findall(r"\d+[.,]?\d*", txt))
    ausentes = [str(v) for v in checaveis if not (_variantes(v) & tokens)]
    if ausentes:
        problemas.append(f"numero(s) medido(s) ausente(s): {ausentes}")
    sem_literal = [t for t in literais if t.lower() not in txt.lower()]
    if sem_literal:
        problemas.append(f"trecho(s) obrigatorio(s) ausente(s): {sem_literal}")
    if len(txt.splitlines()) < min_linhas:
        problemas.append(f"documento curto: {len(txt.splitlines())} linhas (minimo {min_linhas})")
    return problemas


def normalizar(raiz: Path) -> list[str]:
    """Remove acentos de todos os .md sob `raiz`. Devolve o que mudou."""
    mudou = []
    for f in sorted(raiz.rglob("*.md")):
        antes = f.read_text(encoding="utf-8")
        if not ACC.search(antes):
            continue
        f.write_text(sem_acento(antes), encoding="utf-8")
        mudou.append(str(f))
    return mudou
