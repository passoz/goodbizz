/**
 * Liveness and readiness.
 *
 * `/healthz` answers "this process is alive" and must never touch the database or the network.
 * `/readyz` answers "I can take traffic" and pings SQLite for real.
 */
import { Hono } from "hono";
import { sql } from "drizzle-orm";

import type { Db } from "../db.ts";

export function buildHealthApp(db: Db): Hono {
  const app = new Hono();

  app.get("/healthz", (c) => c.json({ status: "ok" }));

  app.get("/readyz", (c) => {
    try {
      db.get(sql`select 1`);
      return c.json({ status: "ready" });
    } catch {
      return c.json({ status: "not-ready" }, 503);
    }
  });

  return app;
}
