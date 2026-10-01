/**
 * Offline tests for the SQLite repositories and the response cache.
 */
import { describe, expect, test } from "bun:test";

import { StudyCache, cacheKeyFor, scopedKey } from "../src/application/cache.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { cacheEntries, openMigratedDatabase } from "../src/infrastructure/db.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import type { StudyIdea, StudyRecord, StudySummary, Tier } from "../src/domain/types.ts";

function makeEvaluation(name: string, index: number, tier: Tier): StudyIdea {
  return {
    id: `id-${name}`,
    name,
    sector: "servicos",
    description: `descricao ${name}`,
    indicators: {
      fit: 1.5,
      fitConf: 0.9,
      sale: 1.2,
      saleConf: 0.8,
      disruption: 0.5,
      disruptionConf: 0.7,
      pain: "dinheiro_direto",
      painProbs: { dinheiro_direto: 0.8, backoffice: 0.2 },
      painConf: 0.6,
      solo: 0.4,
    },
    business: { wtp: 0.5, meta30: 0.3, price: 1.0, priceConf: 0.9 },
    algorithm: {
      label: "FORTE",
      painScore: 0.7,
      internalScore: 0.2,
      margin: 0.5,
      deviation: 0.1,
      probes: { dinheiro: 0.7, reputacao: 0.4 },
      byParaphrase: { "0": { dinheiro: 0.7, reputacao: 0.4 } },
    },
    index,
    tier,
  };
}

function makeRecord(): StudyRecord {
  return {
    id: "st-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    niche: "contabilidade",
    description: "escritorio de bairro",
    city: "curitiba",
    monthlyTicket: 300,
    numIdeas: 2,
    painMethod: "choice",
    mock: true,
    artifactDir: "estudo/st-1",
    brief: "brief",
    progress: { state: "running", step: "avaliando", error: null },
    evaluations: [],
    summary: null,
    usage: null,
  };
}

function makeSummary(ordered: StudyIdea[]): StudySummary {
  return {
    ordered,
    painGroups: { forte: [ordered[0]!.name], mista: [], fraca: [ordered[1]!.name] },
    means: { fit: 1.5, sale: 1.2, disruption: 0.5, solo: 0.4, wtp: 0.5, meta30: 0.3 },
    tiers: { A: [ordered[0]!.name], B: [], C: [ordered[1]!.name] },
    attack: [ordered[0]!.name],
    review: [ordered[1]!.name],
  };
}

describe("migrations", () => {
  test("openMigratedDatabase creates the three tables", () => {
    const handle = openMigratedDatabase(":memory:");
    const rows = handle.sqlite.query("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{
      name: string;
    }>;
    const names = rows.map((r) => r.name);
    expect(names).toContain("studies");
    expect(names).toContain("evaluations");
    expect(names).toContain("cache_entries");
    handle.sqlite.close();
  });
});

describe("SqliteStudyRepository", () => {
  test("round-trips a study with two evaluations and lists the top idea", async () => {
    const handle = openMigratedDatabase(":memory:");
    const repo = new SqliteStudyRepository(handle.db);
    const record = makeRecord();
    await repo.save(record);

    const low = makeEvaluation("ideia-fraca", 0.4, "C");
    const high = makeEvaluation("ideia-forte", 1.7, "A");
    await repo.saveEvaluations(record.id, [low, high], makeSummary([high, low]));

    const loaded = await repo.get(record.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.niche).toBe("contabilidade");
    expect(loaded!.progress.state).toBe("running");
    expect(loaded!.evaluations).toHaveLength(2);
    expect(loaded!.evaluations.map((e) => e.name)).toEqual(["ideia-forte", "ideia-fraca"]);
    expect(loaded!.evaluations[0]!.index).toBe(1.7);
    expect(loaded!.evaluations[0]!.tier).toBe("A");
    expect(loaded!.evaluations[0]!.indicators.painProbs.dinheiro_direto).toBe(0.8);
    expect(loaded!.evaluations[1]!.index).toBe(0.4);
    expect(loaded!.evaluations[1]!.tier).toBe("C");
    expect(loaded!.summary!.ordered[0]!.name).toBe("ideia-forte");

    const list = await repo.list();
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(record.id);
    expect(list[0]!.ideaCount).toBe(2);
    expect(list[0]!.topIdea).toBe("ideia-forte");
    expect(list[0]!.topIndex).toBe(1.7);
    expect(list[0]!.state).toBe("running");
    handle.sqlite.close();
  });

  test("update patches state/step and returns null for an unknown id", async () => {
    const handle = openMigratedDatabase(":memory:");
    const repo = new SqliteStudyRepository(handle.db);
    await repo.save(makeRecord());
    await repo.update("st-1", { progress: { state: "done", step: "fim", error: null } });
    const loaded = await repo.get("st-1");
    expect(loaded!.progress).toEqual({ state: "done", step: "fim", error: null });
    expect(await repo.get("missing")).toBeNull();
    handle.sqlite.close();
  });
});

