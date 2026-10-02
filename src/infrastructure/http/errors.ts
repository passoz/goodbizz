/**
 * HTTP error mapping. Domain errors become typed JSON; anything else becomes a generic 500 só no
 * stack trace or internal detail can escape the process.
 */
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { HTTPException } from "hono/http-exception";

import { DomainError, ValidationError } from "../../domain/errors.ts";
import { scrub } from "../../config/redact.ts";
import type { Logger } from "../../domain/ports.ts";

export interface ErrorBody {
  error: string;
  message: string;
  details?: unknown;
}

export function buildErrorHandler(logger: Logger): ErrorHandler {
  return (error: Error, c: Context) => {
    if (error instanceof DomainError) {
      const body: ErrorBody = { error: error.code, message: scrub(error.message) };
      if (error instanceof ValidationError && error.details !== undefined) {
        body.details = error.details;
      }
      if (error.status >= 500) {
        logger.error("request failed", { code: error.code, path: c.req.path });
      }
      return c.json(body, error.status as 400);
    }
    // Middleware do Hono (ex.: o `csrf()` embutido) sinaliza recusa com `HTTPException`, que carrega
    // o status real. Sem este ramo o 4xx dela virava 500 "Erro interno" e o motivo sumia do operador.
    if (error instanceof HTTPException) {
      logger.warn("http exception", { path: c.req.path, status: error.status });
      return error.getResponse();
    }
    logger.error("unhandled exception", { path: c.req.path, error: scrub(String(error)) });
    const body: ErrorBody = { error: "INTERNAL_SERVER_ERROR", message: "Erro interno" };
    return c.json(body, 500);
  };
}

export function buildNotFoundHandler(): NotFoundHandler {
  return (c) => c.json({ error: "NOT_FOUND", message: `rota nao encontrada: ${c.req.path}` }, 404);
}
