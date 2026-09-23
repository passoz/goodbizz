"""Markdown -> HTML -> PDF, sem dependencia externa alem do chromium (opcional)."""
from __future__ import annotations

import html
import re
import shutil
import subprocess
from pathlib import Path

CSS = """
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { font: 15px/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
       max-width: 900px; margin: 40px auto; padding: 0 28px; color: #1a1a1a; }
h1 { font-size: 1.9em; border-bottom: 2px solid #111; padding-bottom: .3em; margin-top: 1.6em; }
h2 { font-size: 1.35em; margin-top: 1.8em; border-bottom: 1px solid #ddd; padding-bottom: .2em; }
h3 { font-size: 1.1em; margin-top: 1.4em; }
code { background: #f4f4f5; padding: .12em .35em; border-radius: 3px;
       font: .88em ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
pre { background: #f8f8f8; border: 1px solid #e5e5e5; border-radius: 5px; padding: 12px;
      overflow-x: auto; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: .93em; }
th, td { border: 1px solid #d4d4d8; padding: 6px 9px; text-align: left; vertical-align: top; }
th { background: #f4f4f5; font-weight: 600; }
blockquote { border-left: 4px solid #111; margin: 1.2em 0; padding: .3em 1em;
             background: #fafafa; color: #333; }
hr { border: none; border-top: 1px solid #e5e5e5; margin: 2em 0; }
ul, ol { padding-left: 1.5em; }
li { margin: .25em 0; }
a { color: #0b57d0; }
h1, h2, h3 { break-after: avoid; }
table, pre, blockquote { break-inside: avoid; }
"""


def _inline(txt: str) -> str:
    txt = html.escape(txt, quote=False)
    txt = re.sub(r"`([^`]+)`", r"<code>\1</code>", txt)
    txt = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", txt)
    txt = re.sub(r"(?<![*\w])\*([^*\n]+)\*(?!\*)", r"<em>\1</em>", txt)
    txt = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', txt)
    return txt


def md_para_html(md: str) -> str:
    linhas = md.splitlines()
    saida: list[str] = []
    i, em_cerca, em_lista = 0, False, ""

    def fecha_lista() -> None:
        nonlocal em_lista
        if em_lista:
            saida.append(f"</{em_lista}>")
            em_lista = ""

    while i < len(linhas):
        linha = linhas[i]
        if linha.strip().startswith("```"):
            fecha_lista()
            if em_cerca:
                saida.append("</code></pre>")
                em_cerca = False
            else:
                saida.append("<pre><code>")
                em_cerca = True
            i += 1
            continue
        if em_cerca:
            saida.append(html.escape(linha))
            i += 1
            continue

        # tabela
        if linha.strip().startswith("|") and i + 1 < len(linhas) \
                and re.match(r"^\s*\|[\s:|-]+\|\s*$", linhas[i + 1]):
            fecha_lista()
            cab = [c.strip() for c in linha.strip().strip("|").split("|")]
            saida.append("<table><thead><tr>" +
                         "".join(f"<th>{_inline(c)}</th>" for c in cab) + "</tr></thead><tbody>")
            i += 2
            while i < len(linhas) and linhas[i].strip().startswith("|"):
                cel = [c.strip() for c in linhas[i].strip().strip("|").split("|")]
                saida.append("<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in cel) + "</tr>")
                i += 1
            saida.append("</tbody></table>")
            continue

        m = re.match(r"^(#{1,6})\s+(.*)$", linha)
        if m:
            fecha_lista()
            n = len(m.group(1))
            saida.append(f"<h{n}>{_inline(m.group(2))}</h{n}>")
            i += 1
            continue

        if re.match(r"^\s*([-*_])\s*(\1\s*){2,}$", linha):
            fecha_lista()
            saida.append("<hr>")
            i += 1
            continue

        if linha.strip().startswith(">"):
            fecha_lista()
            cita = []
            while i < len(linhas) and linhas[i].strip().startswith(">"):
                cita.append(linhas[i].strip().lstrip(">").strip())
                i += 1
            saida.append("<blockquote>" + _inline(" ".join(cita)) + "</blockquote>")
            continue

        ml = re.match(r"^\s*[-*]\s+(.*)$", linha)
        mo = re.match(r"^\s*\d+[.)]\s+(.*)$", linha)
        if ml or mo:
            tipo = "ul" if ml else "ol"
            if em_lista != tipo:
                fecha_lista()
                saida.append(f"<{tipo}>")
                em_lista = tipo
            saida.append(f"<li>{_inline((ml or mo).group(1))}</li>")
            i += 1
            continue

        if not linha.strip():
            fecha_lista()
            i += 1
            continue

        fecha_lista()
        paragrafo = [linha.strip()]
        i += 1
        while i < len(linhas) and linhas[i].strip() and not re.match(
                r"^(#{1,6}\s|\s*[-*]\s|\s*\d+[.)]\s|\||>|```)", linhas[i]):
            paragrafo.append(linhas[i].strip())
            i += 1
        saida.append("<p>" + _inline(" ".join(paragrafo)) + "</p>")

    fecha_lista()
    if em_cerca:
        saida.append("</code></pre>")
    return "\n".join(saida)


def html_completo(titulo: str, corpo: str) -> str:
    return (f"<!doctype html><html lang=\"pt-BR\"><head><meta charset=\"utf-8\">"
            f"<title>{html.escape(titulo)}</title><style>{CSS}</style></head>"
            f"<body>{corpo}</body></html>")


def _chromium() -> str | None:
    for nome in ("chromium", "chromium-browser", "google-chrome", "chrome"):
        if (caminho := shutil.which(nome)):
            return caminho
    return None


def para_pdf(html_path: Path, pdf_path: Path, timeout: float = 120.0) -> tuple[bool, str]:
    """Gera PDF via chromium headless. Devolve (ok, mensagem)."""
    exe = _chromium()
    if not exe:
        return False, ("chromium nao encontrado; instale-o ou gere so o HTML "
                       "(o .md e o .html ja sao entregaveis)")
    cmd = [exe, "--headless", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
           f"--print-to-pdf={pdf_path}", html_path.resolve().as_uri()]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return False, "chromium excedeu o tempo limite"
    if pdf_path.exists() and pdf_path.stat().st_size > 0:
        return True, f"PDF gerado ({pdf_path.stat().st_size // 1024} KB)"
    erro = (r.stderr or b"").decode(errors="replace").strip().splitlines()
    return False, f"chromium falhou: {erro[-1] if erro else 'sem detalhe'}"
