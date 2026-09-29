/**
 * Geracao de PDF via Chromium headless. Nunca lanca erro por binario ausente:
 * apenas falhas reais de execução devolvem `ok: false`.
 */

import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CHROMIUM_CANDIDATES = ["chromium", "chromium-browser", "google-chrome", "chrome"];

/** Localiza o primeiro executavel de Chromium disponível no PATH. */
export function findChromium(): string | null {
  for (const name of CHROMIUM_CANDIDATES) {
    const path = Bun.env.PATH === undefined ? Bun.which(name) : Bun.which(name, { PATH: Bun.env.PATH });
    if (path) return path;
  }
  return null;
}

/** Converte um HTML local em PDF via Chromium headless, respeitando um timeout. */
export async function htmlToPdf(
  htmlPath: string,
  pdfPath: string,
  timeoutMs = 120_000,
): Promise<{ ok: boolean; message: string }> {
  const exe = findChromium();
  if (!exe) {
    return {
      ok: false,
      message: "chromium not found; install it or use HTML output (.md and .html are ready)",
    };
  }
  const cmd = [
    exe,
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--disable-javascript",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(resolve(htmlPath)).href,
  ];
  const result = (() => {
    try {
      return Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe", timeout: timeoutMs });
    } catch {
      return null;
    }
  })();
  if (result === null || result.exitCode === null) {
    return { ok: false, message: "chromium exceeded timeout" };
  }
  if (existsSync(pdfPath) && statSync(pdfPath).size > 0) {
    const size = statSync(pdfPath).size;
    return { ok: true, message: `PDF generated (${Math.floor(size / 1024)} KB)` };
  }
  const errLines = new TextDecoder().decode(result.stderr).trim().split("\n");
  const lastError = errLines[errLines.length - 1] || "unknown error";
  return { ok: false, message: `chromium failed: ${lastError}` };
}
