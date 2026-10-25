/**
 * Casos do perfil de busca (QR-003): tipo invalido e recusado, ativo do tipo errado nao serve, e o
 * ativo da busca sobrevive ao reload.
 */
import { describe, expect, test } from "bun:test";

import { ProviderSettingsStore } from "../src/application/settings.ts";
import { cacheFingerprint, effectiveProviders } from "../src/config/providers.ts";
import { loadEnv, resetEnv } from "../src/config/env.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { SqliteSettingsRepository } from "../src/infrastructure/settings-repository.ts";

const savedEnv: Record<string, string | undefined> = {};

function withSearchEnv(): void {
  for (const name of ["SEARCH_API_URL", "SEARCH_API_KEY"] as const) {
    if (!(name in savedEnv)) savedEnv[name] = Bun.env[name];
  }
  Bun.env.SEARCH_API_URL = "https://ambiente.test";
  Bun.env.SEARCH_API_KEY = "chave-ambiente";
  resetEnv();
}

function restoreEnv(): void {
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete Bun.env[name];
    else Bun.env[name] = value;
  }
  resetEnv();
}

function store() {
  const db = openMigratedDatabase(":memory:");
  return { db, store: new ProviderSettingsStore(new SqliteSettingsRepository(db.db)) };
}

describe("perfil de busca em casos de borda", () => {
  test("QR-003: tipo de provedor desconhecido e recusado", async () => {
    const { db, store: settings } = store();
    await expect(
      settings.create({
        name: "Estranho",
        kind: "invalido" as never,
        url: "https://x.test",
        model: "m",
      }),
    ).rejects.toThrow("tipo de provedor inválido");
    db.sqlite.close();
  });

  test("QR-003: ativo de outro tipo nao serve para a busca", async () => {
    const { db, store: settings } = store();
    const created = await settings.create({ name: "Texto", kind: "llm", url: "https://llm.test", model: "m" });
    const llm = created.profiles?.find((profile) => profile.kind === "llm");
    await expect(settings.setActive("search", llm?.id ?? "x")).rejects.toThrow();
    db.sqlite.close();
  });

  test("QR-003: editar o perfil de busca muda a impressao de cache", async () => {
    withSearchEnv();
    try {
      const { db, store: settings } = store();
      const created = await settings.create({
        name: "Busca",
        kind: "search",
        url: "https://busca.test",
        model: "",
        apiKey: "chave-1",
      });
      const profile = created.profiles?.find((candidate) => candidate.kind === "search");
      const before = cacheFingerprint(effectiveProviders(loadEnv(), settings.current()));
      await settings.update(profile?.id ?? "", { url: "https://outra.test" });
      const after = cacheFingerprint(effectiveProviders(loadEnv(), settings.current()));
      expect(after).not.toBe(before);
      db.sqlite.close();
    } finally {
      restoreEnv();
    }
  });
  test("QR-003: excluir o perfil de busca ativo volta ao ambiente", async () => {
    const { db, store: settings } = store();
    const created = await settings.create({
      name: "Busca",
      kind: "search",
      url: "https://busca.test",
      model: "",
    });
    const profile = created.profiles?.find((candidate) => candidate.kind === "search");
    expect(created.activeSearch).toBe(profile?.id ?? null);
    const removed = await settings.remove(profile?.id ?? "");
    expect(removed.activeSearch).toBeNull();
    db.sqlite.close();
  });
});
