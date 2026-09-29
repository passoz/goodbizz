import { describe, expect, test } from "bun:test";

import { RENDER_CSS, fullHtml, mdToHtml } from "../src/application/render.ts";

describe("mdToHtml", () => {
  test("converte titulos h1..h6 e limita niveis acima de 6", () => {
    const html = mdToHtml("# Um\n## Dois\n### Tres\n#### Quatro\n##### Cinco\n###### Seis\n####### Sete");
    expect(html).toContain("<h1>Um</h1>");
    expect(html).toContain("<h2>Dois</h2>");
    expect(html).toContain("<h3>Tres</h3>");
    expect(html).toContain("<h4>Quatro</h4>");
    expect(html).toContain("<h5>Cinco</h5>");
    expect(html).toContain("<h6>Seis</h6>");
    expect(html).toContain("<h6>Sete</h6>");
    expect(html).not.toContain("<h7>");
  });

  test("converte tabela e descarta a linha separadora", () => {
    const html = mdToHtml("| A | B |\n| --- | --- |\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<thead><tr><th>A</th><th>B</th></tr></thead>");
    expect(html).toContain("<tbody>");
    expect(html).toContain("<tr><td>1</td><td>2</td></tr>");
    expect(html).toContain("</tbody></table>");
    expect(html).not.toContain("---");
  });

  test("converte bloco cercado em pre/code com escape", () => {
    const html = mdToHtml("```\nconst x = 1 < 2;\n```");
    expect(html).toContain("<pre><code>");
    expect(html).toContain("const x = 1 &lt; 2;");
    expect(html).toContain("</code></pre>");
  });

  test("remove href perigoso e mantem href https", () => {
    const dangerous = mdToHtml("[x](javascript:alert(1))");
    expect(dangerous).not.toContain("<a");
    expect(dangerous).not.toContain("javascript");
    expect(dangerous).toContain("x)");

    const safe = mdToHtml("[x](https://ok)");
    expect(safe).toContain('<a href="https://ok">x</a>');
  });

  test("junta linhas de citacao em um paragrafo", () => {
    const html = mdToHtml("> linha um\n> linha dois");
    expect(html).toContain("<blockquote><p>linha um linha dois</p></blockquote>");
  });

  test("formata negrito, italico, listas, regra e paragrafo", () => {
    expect(mdToHtml("texto **forte** e *enfase*")).toContain("<strong>forte</strong>");
    expect(mdToHtml("texto **forte** e *enfase*")).toContain("<em>enfase</em>");
    expect(mdToHtml("- um\n- dois")).toContain("<ul>");
    expect(mdToHtml("1. um\n2. dois")).toContain("<ol>");
    expect(mdToHtml("---")).toContain("<hr>");
    expect(mdToHtml("apenas um paragrafo")).toBe("<p>apenas um paragrafo</p>");
  });
});

describe("fullHtml", () => {
  test("inclui doutype pt-BR e a folha de estilo", () => {
    const html = fullHtml("Titulo", "<p>corpo</p>");
    expect(html).toContain('<!doctype html><html lang="pt-BR">');
    expect(html).toContain("<style>");
    expect(html).toContain(RENDER_CSS);
    expect(html).toContain("color-scheme: light");
    expect(html).toContain("<title>Titulo</title>");
    expect(html).toContain("<body><p>corpo</p></body></html>");
  });
});
