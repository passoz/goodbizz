/**
 * Renderizador Markdown -> HTML -> PDF, sem dependencias externas (usa o chromium do sistema).
 */

/** Folha de estilo injetada em todo documento gerado. Copiada do baseline Python. */
export const RENDER_CSS = `
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
`;

/** Escapa `&`, `<` e `>` (equivalente a html.escape(text, quote=False)). */
function escapeHtmlNoQuote(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escapa também aspas (equivalente a html.escape(text, quote=True)). */
function escapeHtmlQuote(text: string): string {
  return escapeHtmlNoQuote(text).replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

function inline(text: string): string {
  let out = escapeHtmlNoQuote(text);
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>");
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(?<![*\w])\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match: string, label: string, href: string) => {
    const target = href.trim();
    // mantem o link apenas quando o href não usa esquemas perigosos
    if (/^(?:javascript|data|vbscript):/i.test(target)) {
      return escapeHtmlQuote(label);
    }
    return `<a href="${escapeHtmlQuote(target)}">${label}</a>`;
  });
  return out;
}

/** Converte um bloco Markdown em fragmento HTML. */
export function mdToHtml(markdown: string): string {
  const lines = markdown.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const output: string[] = [];
  let i = 0;
  let inFence = false;
  let inList = "";

  const closeList = (): void => {
    if (inList) {
      output.push(`</${inList}>`);
      inList = "";
    }
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      closeList();
      if (inFence) {
        output.push("</code></pre>");
        inFence = false;
      } else {
        output.push("<pre><code>");
        inFence = true;
      }
      i += 1;
      continue;
    }
    if (inFence) {
      output.push(escapeHtmlNoQuote(line));
      i += 1;
      continue;
    }

    if (!trimmed) {
      closeList();
      i += 1;
      continue;
    }

    if (/^[*-]\s+/.test(trimmed)) {
      if (inList !== "ul") {
        closeList();
        output.push("<ul>");
        inList = "ul";
      }
      output.push(`<li>${inline(trimmed.replace(/^[*-]\s+/, ""))}</li>`);
      i += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      if (inList !== "ol") {
        closeList();
        output.push("<ol>");
        inList = "ol";
      }
      output.push(`<li>${inline(trimmed.replace(/^\d+\.\s+/, ""))}</li>`);
      i += 1;
      continue;
    }

    closeList();

    if (trimmed.startsWith("#")) {
      const withoutHashes = line.replace(/^#+/, "");
      const level = Math.max(1, Math.min(6, line.length - withoutHashes.length));
      output.push(`<h${level}>${inline(withoutHashes.trim())}</h${level}>`);
      i += 1;
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith(">")) {
        quoteLines.push((lines[i] ?? "").trim().replace(/^>+/, "").trim());
        i += 1;
      }
      output.push(`<blockquote><p>${inline(quoteLines.join(" "))}</p></blockquote>`);
      continue;
    }

    if (trimmed.startsWith("|")) {
      const tableLines: string[] = [];
      while (i < lines.length && (lines[i] ?? "").trim().startsWith("|")) {
        tableLines.push((lines[i] ?? "").trim());
        i += 1;
      }
      if (tableLines.length >= 2) {
        const stripPipes = (row: string): string => row.replace(/^\|+/, "").replace(/\|+$/, "");
        const headerCells = stripPipes(tableLines[0] ?? "")
          .split("|")
          .map((cell) => cell.trim());
        output.push("<table>");
        output.push(
          `<thead><tr>${headerCells.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead>`,
        );
        output.push("<tbody>");
        for (const rowLine of tableLines.slice(2)) {
          const cells = stripPipes(rowLine)
            .split("|")
            .map((cell) => cell.trim());
          output.push(`<tr>${cells.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`);
        }
        output.push("</tbody></table>");
      }
      continue;
    }

    if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      output.push("<hr>");
      i += 1;
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      !["#", ">", "|", "```", "* ", "- ", "1. "].some((prefix) => (lines[i] ?? "").trim().startsWith(prefix))
    ) {
      paragraph.push((lines[i] ?? "").trim());
      i += 1;
    }
    output.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }

  closeList();
  if (inFence) {
    output.push("</code></pre>");
  }
  return output.join("\n");
}

/** Envolve o corpo em um documento HTML completo com a folha de estilo. */
export function fullHtml(title: string, body: string): string {
  return (
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">` +
    `<title>${escapeHtmlQuote(title)}</title><style>${RENDER_CSS}</style></head>` +
    `<body>${body}</body></html>`
  );
}
