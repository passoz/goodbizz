import { describe, expect, test } from "bun:test";

import { buildHealthApp } from "../src/infrastructure/http/health.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { tempDir } from "./helpers.ts";

describe("health and readiness", () => {
  test("liveness answers ok without touching the database", async () => {
    const handle = openMigratedDatabase(":memory:");
    const app = buildHealthApp(handle.db);
    const response = await app.request("/healthz");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    handle.sqlite.close();
  });

  test("liveness still answers ok after the database is closed", async () => {
    const handle = openMigratedDatabase(":memory:");
    const app = buildHealthApp(handle.db);
    handle.sqlite.close();
    const response = await app.request("/healthz");
    expect(response.status).toBe(200);
  });

  test("readiness reports ready against a working database", async () => {
    const handle = openMigratedDatabase(":memory:");
    const app = buildHealthApp(handle.db);
    const response = await app.request("/readyz");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ready" });
    handle.sqlite.close();
  });

  test("readiness answers 503 when the database is unavailable", async () => {
    const handle = openMigratedDatabase(":memory:");
    const app = buildHealthApp(handle.db);
    handle.sqlite.close();
    const response = await app.request("/readyz");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "not-ready" });
  });

  test("migrations create the three tables", () => {
    const handle = openMigratedDatabase(":memory:");
    const rows = handle.sqlite
      .query("select name from sqlite_master where type = 'table' order by name")
      .all() as Array<{ name: string }>;
    const names = rows.map((row) => row.name);
    expect(names).toContain("studies");
    expect(names).toContain("evaluations");
    expect(names).toContain("cache_entries");
    handle.sqlite.close();
  });

  test("a file-backed database survives closing and reopening", () => {
    const path = `${tempDir("goodbizz-db-")}/app.db`;
    const first = openMigratedDatabase(path);
    first.sqlite
      .query(
        "insert into studies (id, created_at, updated_at, niche, city, monthly_ticket, num_ideas, pain_method, mock, artifact_dir, brief, state, step) values (?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run("s1", "now", "now", "nicho", "", 300, 1, "choice", 0, "/tmp/x", "", "pending", "");
    first.sqlite.close();

    const second = openMigratedDatabase(path, "drizzle");
    const count = second.sqlite.query("select count(*) as total from studies").get() as { total: number };
    expect(count.total).toBe(1);
    second.sqlite.close();
  });
});
