/**
 * Assets de marca fora da UI: `/favicon.svg` vem do codigo, os rasterios de `public/`.
 * O ponto critico e a ordem de montagem: nenhum deles pode passar pelo middleware de CSRF da
 * interface, porque favicon e toque nao devem criar sessao. Tudo offline, `app.request` sem porta.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";

import { createLogger } from "../src/config/runtime.ts";
import { buildHttpApp } from "../src/infrastructure/http/app.ts";
import { buildStaticApp, defaultPublicDir } from "../src/infrastructure/http/static.ts";
import { faviconSvg, markBody } from "../src/infrastructure/http/ui/brand.ts";

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ICO_MAGIC = [0x00, 0x00, 0x01, 0x00];

async function bytes(res: Response): Promise<number[]> {
  return [...new Uint8Array(await res.arrayBuffer())];
}

function startsWith(data: number[], magic: number[]): boolean {
  return magic.every((byte, index) => data[index] === byte);
}

/** App completa com sub-apps vazias: sobra so a montagem de rota e o 404. */
function fullApp(): Hono {
  return buildHttpApp({
    api: new Hono(),
    ui: new Hono(),
    health: new Hono(),
    logger: createLogger("error"),
    production: false,
  });
}

describe("svg da marca", () => {
  test("servido do codigo, com a geometria e as cores da escala", async () => {
    const res = await buildStaticApp().request("/favicon.svg");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/svg+xml");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");

    const body = await res.text();
    expect(body).toBe(faviconSvg());
    expect(body).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(body).toContain('viewBox="0 0 64 64"');
    expect(body).toContain("#dd5855");
    expect(body).toContain("#bfc115");
    expect(body).toContain("#72ce3b");
  });

  test("o corpo da marca e o mesmo que o topbar renderiza", () => {
    expect(markBody()).toContain('fill="#14100f"');
    expect(faviconSvg()).toContain(markBody());
    expect(faviconSvg().endsWith("</svg>")).toBe(true);
  });
});

describe("rasterios de public/", () => {
  test("cada rota responde com o tipo certo e a assinatura do formato", async () => {
    const app = buildStaticApp();

    const png = await app.request("/favicon.png");
    expect(png.status).toBe(200);
    expect(png.headers.get("content-type")).toBe("image/png");
    expect(png.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(startsWith(await bytes(png), PNG_MAGIC)).toBe(true);

    const ico = await app.request("/favicon.ico");
    expect(ico.status).toBe(200);
    expect(ico.headers.get("content-type")).toBe("image/x-icon");
    expect(startsWith(await bytes(ico), ICO_MAGIC)).toBe(true);

    const touch = await app.request("/apple-touch-icon.png");
    expect(touch.status).toBe(200);
    expect(touch.headers.get("content-type")).toBe("image/png");
    expect(startsWith(await bytes(touch), PNG_MAGIC)).toBe(true);
  });

  test("publicDir vazio: rasterio vira 404 e o svg continua no ar", async () => {
    const empty = mkdtempSync(join(tmpdir(), "goodbizz-static-"));
    const app = buildStaticApp(empty);

    expect((await app.request("/favicon.png")).status).toBe(404);
    expect((await app.request("/favicon.ico")).status).toBe(404);
    expect((await app.request("/apple-touch-icon.png")).status).toBe(404);
    expect((await app.request("/favicon.svg")).status).toBe(200);
  });

  test("o diretorio padrao e `public/` na arvore de trabalho", () => {
    expect(defaultPublicDir()).toBe(join(process.cwd(), "public"));
  });
});

describe("montagem na app completa", () => {
  test("os assets nao passam pelo middleware de CSRF da interface", async () => {
    const app = fullApp();

    for (const path of ["/favicon.svg", "/favicon.png", "/favicon.ico", "/apple-touch-icon.png"]) {
      const res = await app.request(path);
      expect(res.status).toBe(200);
      expect(res.headers.get("set-cookie")).toBeNull();
    }
  });

  test("rota sem asset cai no 404 da app", async () => {
    expect((await fullApp().request("/favicon.gif")).status).toBe(404);
  });
});
