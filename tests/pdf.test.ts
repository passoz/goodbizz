import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { findChromium, htmlToPdf } from "../src/application/pdf.ts";

const MISSING_CHROMIUM_MESSAGE =
  "chromium not found; install it or use HTML output (.md and .html are ready)";

function restorePath(saved: string | undefined): void {
  if (saved === undefined) delete Bun.env.PATH;
  else Bun.env.PATH = saved;
}

describe("findChromium", () => {
  test("devolve caminho string ou null", () => {
    const found = findChromium();
    expect(found === null || typeof found === "string").toBe(true);
  });
});

describe("htmlToPdf", () => {
  test("sem chromium devolve a mensagem exata do baseline", async () => {
    const saved = Bun.env.PATH;
    const dir = mkdtempSync(join(tmpdir(), "goodbizz-"));
    try {
      writeFileSync(join(dir, "doc.html"), "<html></html>");
      Bun.env.PATH = "";
      const result = await htmlToPdf(join(dir, "doc.html"), join(dir, "doc.pdf"), 1000);
      expect(result.ok).toBe(false);
      expect(result.message).toBe(MISSING_CHROMIUM_MESSAGE);
    } finally {
      restorePath(saved);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("pdf existente com tamanho positivo devolve ok", async () => {
    const saved = Bun.env.PATH;
    const dir = mkdtempSync(join(tmpdir(), "goodbizz-"));
    try {
      const fakeChromium = join(dir, "chromium");
      writeFileSync(fakeChromium, "#!/bin/sh\nexit 0\n");
      chmodSync(fakeChromium, 0o755);
      Bun.env.PATH = `${dir}:${saved ?? ""}`;

      writeFileSync(join(dir, "doc.html"), "<html></html>");
      writeFileSync(join(dir, "doc.pdf"), "PDFDATA");
      const result = await htmlToPdf(join(dir, "doc.html"), join(dir, "doc.pdf"), 5000);
      expect(result.ok).toBe(true);
      expect(result.message).toBe("PDF generated (0 KB)");
    } finally {
      restorePath(saved);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reports a timeout when the browser exceeds the budget", async () => {
    const saved = Bun.env.PATH;
    const dir = mkdtempSync(join(tmpdir(), "goodbizz-"));
    try {
      const fakeChromium = join(dir, "chromium");
      writeFileSync(fakeChromium, "#!/bin/sh\nsleep 5\n");
      chmodSync(fakeChromium, 0o755);
      Bun.env.PATH = dir;

      writeFileSync(join(dir, "doc.html"), "<html></html>");
      const result = await htmlToPdf(join(dir, "doc.html"), join(dir, "out.pdf"), 250);
      expect(result.ok).toBe(false);
      expect(result.message).toBe("chromium exceeded timeout");
    } finally {
      restorePath(saved);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("reports the last stderr line when the browser fails", async () => {
    const saved = Bun.env.PATH;
    const dir = mkdtempSync(join(tmpdir(), "goodbizz-"));
    try {
      const fakeChromium = join(dir, "chromium");
      writeFileSync(
        fakeChromium,
        '#!/bin/sh\necho "primeira linha" >&2\necho "falha do navegador" >&2\nexit 2\n',
      );
      chmodSync(fakeChromium, 0o755);
      Bun.env.PATH = dir;

      writeFileSync(join(dir, "doc.html"), "<html></html>");
      const result = await htmlToPdf(join(dir, "doc.html"), join(dir, "out.pdf"), 5000);
      expect(result.ok).toBe(false);
      expect(result.message).toBe("chromium failed: falha do navegador");
    } finally {
      restorePath(saved);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
