/**
 * Catálogo de provedores: migração do formato antigo, CRUD e a regra da chave vazia no update.
 */
import { describe, expect, test, beforeEach } from "bun:test";

import { ProviderSettingsStore } from "../src/application/settings.ts";
import { openMigratedDatabase, type DatabaseHandle } from "../src/infrastructure/db.ts";
import { SqliteSettingsRepository } from "../src/infrastructure/settings-repository.ts";

let db: DatabaseHandle;

beforeEach(() => {
  db = openMigratedDatabase(":memory:");
});

function store(): ProviderSettingsStore {
  return new ProviderSettingsStore(new SqliteSettingsRepository(db.db));
}

/** Grava o formato antigo direto na linha singleton, como uma instalação anterior faria. */
function seedLegacy(data: Record<string, unknown>): void {
  db.sqlite.query("INSERT INTO settings (id, data) VALUES (1, ?)").run(JSON.stringify(data));
}

describe("migração do formato antigo", () => {
  test("campos soltos viram perfis Padrão ativos", async () => {
    seedLegacy({
      llmBaseUrl: "https://tokenharbor.ai/v1",
      llmModel: "mimo-v2.6-flash:free",
      llmApiKey: "sk-antiga-1234",
    });

    const settings = await store().load();
    expect(settings.profiles).toHaveLength(1);
    const llm = settings.profiles?.[0];
    expect(llm?.kind).toBe("llm");
    expect(llm?.name).toBe("Padrão");
    expect(llm?.url).toBe("https://tokenharbor.ai/v1");
    expect(llm?.model).toBe("mimo-v2.6-flash:free");
    expect(llm?.apiKey).toBe("sk-antiga-1234");
    expect(settings.activeLlm).toBe(llm?.id);
    expect(settings.activeDecider).toBeNull();
  });

  test("formato antigo sem nada salvo não cria perfil", async () => {
    seedLegacy({});
    const settings = await store().load();
    expect(settings.profiles).toEqual([]);
    expect(settings.activeLlm).toBeNull();
  });

  test("catálogo novo é lido como está", async () => {
    db.sqlite.query("INSERT INTO settings (id, data) VALUES (1, ?)").run(
      JSON.stringify({
        profiles: [{ id: "a", name: "Um", kind: "llm", url: "u", model: "m", apiKey: "k" }],
        activeLlm: "a",
        activeDecider: null,
      }),
    );
    const settings = await store().load();
    expect(settings.profiles?.[0]?.name).toBe("Um");
    expect(settings.activeLlm).toBe("a");
  });
});

describe("catálogo de provedores", () => {
  test("criar deixa o provedor ativo no tipo dele", async () => {
    const settings = await store().load();
    const created = await store().create({
      name: "DeepSeek",
      kind: "llm",
      url: "https://api.deepseek.com/v1",
      model: "deepseek-flash",
      apiKey: "sk-x",
    });
    expect(created.profiles).toHaveLength(1);
    const id = created.profiles?.[0]?.id ?? "";
    expect(id.length).toBeGreaterThan(0);
    expect(created.activeLlm).toBe(id);
    // O decisor não foi tocado.
    expect(created.activeDecider).toBeNull();
    expect(settings.profiles).toHaveLength(0);
  });

  test("editar sem chave mantém a chave anterior", async () => {
    const store1 = store();
    await store1.load();
    const created = await store1.create({
      name: "Um",
      kind: "llm",
      url: "https://um.test/v1",
      model: "m1",
      apiKey: "sk-segredo",
    });
    const id = created.profiles?.[0]?.id ?? "";

    const updated = await store1.update(id, { name: "Um (renomeado)", model: "m2", apiKey: "" });
    const profile = updated.profiles?.[0];
    expect(profile?.name).toBe("Um (renomeado)");
    expect(profile?.model).toBe("m2");
    expect(profile?.apiKey).toBe("sk-segredo");
  });

  test("editar com chave troca a chave", async () => {
    const store1 = store();
    await store1.load();
    const created = await store1.create({ name: "Um", kind: "llm", url: "u", model: "m", apiKey: "antiga" });
    const id = created.profiles?.[0]?.id ?? "";
    const updated = await store1.update(id, { apiKey: "nova" });
    expect(updated.profiles?.[0]?.apiKey).toBe("nova");
  });

  test("excluir limpa o ativo quando era ele", async () => {
    const store1 = store();
    await store1.load();
    const created = await store1.create({ name: "Um", kind: "decider", url: "u", model: "m" });
    const id = created.profiles?.[0]?.id ?? "";
    expect(created.activeDecider).toBe(id);

    const removed = await store1.remove(id);
    expect(removed.profiles).toHaveLength(0);
    expect(removed.activeDecider).toBeNull();
  });

  test("escolher o ativo valida o tipo do perfil", async () => {
    const store1 = store();
    await store1.load();
    const created = await store1.create({ name: "Um", kind: "llm", url: "u", model: "m" });
    const id = created.profiles?.[0]?.id ?? "";

    const active = await store1.setActive("llm", id);
    expect(active.activeLlm).toBe(id);
    // Perfil de LLM não pode ser o decisor ativo.
    await expect(store1.setActive("decider", id)).rejects.toThrow();

    const cleared = await store1.setActive("llm", null);
    expect(cleared.activeLlm).toBeNull();
  });

  test("nome, URL e modelo são obrigatórios", async () => {
    const store1 = store();
    await store1.load();
    await expect(store1.create({ name: "  ", kind: "llm", url: "u", model: "m" })).rejects.toThrow();
    await expect(store1.create({ name: "n", kind: "llm", url: " ", model: "m" })).rejects.toThrow();
    await expect(store1.create({ name: "n", kind: "llm", url: "u", model: "" })).rejects.toThrow();
  });

  test("editar provedor inexistente responde não encontrado", async () => {
    const store1 = store();
    await store1.load();
    await expect(store1.update("nao-existe", { name: "x" })).rejects.toThrow();
  });

  test("o catálogo sobrevive a um novo processo (persistência)", async () => {
    const store1 = store();
    await store1.load();
    await store1.create({ name: "Persistido", kind: "llm", url: "u", model: "m", apiKey: "k" });

    const reloaded = await store().load();
    expect(reloaded.profiles?.[0]?.name).toBe("Persistido");
    expect(reloaded.activeLlm).toBe(reloaded.profiles?.[0]?.id);
  });
});
