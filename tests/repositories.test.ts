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

import {
  openDatabase,
  openMigratedDatabase,
  runMigrations,
  type DatabaseHandle,
} from "../src/infrastructure/db.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { summarizeStudy } from "../src/application/summary.ts";
import type { StudyIdea, StudySummary } from "../src/domain/types.ts";
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

describe("identidade na persistencia", () => {
  /** Estudo minimo gravado direto, para nao depender do pipeline. */
  function seedStudy(repo: SqliteStudyRepository, db: DatabaseHandle, id: string): void {
    db.sqlite
      .query(
        "INSERT INTO studies (id, created_at, updated_at, niche, city, monthly_ticket, num_ideas, pain_method, mock, artifact_dir) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, "2026-01-01", "2026-01-01", "clinicas", "", 300, 3, "mean", 0, `/tmp/${id}`);
    void repo;
  }

  function evaluation(id: string, name: string, index: number): StudyIdea {
    return {
      id,
      name,
      sector: "s",
      description: "d",
      indicators: {
        fit: 1,
        fitConf: 0.9,
        sale: 1,
        saleConf: 0.9,
        disruption: 1,
        disruptionConf: 0.9,
        pain: "p",
        painProbs: {},
        painConf: 0.9,
        solo: 1,
      },
      business: { wtp: 10, meta30: 5, price: 300, priceConf: 0.9 },
      algorithm: {
        label: "FORTE",
        painScore: 1,
        internalScore: 1,
        margin: 1,
        deviation: 0,
        probes: {},
        byParaphrase: {},
      },
      index,
      tier: "A",
    };
  }

  test("o id gravado volta na leitura", async () => {
    const db = openMigratedDatabase(":memory:");
    const repo = new SqliteStudyRepository(db.db);
    try {
      seedStudy(repo, db, "estudo-id");
      await repo.saveEvaluations("estudo-id", [evaluation("id-a", "A", 0.9)], null);

      const record = await repo.get("estudo-id");
      expect(record?.evaluations.map((e) => e.id)).toEqual(["id-a"]);
    } finally {
      db.sqlite.close();
    }
  });

  test("duas ideias de mesmo name coexistem com ids distintos", async () => {
    const db = openMigratedDatabase(":memory:");
    const repo = new SqliteStudyRepository(db.db);
    try {
      seedStudy(repo, db, "estudo-homonimas");
      await repo.saveEvaluations(
        "estudo-homonimas",
        [evaluation("id-1", "Agenda Vazada", 0.9), evaluation("id-2", "Agenda Vazada", 0.8)],
        null,
      );

      const record = await repo.get("estudo-homonimas");
      // Mesmos nomes, identidades distintas: e isso que permite remover uma e nao a outra.
      expect(record?.evaluations.map((e) => e.name)).toEqual(["Agenda Vazada", "Agenda Vazada"]);
      expect(record?.evaluations.map((e) => e.id)).toEqual(["id-1", "id-2"]);
    } finally {
      db.sqlite.close();
    }
  });

  test("o id acompanha a ideia quando a ordem muda", async () => {
    const db = openMigratedDatabase(":memory:");
    const repo = new SqliteStudyRepository(db.db);
    try {
      seedStudy(repo, db, "estudo-ordem");
      await repo.saveEvaluations(
        "estudo-ordem",
        [evaluation("id-a", "A", 0.5), evaluation("id-b", "B", 0.9), evaluation("id-c", "C", 0.7)],
        null,
      );

      // Reordena: C passa a primeiro. O id tem de seguir a ideia, nao a posicao antiga.
      await repo.saveEvaluations(
        "estudo-ordem",
        [evaluation("id-a", "A", 0.9), evaluation("id-b", "B", 0.5), evaluation("id-c", "C", 0.7)],
        null,
      );

      const record = await repo.get("estudo-ordem");
      const byName = new Map(record?.evaluations.map((e) => [e.name, e.id]));
      expect(byName.get("A")).toBe("id-a");
      expect(byName.get("B")).toBe("id-b");
      expect(byName.get("C")).toBe("id-c");
    } finally {
      db.sqlite.close();
    }
  });

  test("summary.ordered expoe o id de cada ideia", () => {
    const summary = summarizeStudy([evaluation("id-x", "X", 0.4), evaluation("id-y", "Y", 0.9)]);

    expect(summary.ordered.map((e) => e.id)).toEqual(["id-y", "id-x"]);
  });

  test("resumo legado sem id e reconciliado com a tabela evaluations", async () => {
    const db = openMigratedDatabase(":memory:");
    const repo = new SqliteStudyRepository(db.db);
    try {
      seedStudy(repo, db, "estudo-legado");
      const ideas = [evaluation("i-1", "A", 0.5), evaluation("i-2", "B", 0.9)];
      // Como uma versao anterior a migration 0003 gravava o resumo: cada ideia sem `id`.
      const summary = summarizeStudy(ideas);
      const legacySummary: StudySummary = {
        ...summary,
        ordered: summary.ordered.map((item) => {
          const legacy = { ...item } as Partial<StudyIdea>;
          delete legacy.id;
          return legacy as StudyIdea;
        }),
      };
      await repo.saveEvaluations("estudo-legado", ideas, legacySummary);
      // A 0003 so preenche `idea_id`; ate o backfill passar a coluna fica nula, como em producao.
      db.sqlite.query("UPDATE evaluations SET idea_id = NULL WHERE study_id = ?").run("estudo-legado");

      const record = await repo.get("estudo-legado");
      const ids = record!.evaluations.map((e) => e.id);
      expect(ids).toEqual(["legacy-estudo-legado-00000001", "legacy-estudo-legado-00000002"]);
      // Sem a reconciliacao o `ordered` vinha do blob e as superficies recebiam `id` undefined.
      expect(record!.summary!.ordered.map((e) => e.id)).toEqual(ids);
      expect(record!.summary!.ordered.map((e) => e.name)).toEqual(["B", "A"]);
    } finally {
      db.sqlite.close();
    }
  });
});

describe("migracao da coluna description", () => {
  test("a coluna description existe depois das migracoes", () => {
    const handle = openDatabase(":memory:");
    runMigrations(handle, "drizzle");

    expect(columnsOf(handle.sqlite, "studies")).toContain("description");
    handle.sqlite.close();
  });

  test("linha gravada antes da coluna aparece com descricao vazia", async () => {
    const db = openMigratedDatabase(":memory:");
    const repo = new SqliteStudyRepository(db.db);
    try {
      // O INSERT não cita a coluna: é o que faz uma versão antiga continuar gravando no mesmo banco.
      db.sqlite
        .query(
          "INSERT INTO studies (id, created_at, updated_at, niche, city, monthly_ticket, num_ideas, pain_method, mock, artifact_dir) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("estudo-antigo", "2026-01-01", "2026-01-01", "Clinicas", "", 300, 3, "choice", 0, "/tmp/x");

      expect((await repo.get("estudo-antigo"))?.description).toBe("");
    } finally {
      db.sqlite.close();
    }
  });

  test("grava e devolve a descricao", async () => {
    const db = openMigratedDatabase(":memory:");
    const repo = new SqliteStudyRepository(db.db);
    try {
      db.sqlite
        .query(
          "INSERT INTO studies (id, created_at, updated_at, niche, city, monthly_ticket, num_ideas, pain_method, mock, artifact_dir) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("estudo-desc", "2026-01-01", "2026-01-01", "Clinicas", "", 300, 3, "choice", 0, "/tmp/y");

      await repo.update("estudo-desc", { description: "bairro, uma cadeira, agenda no papel" });

      expect((await repo.get("estudo-desc"))?.description).toBe("bairro, uma cadeira, agenda no papel");
    } finally {
      db.sqlite.close();
    }
  });
});
