import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { removeAccentsFromMarkdown, stripAccents } from "../src/application/normalize.ts";
import { hasAccents } from "../src/application/verification.ts";

describe("removeAccentsFromMarkdown", () => {
  test("reescreve apenas os markdown com acento e devolve os caminhos ordenados", () => {
    const root = mkdtempSync(join(tmpdir(), "goodbizz-"));
    try {
      const accented = join(root, "acentuado.md");
      const plain = join(root, "plano.md");
      writeFileSync(accented, "acao n\u00e3o");
      writeFileSync(plain, "acao nao");
      mkdirSync(join(root, "sub"));
      const nested = join(root, "sub", "aninhado.md");
      writeFileSync(nested, "vers\u00e3o final");

      const modified = removeAccentsFromMarkdown(root);

      expect(modified).toEqual([accented, nested]);
      expect(readFileSync(accented, "utf8")).toBe("acao nao");
      expect(hasAccents(readFileSync(accented, "utf8"))).toBe(false);
      expect(readFileSync(nested, "utf8")).toBe("versao final");
      expect(readFileSync(plain, "utf8")).toBe("acao nao");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("stripAccents", () => {
  test("reexporta a remocao de diacriticos", () => {
    expect(stripAccents("acao n\u00e3o")).toBe("acao nao");
  });
});
