"""Structural checks of generated strategy documents: sections, accents, tables and numbers."""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

SECTIONS = [
    "1. Resumo executivo", "2. Indicadores coletados", "3. Como funciona",
    "4. Estrategia de venda", "5. Estrategia de marketing",
    "6. Precificacao e economia unitaria", "7. SWOT", "8. Business Model Canvas",
    "9. Ferramentas complementares", "10. Proximos passos",
]
SECOES = SECTIONS

ACC = re.compile(r"[áàâãäçéèêëíìîïñóòôõöúùûüÁÀÂÃÄÇÉÈÊËÍÌÎÏÑÓÒÔÕÖÚÙÛÜ]")


def strip_accents(text: str) -> str:
    """Removes combining diacritics/accents from text."""
    return "".join(c for c in unicodedata.normalize("NFD", text) if not unicodedata.combining(c))


sem_acento = strip_accents


def unaligned_tables(text: str) -> list[int]:
    """Starting line of each table block with an inconsistent number of columns.

    Ignores content inside markdown code blocks.
    """
    bad_lines: list[int] = []
    block: list[tuple[int, int]] = []
    in_fence = False
    for n, line in enumerate(text.splitlines(), 1):
        if line.strip().startswith("```"):
            in_fence = not in_fence
            block = []
            continue
        if in_fence:
            continue
        if line.strip().startswith("|"):
            block.append((n, line.count("|")))
        else:
            if len(block) > 1 and len({c for _, c in block}) > 1:
                bad_lines.append(block[0][0])
            block = []
    if len(block) > 1 and len({c for _, c in block}) > 1:
        bad_lines.append(block[0][0])
    return bad_lines


tabelas_desalinhadas = unaligned_tables


def number_variants(value: object) -> set[str]:
    """Accepts the same number formatted in equivalent representations."""
    s = str(value).strip()
    variants = {s}
    try:
        f = float(s)
    except ValueError:
        return variants
    variants.add(f"{f:g}")
    variants.add(f"{f:.1f}")
    variants.add(f"{f:.2f}")
    if f == int(f):
        variants.add(str(int(f)))
    return {x for x in variants if x}


_variantes = number_variants


def check_document(
    text: str,
    numbers: list = (),
    literals: list[str] = (),
    min_lines: int = 80,
) -> list[str]:
    """Returns a list of issues found (empty = approved).

    `numbers` are measured values that must appear in the text.
    `literals` are exact substrings required to be present.
    """
    issues = []
    missing_sections = [s for s in SECTIONS if f"## {s}" not in text]
    if missing_sections:
        issues.append(f"{len(missing_sections)} section(s) missing: {missing_sections}")
    accents_count = len(ACC.findall(text))
    if accents_count:
        issues.append(f"{accents_count} accented character(s)")
    bad_tables = unaligned_tables(text)
    if bad_tables:
        issues.append(f"unaligned table at line(s) {bad_tables}")

    checkable = [v for v in numbers if not isinstance(v, (int, float)) or float(v) > 0]
    tokens = set(re.findall(r"\d+[.,]?\d*", text))
    missing_numbers = [str(v) for v in checkable if not (number_variants(v) & tokens)]
    if missing_numbers:
        issues.append(f"missing measured number(s): {missing_numbers}")

    missing_literals = [t for t in literals if t.lower() not in text.lower()]
    if missing_literals:
        issues.append(f"missing required phrase(s): {missing_literals}")

    line_count = len(text.splitlines())
    if line_count < min_lines:
        issues.append(f"document too short: {line_count} lines (min {min_lines})")
    return issues


checar_documento = check_document


def normalize_markdown(root: Path) -> list[str]:
    """Removes accents from all .md files under `root`. Returns list of modified paths."""
    modified = []
    for f in sorted(root.rglob("*.md")):
        content = f.read_text(encoding="utf-8")
        if not ACC.search(content):
            continue
        f.write_text(strip_accents(content), encoding="utf-8")
        modified.append(str(f))
    return modified


normalizar = normalize_markdown

__all__ = [
    "SECTIONS", "SECOES", "strip_accents", "sem_acento", "unaligned_tables", "tabelas_desalinhadas",
    "number_variants", "check_document", "checar_documento", "normalize_markdown", "normalizar",
]
