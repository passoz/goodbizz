/**
 * Casos da persistência (EC-005): remover uma ideia mantém a chave `evidencias` do `dados.json` e o
 * `00-evidencias.md`, regerados a partir das evidências gravadas no estudo.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StudyCache } from "../src/application/cache.ts";
import { StudyService } from "../src/application/study-service.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import type { SearchClient } from "../src/domain/ports.ts";

const QUIET = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

describe("evidências persistidas em casos de borda", () => {
  test("EC-005: remover uma ideia regrava dados.json e 00-evidencias.md com as evidências do estudo", async () => {
    const handle = openMigratedDatabase(":memory:");
    const search: SearchClient = {
      search: (query) =>
        Promise.resolve([
          { title: query, url: `https://r.test/${encodeURIComponent(query)}`, content: `Dado de ${query}.` },
        ]),
    };
    const svc = new StudyService({
      repo: new SqliteStudyRepository(handle.db),
      cache: new StudyCache(new SqliteCacheStore(handle.db)),
      llm: new LlmMock(),
      decider: new DeciderMock(),
      search,
      logger: QUIET,
      artifactsRoot: mkdtempSync(join(tmpdir(), "goodbizz-persist-cases-")),
    } as ConstructorParameters<typeof StudyService>[0]);
    const created = await svc.create(resolveStudyConfig({ niche: "adega", numIdeas: 2, mock: true }));
    await svc.run(created.id);
    const record = await svc.get(created.id);
    await svc.removeIdea(created.id, record.evaluations[0]?.id ?? "");
    const dados = JSON.parse(readFileSync(join(record.artifactDir, "dados.json"), "utf8"));
    expect(dados.evidencias).toEqual(record.evidences);
    expect(readFileSync(join(record.artifactDir, "00-evidencias.md"), "utf8")).toContain(
      record.evidences[0]?.trecho ?? "?",
    );
    handle.sqlite.close();
  });
});
