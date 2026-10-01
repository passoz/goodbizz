/**
 * Assets de marca servidos fora da UI: favicon, toque e icone de compatibilidade.
 *
 * Fora da UI de proposito — a sub-app da interface roda o middleware de CSRF e emite cookie em
 * toda requisicao, e um favicon nao deve criar sessao nem depender dela. O rasterio vive em
 * `public/` (relativo ao diretorio de trabalho: `/app` na imagem, a raiz do repositorio em dev e
 * em teste); o SVG vem do codigo, para ser a mesma marca que o topbar renderiza.
 */
import { join } from "node:path";

import { Hono } from "hono";

import { faviconSvg } from "./ui/brand.ts";

/** Caminho de trabalho da imagem (`WORKDIR /app`, `CMD bun dist/index.js`) e da arvore em dev. */
export function defaultPublicDir(): string {
  return join(process.cwd(), "public");
}

const RASTERS: Array<{ path: string; file: string; type: string }> = [
  { path: "/favicon.png", file: "favicon.png", type: "image/png" },
  { path: "/favicon.ico", file: "favicon.ico", type: "image/x-icon" },
  { path: "/apple-touch-icon.png", file: "apple-touch-icon.png", type: "image/png" },
];

/** Nome fixo, sem hash: o navegador revalida, entao a cache e curta e publica. */
const CACHE = "public, max-age=3600";

export function buildStaticApp(publicDir: string = defaultPublicDir()): Hono {
  const app = new Hono();

  app.get("/favicon.svg", (c) =>
    c.body(faviconSvg(), 200, {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": CACHE,
    }),
  );

  for (const raster of RASTERS) {
    app.get(raster.path, async (c) => {
      const file = Bun.file(join(publicDir, raster.file));
      if (!(await file.exists())) return c.notFound();
      return c.body(await file.arrayBuffer(), 200, {
        "Content-Type": raster.type,
        "Cache-Control": CACHE,
      });
    });
  }

  return app;
}
