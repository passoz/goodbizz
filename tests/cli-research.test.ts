/**
 * Aceitação da CLI com pesquisa (SC-002): o estudo `--mock` grava `00-evidencias.md`
 * e todo README de ideia termina com a seção Fontes.
 */
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { main } from "../src/cli.ts";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "goodbizz-cli-research-"));
}

function silence(): () => void {
  const originalLog = console.log;
  const originalError = console.error;
  console.log = () => {};
  console.error = () => {};
  return () => {
    console.log = originalLog;
    console.error = originalError;
  };
}

describe("CLI com pesquisa web", () => {
  test("SC-002: generate --mock grava 00-evidencias.md e Fontes em cada README", async () => {
    const dir = tempDir();
    const restore = silence();
    let code = 0;
    try {
      code = await main([
        "generate",
        "depositos de bebidas",
        "--city",
        "Cabo Frio",
        "--ideas",
        "2",
        "--mock",
        "--output",
        dir,
      ]);
    } finally {
      restore();
    }
    expect(code).toBe(0);

    const evidencias = join(dir, "00-evidencias.md");
    expect(existsSync(evidencias)).toBe(true);
    expect(readFileSync(evidencias, "utf8")).toContain("evidência");

    const folders = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    expect(folders.length).toBeGreaterThan(0);
    for (const folder of folders) {
      const readme = readFileSync(join(dir, folder.name, "README.md"), "utf8");
      expect(readme).toContain("## Fontes");
      expect(readme.trimEnd().endsWith("## Fontes")).toBe(false);
    }
  });
});
