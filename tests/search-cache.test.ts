/**
 * Perfil de busca no catalogo (QR-003): o tipo search entra no store, o perfil ativo sobrepoe o
 * ambiente, entra na impressao de cache, e reexecutar com o mesmo provedor nao repete buscas.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ProviderSettingsStore } from "../src/application/settings.ts";
import { StudyCache } from "../src/application/cache.ts";
import { generateStudy } from "../src/application/generate-study.ts";
import { cacheFingerprint, effectiveProviders } from "../src/config/providers.ts";
import { loadEnv, resetEnv } from "../src/config/env.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteSettingsRepository } from "../src/infrastructure/settings-repository.ts";
import type { SearchClient } from "../src/domain/ports.ts";
import type { ProviderUsage, SearchResult } from "../src/domain/types.ts";

const savedEnv: Record<string, string | undefined> = {};

function withSearchEnv(url: string, key: string): void {
  for (const name of ["LLM_API_KEY", "DECISION_API_KEY", "DECISION_API_URL", "SEARCH_API_URL", "SEARCH_API_KEY"] as const) {
    if (!(name in savedEnv)) savedEnv[name] = Bun.env[name];
  }
  Bun.env.LLM_API_KEY = "chave-teste";
  Bun.env.DECISION_API_KEY = "chave-teste";
  Bun.env.DECISION_API_URL = "https://decisor.teste";
  Bun.env.SEARCH_API_URL = url;
  Bun.env.SEARCH_API_KEY = key;
  resetEnv();
}

function restoreEnv(): void {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete Bun.env[name];
    else Bun.env[name] = value;
  }
  resetEnv();
}

const QUIET = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
const ZERO: ProviderUsage = { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

/** Busca que conta as chamadas reais ao provedor (o cache do pipeline decide se ela roda). */
function countingSearch(counter: { calls: number }): SearchClient {
  return {
    search(query: string): Promise<SearchResult[]> {
      counter.calls += 1;
      return Promise.resolve([
        { title: query, url: `https://cache.test/${counter.calls}`, content: `Pagina ${counter.calls} com o plano basico.` },
      ]);
    },
    usage: () => ({ ...ZERO, calls: counter.calls }),
  };
}

describe("perfil de busca no catalogo", () => {
  test("QR-003: o perfil de busca ativo sobrepoe o ambiente e entra na impressao de cache", async () => {
    withSearchEnv("https://ambiente.test", "chave-ambiente");
    try {
      const env = loadEnv();
      const base = effectiveProviders(env, { profiles: [], activeLlm: null, activeDecider: null });
      expect(base.searchBaseUrl).toBe("https://ambiente.test");

      const db = openMigratedDatabase(":memory:");
      const store = new ProviderSettingsStore(new SqliteSettingsRepository(db.db));
      const created = await store.create({
        name: "Busca Tavily",
        kind: "search",
        url: "https://tavily.test",
        model: "",
        apiKey: "chave-tavily",
      });
      const profile = created.profiles?.find((candidate) => candidate.kind === "search");
      expect(profile?.url).toBe("https://tavily.test");
      expect(created.activeSearch).toBe(profile?.id ?? null);

      const effective = effectiveProviders(env, store.current());
      expect(effective.searchBaseUrl).toBe("https://tavily.test");
      expect(effective.searchApiKey).toBe("chave-tavily");
      expect(cacheFingerprint(effective)).not.toBe(cacheFingerprint(base));
      db.sqlite.close();
    } finally {
      restoreEnv();
    }
  });

  test("QR-003: reexecutar com o mesmo provedor nao repete buscas; trocar faz buscar de novo", async () => {
    withSearchEnv("https://ambiente.test", "chave-ambiente");
    try {
      const db = openMigratedDatabase(":memory:");
      const search = new LlmMock();
      void search;
      const counter = { calls: 0 };
      const cache = new StudyCache(new SqliteCacheStore(db.db));
      const cfg = {
        ...resolveStudyConfig({ niche: "deposito de bebidas", numIdeas: 1, mock: true }),
        outputDir: mkdtempSync(join(tmpdir(), "goodbizz-cache-")),
        evaluateOnly: true,
        providerFingerprint: cacheFingerprint(
          effectiveProviders(loadEnv(), { profiles: [], activeLlm: null, activeDecider: null }),
        ),
      };
      const deps = { llm: new LlmMock(), decider: new DeciderMock(), search: countingSearch(counter), cache, logger: QUIET };
      const first = await generateStudy(cfg, deps);
      const made = counter.calls;
      expect(made).toBeGreaterThan(0);
      expect(first.usage.search.calls).toBe(made);

      const second = await generateStudy(cfg, deps);
      expect(counter.calls).toBe(made);
      expect(second.usage.search.calls).toBe(0);

      const other = {
        ...cfg,
        providerFingerprint: `${cfg.providerFingerprint}#troca`,
      };
      const third = await generateStudy(other, deps);
      expect(counter.calls).toBeGreaterThan(made);
      expect(third.usage.search.calls).toBeGreaterThan(0);
      db.sqlite.close();
    } finally {
      restoreEnv();
    }
  });
});
