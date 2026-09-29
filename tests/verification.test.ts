import { describe, expect, test } from "bun:test";

import {
  REQUIRED_SECTIONS,
  checkDocument,
  numberVariants,
  unalignedTables,
} from "../src/application/verification.ts";

const FILLER = "linha de preenchimento sem acento.";

function compliantDoc(): string {
  const lines: string[] = [];
  for (const section of REQUIRED_SECTIONS) lines.push(`## ${section}`);
  lines.push("medida de referencia 12.5 por cento.");
  lines.push("frase obrigatoria: promocao de teste.");
  lines.push("| Coluna A | Coluna B |");
  lines.push("| --- | --- |");
  lines.push("| 1 | 2 |");
  while (lines.length < 80) lines.push(FILLER);
  return lines.join("\n");
}

describe("checkDocument", () => {
  test("documento conforme passa sem achados", () => {
    expect(checkDocument(compliantDoc(), [12.5], ["promocao"])).toEqual([]);
    expect(checkDocument(compliantDoc(), [0, -5])).toEqual([]);
  });

  test("texto acentuado e o esperado, nao um achado", () => {
    const doc = `${compliantDoc()}\nvers\u00e3o final com acentua\u00e7\u00e3o`;
    const issues = checkDocument(doc, [12.5], ["promocao"]);
    expect(issues).not.toContain("1 accented character(s)");
    expect(issues.some((issue) => issue.includes("accented"))).toBe(false);
  });

  test("tabela desalinhada produz achado com a linha inicial", () => {
    const doc = `${compliantDoc()}\n| a | b |\n| 1 |`;
    const startLine = compliantDoc().split("\n").length + 1;
    expect(unalignedTables(doc)).toEqual([startLine]);
    expect(checkDocument(doc, [], [])).toContain(`unaligned table at line(s) [${startLine}]`);
  });

  test("secao ausente produz achado especifico", () => {
    const doc = compliantDoc().replace("## 10. Próximos passos", "linha sem secao.");
    expect(checkDocument(doc, [12.5], ["promocao"])).toContain(
      "1 section(s) missing: ['10. Próximos passos']",
    );
  });

  test("numero medido ausente produz achado especifico", () => {
    const doc = compliantDoc();
    const missing = checkDocument(doc, [999.9], ["promocao"]).filter((issue) =>
      issue.startsWith("missing measured number"),
    );
    expect(missing).toEqual(["missing measured number(s): ['999.9']"]);
  });

  test("frase obrigatoria ausente produz achado especifico", () => {
    const doc = compliantDoc();
    expect(checkDocument(doc, [12.5], ["inexistente"])).toContain(
      "missing required phrase(s): ['inexistente']",
    );
  });

  test("documento curto produz achado especifico", () => {
    const short = compliantDoc().split("\n").slice(0, 79).join("\n");
    expect(checkDocument(short, [12.5], ["promocao"])).toContain("document too short: 79 lines (min 80)");
  });
});

describe("numberVariants", () => {
  test("1.5 gera as variantes equivalentes", () => {
    expect([...numberVariants(1.5)].sort()).toEqual(["1.5", "1.50"]);
  });

  test("inteiro gera tambem forma inteira e decimais", () => {
    expect([...numberVariants(2)].sort()).toEqual(["2", "2.0", "2.00"]);
  });

  test("valor nao numerico devolve apenas ele mesmo", () => {
    expect([...numberVariants("abc")]).toEqual(["abc"]);
  });
});
