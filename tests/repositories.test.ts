/**
 * Persistencia de studies: identidade por ideia, gravacao, leitura e migracao de bancos legados.
 *
 * A identidade fica na coluna `idea_id` e nao no `payload_json` porque esse campo guarda a forma do
 * baseline lida por ferramentas Python que casam por chave (CON-006).
 */
import { describe, expect, test } from "bun:test";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { openDatabase, runMigrations } from "../src/infrastructure/db.ts";
import type { Database } from "bun:sqlite";

/** Copia as migracoes existentes sem a 0003, para simular um banco gravado antes da mudanca. */
function legacyMigrationsDir(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "goodbizz-legacy-"));
  for (const file of readdirSync("drizzle")) {
    if (file.startsWith("0003")) continue;
    cpSync(join("drizzle", file), join(dir, file), { recursive: true });
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function columnsOf(sqlite: Database, table: string): string[] {
  return sqlite
    .query(`PRAGMA table_info(${table})`)
    .all()
    .map((r) => (r as { name: string }).name);
}

describe("migracao da coluna idea_id", () => {
  test("a coluna idea_id existe depois das migracoes", () => {
    const handle = openDatabase(":memory:");
    runMigrations(handle, "drizzle");

    expect(columnsOf(handle.sqlite, "evaluations")).toContain("idea_id");
    handle.sqlite.close();
  });

  test("linhas gravadas antes da migrancao recebem um id preenchido e distinto", () => {
    const legacy = legacyMigrationsDir();
    const handle = openDatabase(":memory:");
    try {
      runMigrations(handle, legacy.dir);
      expect(columnsOf(handle.sqlite, "evaluations")).not.toContain("idea_id");

      const insert = handle.sqlite.query(
        `INSERT INTO evaluations (study_id, rank, name, sector, description, "index", tier, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const payload = JSON.stringify({ nome: "Legada" });
      insert.run("estudo-1", 1, "A", "s", "d", 1.5, "A", payload);
      insert.run("estudo-1", 2, "B", "s", "d", 1.4, "B", payload);
      insert.run("estudo-2", 1, "C", "s", "d", 1.3, "C", payload);

      // Agora a migracao nova entra.
      runMigrations(handle, "drizzle");

      const rows = handle.sqlite
        .query("SELECT study_id, idea_id, payload_json FROM evaluations ORDER BY study_id, rank")
        .all() as Array<{ study_id: string; idea_id: string | null; payload_json: string }>;

      expect(rows).toHaveLength(3);
      for (const row of rows) expect(row.idea_id).toBeTruthy();

      // Um id por linha, inclusive entre estudos diferentes com o mesmo rank.
      const ids = rows.map((r) => r.idea_id);
      expect(new Set(ids).size).toBe(3);
    } finally {
      handle.sqlite.close();
      legacy.cleanup();
    }
  });

  test("o backfill nao reescreve o payload_json", () => {
    const legacy = legacyMigrationsDir();
    const handle = openDatabase(":memory:");
    try {
      runMigrations(handle, legacy.dir);
      const payload = JSON.stringify({ nome: "Legada", indicador: { fit: 1 } });
      handle.sqlite
        .query(
          `INSERT INTO evaluations (study_id, rank, name, sector, description, "index", tier, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run("estudo-1", 1, "A", "s", "d", 1.5, "A", payload);

      runMigrations(handle, "drizzle");

      const row = handle.sqlite.query("SELECT payload_json FROM evaluations").get() as {
        payload_json: string;
      };
      // CON-006: a forma do baseline nao muda por causa da identidade.
      expect(row.payload_json).toBe(payload);
    } finally {
      handle.sqlite.close();
      legacy.cleanup();
    }
  });

  test("a migracao e idempotente quando o banco ja tem a coluna", () => {
    const handle = openDatabase(":memory:");
    try {
      runMigrations(handle, "drizzle");
      // Rodar de novo nao pode falhar nem duplicar.
      expect(() => runMigrations(handle, "drizzle")).not.toThrow();
      expect(columnsOf(handle.sqlite, "evaluations")).toContain("idea_id");
    } finally {
      handle.sqlite.close();
    }
  });
});
