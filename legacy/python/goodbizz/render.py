"""Markdown -> HTML -> PDF renderer, no external Python dependencies (uses system chromium)."""
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


def _safe_link(match: re.Match) -> str:
    text = match.group(1)
    href = match.group(2).strip()
    if re.match(r"^(?:javascript|data|vbscript):", href, re.I):
        return html.escape(text)
    return f'<a href="{html.escape(href, quote=True)}">{text}</a>'


_link_seguro = _safe_link


def _inline(text: str) -> str:
    text = html.escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![*\w])\*([^*\n]+)\*(?!\*)", r"<em>\1</em>", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", _safe_link, text)
    return text


def md_to_html(md: str) -> str:
    lines = md.splitlines()
    output: list[str] = []
    i, in_fence, in_list = 0, False, ""

    def close_list() -> None:
        nonlocal in_list
        if in_list:
            output.append(f"</{in_list}>")
            in_list = ""

    while i < len(lines):
        line = lines[i]
        if line.strip().startswith("```"):
            close_list()
            if in_fence:
                output.append("</code></pre>")
                in_fence = False
            else:
                output.append("<pre><code>")
                in_fence = True
            i += 1
            continue
        if in_fence:
            output.append(html.escape(line))
            i += 1
            continue

        if not line.strip():
            close_list()
            i += 1
            continue

        if re.match(r"^[*-]\s+", line.strip()):
            if in_list != "ul":
                close_list()
                output.append("<ul>")
                in_list = "ul"
            content = re.sub(r"^[*-]\s+", "", line.strip())
            output.append("<li>" + _inline(content) + "</li>")
            i += 1
            continue

        if re.match(r"^\d+\.\s+", line.strip()):
            if in_list != "ol":
                close_list()
                output.append("<ol>")
                in_list = "ol"
            content = re.sub(r"^\d+\.\s+", "", line.strip())
            output.append("<li>" + _inline(content) + "</li>")
            i += 1
            continue

        close_list()

        if line.strip().startswith("#"):
            level = len(line) - len(line.lstrip("#"))
            level = max(1, min(6, level))
            content = line.lstrip("#").strip()
            output.append(f"<h{level}>{_inline(content)}</h{level}>")
            i += 1
            continue

        if line.strip().startswith(">"):
            quote_lines = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                quote_lines.append(lines[i].strip().lstrip(">").strip())
                i += 1
            output.append("<blockquote><p>" + _inline(" ".join(quote_lines)) + "</p></blockquote>")
            continue

        if line.strip().startswith("|"):
            table_lines = []
            while i < len(lines) and lines[i].strip().startswith("|"):
                table_lines.append(lines[i].strip())
                i += 1
            if len(table_lines) >= 2:
                output.append("<table>")
                header_cells = [c.strip() for c in table_lines[0].strip("|").split("|")]
                output.append("<thead><tr>" + "".join(f"<th>{_inline(c)}</th>" for c in header_cells) + "</tr></thead>")
                output.append("<tbody>")
                for row_line in table_lines[2:]:
                    cells = [c.strip() for c in row_line.strip("|").split("|")]
                    output.append("<tr>" + "".join(f"<td>{_inline(c)}</td>" for c in cells) + "</tr>")
                output.append("</tbody></table>")
            continue

        if line.strip() in ("---", "***", "___"):
            output.append("<hr>")
            i += 1
            continue

        paragraph = []
        while i < len(lines) and lines[i].strip() and not lines[i].strip().startswith(("#", ">", "|", "```", "* ", "- ", "1. ")):
            paragraph.append(lines[i].strip())
            i += 1
        output.append("<p>" + _inline(" ".join(paragraph)) + "</p>")

    close_list()
    if in_fence:
        output.append("</code></pre>")
    return "\n".join(output)


md_para_html = md_to_html


def full_html(title: str, body: str) -> str:
    return (
        f'<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">'
        f"<title>{html.escape(title)}</title><style>{CSS}</style></head>"
        f"<body>{body}</body></html>"
    )


html_completo = full_html


def _find_chromium() -> str | None:
    for name in ("chromium", "chromium-browser", "google-chrome", "chrome"):
        if (path := shutil.which(name)):
            return path
    return None


_chromium = _find_chromium


def to_pdf(html_path: Path, pdf_path: Path, timeout: float = 120.0) -> tuple[bool, str]:
    """Generates PDF via headless Chromium. Returns (ok, message)."""
    exe = _find_chromium()
    if not exe:
        return False, "chromium not found; install it or use HTML output (.md and .html are ready)"
    cmd = [
        exe,
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--disable-javascript",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_path}",
        html_path.resolve().as_uri(),
    ]
    try:
        r = subprocess.run(cmd, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return False, "chromium exceeded timeout"
    if pdf_path.exists() and pdf_path.stat().st_size > 0:
        return True, f"PDF generated ({pdf_path.stat().st_size // 1024} KB)"
    err = (r.stderr or b"").decode(errors="replace").strip().splitlines()
    return False, f"chromium failed: {err[-1] if err else 'unknown error'}"


para_pdf = to_pdf

__all__ = [
    "md_to_html", "full_html", "to_pdf", "md_para_html", "html_completo", "para_pdf", "CSS",
]
