/**
 * HTTP composition root: mounting, security headers, access log, error mapping and 404.
 * The API and the UI are separate sub-apps so the UI can carry CSRF protection without
 * putting the public API behind a form filter.
 */
import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";

import { buildErrorHandler, buildNotFoundHandler } from "./errors.ts";
import { buildStaticApp } from "./static.ts";
import type { Logger } from "../../domain/ports.ts";

export interface HttpAppParts {
  api: Hono;
  ui: Hono;
  health: Hono;
  logger: Logger;
  /** Force HTTPS redirect and HSTS when the deployment terminates TLS. */
  production: boolean;
}

export function buildHttpApp(parts: HttpAppParts): Hono {
  const app = new Hono();

  app.use("*", secureHeaders({ crossOriginResourcePolicy: "same-origin" }));

  app.use("*", async (c, next) => {
    const started = performance.now();
    await next();
    parts.logger.info("request", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
    });
  });

  if (parts.production) {
    // Redirect to HTTPS only when a TLS-terminating proxy tells us the client spoke plain HTTP.
    // Redirecting unconditionally would break health checks and direct container traffic.
    app.use("*", async (c, next) => {
      if (c.req.path === "/healthz" || c.req.path === "/readyz") return next();
      if (c.req.header("x-forwarded-proto") === "http") {
        const target = new URL(c.req.url);
        target.protocol = "https:";
        return c.redirect(target.toString(), 308);
      }
      return next();
    });
  }

  app.route("/api", parts.api);
  app.route("/", parts.health);
  // Antes da UI de proposito: a sub-app da interface emite cookie CSRF em toda requisicao, e
  // favicon/toque nao devem criar sessao. Caminho sem rota dentro cai na UI e no 404 dela.
  app.route("/", buildStaticApp());
  app.route("/", parts.ui);

  app.notFound(buildNotFoundHandler());
  app.onError(buildErrorHandler(parts.logger));

  return app;
}
