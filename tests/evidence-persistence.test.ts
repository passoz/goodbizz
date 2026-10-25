/**
 * Persistência das evidências (EC-005): o serviço passa a busca ao pipeline, grava as evidências
 * do estudo e o estudo gravado antes da coluna abre com lista vazia e consumo de busca zerado.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StudyCache } from "../src/application/cache.ts";
import { StudyService } from "../src/application/study-service.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase, studies } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SearchMock } from "../src/infrastructure/search-mock.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import type { SearchClient } from "../src/domain/ports.ts";

const QUIET = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

function service() {
  const handle = openMigratedDatabase(":memory:");
  let calls = 0;
  const search: SearchClient = {
    search(query) {
      calls += 1;
      return Promise.resolve([
        { title: query, url: `https://persiste.test/${encodeURIComponent(query)}`, content: `Fato sobre ${query}. Resto.` },
      ]);
    },
    usage: () => ({ calls, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }),
  };
  const svc = new StudyService({
    repo: new SqliteStudyRepository(handle.db),
    cache: new StudyCache(new SqliteCacheStore(handle.db)),
    llm: new LlmMock(),
    decider: new DeciderMock(),
    search,
    logger: QUIET,
    artifactsRoot: mkdtempSync(join(tmpdir(), "goodbizz-persist-")),
  } as ConstructorParameters<typeof StudyService>[0]);
  return { handle, svc, calls: () => calls };
}

describe("evidências persistidas", () => {
  test("EC-005: o estudo executado guarda as evidências e o consumo de busca", async () => {
    const { handle, svc, calls } = service();
    const created = await svc.create(resolveStudyConfig({ niche: "deposito de bebidas", numIdeas: 2, mock: true }));
    await svc.run(created.id);
    const record = await svc.get(created.id);
    expect(record.progress.state).toBe("done");
    expect(record.evidences.length).toBeGreaterThan(0);
    expect(record.usage?.search.calls).toBe(calls());
    const dados = JSON.parse(readFileSync(join(record.artifactDir, "dados.json"), "utf8"));
    expect(dados.evidencias).toEqual(record.evidences);

    // Reexecução: a fase de pesquisa roda de novo, servida pelo cache, e as evidências ficam.
    const before = calls();
    await svc.run(created.id);
    const rerun = await svc.get(created.id);
    expect(calls()).toBe(before);
    expect(rerun.evidences).toEqual(record.evidences);
    handle.sqlite.close();
  });

  test("EC-005: estudo gravado antes da coluna abre com zero evidências", async () => {
    const { handle, svc } = service();
    const now = new Date().toISOString();
    handle.db
      .insert(studies)
      .values({
        id: "estudo-antigo",
        createdAt: now,
        updatedAt: now,
        niche: "Oficina",
        monthlyTicket: 300,
        numIdeas: 3,
        painMethod: "choice",
        artifactDir: join(tmpdir(), "estudo-antigo"),
        state: "done",
        step: "concluído",
        usageJson: JSON.stringify({
          llm: { calls: 3, inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 },
          decider: { calls: 9, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
        }),
      })
      .run();
    const record = await svc.get("estudo-antigo");
    expect(record.evidences).toEqual([]);
    expect(record.usage?.search.calls).toBe(0);
    const listed = (await svc.list()).find((item) => item.id === "estudo-antigo");
    expect(listed?.usage?.search.calls).toBe(0);
    handle.sqlite.close();
  });
});
