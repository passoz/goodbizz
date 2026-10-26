import { describe, expect, test } from "bun:test";
import { valueBlockFor } from "../src/application/generate-study.ts";
import { StudyCache } from "../src/application/cache.ts";
import { StudyService } from "../src/application/study-service.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { SearchMock } from "../src/infrastructure/search-mock.ts";
import { silentLogger, tempDir } from "./helpers.ts";

function harness() {
  const db = openMigratedDatabase(":memory:");
  const repo = new SqliteStudyRepository(db.db);
  const service = new StudyService({
    repo,
    cache: new StudyCache(new SqliteCacheStore(db.db)),
    llm: new LlmMock(),
    decider: new DeciderMock(),
    search: new SearchMock(),
    logger: silentLogger(),
    artifactsRoot: tempDir("goodbizz-setup-persist-"),
  });
  return { service, db };
}

/**
 * Casos da task 1.10 (FR-008/QR-004): o setup persiste no banco,
 * o estudo antigo abre com 1500 e a troca de setup invalida o documento em cache.
 */
describe("FR-008: casos da persistência do setupFee", () => {
  test("estudo com setup 1800 persiste e volta em outra instância do repositório", async () => {
    const { service, db } = harness();
    const created = await service.create(
      resolveStudyConfig({ niche: "cafés de bairro", mock: true, setupFee: 1800 }),
    );
    const fresh = await new SqliteStudyRepository(db.db).get(created.id);
    expect(fresh?.setupFee).toBe(1800);
    db.sqlite.close();
  });

  test("estudo antigo sem a coluna abre com 1500", async () => {
    const { db } = harness();
    db.sqlite.exec(
      "CREATE TABLE legacy_studies (id text PRIMARY KEY NOT NULL, created_at text NOT NULL, updated_at text NOT NULL, niche text NOT NULL, description text NOT NULL DEFAULT '', city text NOT NULL DEFAULT '', monthly_ticket integer NOT NULL, num_ideas integer NOT NULL, pain_method text NOT NULL, mock integer NOT NULL DEFAULT false, artifact_dir text NOT NULL, brief text NOT NULL DEFAULT '', state text NOT NULL DEFAULT 'pending', step text NOT NULL DEFAULT '', error text, summary_json text, usage_json text, evidences_json text);",
    );
    db.sqlite.exec(
      "INSERT INTO legacy_studies (id, created_at, updated_at, niche, description, city, monthly_ticket, num_ideas, pain_method, mock, artifact_dir, brief, state, step) VALUES ('antigo-1', '2026-01-01', '2026-01-01', 'nicho', '', '', 300, 1, 'mix', 1, '', '', 'done', '')",
    );
    db.sqlite.exec("ALTER TABLE studies RENAME TO studies_new; ALTER TABLE legacy_studies RENAME TO studies;");
    const repo = new SqliteStudyRepository(db.db);
    const record = await repo.get("antigo-1");
    expect(record?.setupFee).toBe(1500);
    db.sqlite.close();
  });

  test("o bloco de valor usa o setup do estudo e muda a conta", async () => {
    const block = valueBlockFor(
      [
        {
          ideaName: "ideia",
          premises: {
            fatores: [
              { nome: "f1", valor: 20, unidade: "u", fonte: "INFERENCE" },
              { nome: "f2", valor: 4, unidade: "u", fonte: "INFERENCE" },
              { nome: "f3", valor: 35, unidade: "u", fonte: "INFERENCE" },
            ],
            recuperacao: 0.5,
          },
        },
      ],
      "ideia",
      350,
      1800,
    );
    expect(block?.setupFee).toBe(1800);
    expect(block?.value.perdaMes).toBe(2800);
    expect(block?.value.retorno12m).toBe(12 * 1400 - 1800 - 12 * 350);
    const other = valueBlockFor(
      [
        {
          ideaName: "ideia",
          premises: {
            fatores: [
              { nome: "f1", valor: 20, unidade: "u", fonte: "INFERENCE" },
              { nome: "f2", valor: 4, unidade: "u", fonte: "INFERENCE" },
              { nome: "f3", valor: 35, unidade: "u", fonte: "INFERENCE" },
            ],
            recuperacao: 0.5,
          },
        },
      ],
      "ideia",
      350,
      1500,
    );
    expect(other?.value.retorno12m).not.toBe(block?.value.retorno12m);
  });
});