describe("SqliteCacheStore + StudyCache", () => {
  test("wrap computes once, reuses, skips corrupt rows and counts entries", async () => {
    const handle = openMigratedDatabase(":memory:");
    const store = new SqliteCacheStore(handle.db);
    const cache = new StudyCache(store);

    let computeCount = 0;
    const compute = async () => {
      computeCount += 1;
      return { value: 42 };
    };

    const first = await cache.wrap("k1", compute);
    const second = await cache.wrap("k1", compute);
    expect(first).toEqual({ value: 42 });
    expect(second).toEqual({ value: 42 });
    expect(computeCount).toBe(1);
    expect(cache.hits).toBe(1);

    expect(await cache.get("missing")).toBeNull();
    expect(cache.hits).toBe(1);

    handle.db
      .insert(cacheEntries)
      .values({ key: "corrupt", valueJson: "{not json", createdAt: "2026-01-01T00:00:00.000Z" })
      .run();
    expect(await cache.get("corrupt")).toBeNull();
    expect(store.hits()).toBe(1);

    expect(await cache.count()).toBe(2);
    handle.sqlite.close();
  });

  test("a chave com escopo separa dois estudos e a purga remove so o escopo pedido", async () => {
    const handle = openMigratedDatabase(":memory:");
    const store = new SqliteCacheStore(handle.db);
    const cache = new StudyCache(store);

    await cache.put(scopedKey("estudo-a", "brief", "clinicas"), "brief de A");
    await cache.put(scopedKey("estudo-b", "brief", "clinicas"), "brief de B");
    expect(await cache.count()).toBe(2);

    // Mesma configuração, sementes diferentes: nenhuma resposta é compartilhada.
    expect(await cache.get<string>(scopedKey("estudo-a", "brief", "clinicas"))).toBe("brief de A");
    expect(await cache.get<string>(scopedKey("estudo-b", "brief", "clinicas"))).toBe("brief de B");

    expect(await store.purge("estudo-a")).toBe(1);
    expect(await cache.get<string>(scopedKey("estudo-a", "brief", "clinicas"))).toBeNull();
    expect(await cache.get<string>(scopedKey("estudo-b", "brief", "clinicas"))).toBe("brief de B");

    // Sem semente nada e removido: a purga nunca e global.
    expect(await store.purge("")).toBe(0);
    expect(await cache.count()).toBe(1);
    handle.sqlite.close();
  });

  test("scopedKey sem semente mantem a chave da CLI", () => {
    expect(scopedKey("", "system", "user")).toBe(cacheKeyFor("system", "user"));
    expect(scopedKey("estudo-a", "system", "user")).toBe(`estudo-a::${cacheKeyFor("system", "user")}`);
  });

  test("cacheKeyFor is deterministic and 24 hex chars", () => {
    const key = cacheKeyFor("system", "user");
    expect(key).toMatch(/^[0-9a-f]{24}$/);
    expect(cacheKeyFor("system", "user")).toBe(key);
    expect(cacheKeyFor("system", "other")).not.toBe(key);
  });
});
