/**
 * Casos do tipo search na API (FR-009): o tipo search cadastra sem modelo (o llm exige), o tipo
 * desconhecido e recusado e a listagem traz a chave mascarada com o ativo de busca. RED: sem o
 * tipo search no schema da API o cadastro responde 422 e a assercao do 201 falha.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Hono } from "hono";

import { buildApiApp } from "../src/infrastructure/http/api.ts";
import { makeHarness, type TestHarness } from "./helpers.ts";

interface SettingsBody {
  profiles: Array<{ id: string; apiKey: string; hasKey: boolean }>;
  active: { search: string | null };
}

let harness: TestHarness;
let api: Hono;

function jsonRequest(target: Hono, path: string, method: string, body: unknown): Promise<Response> {
  return target.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as Promise<Response>;
}

beforeEach(() => {
  harness = makeHarness();
  api = buildApiApp({
    service: harness.service,
    providerStatus: () => ({ llm: false, decider: false, mockByDefault: true }),
  });
});

afterEach(() => {
  harness.close();
});

describe("tipo search na API em casos de borda", () => {
  test("FR-009: search sem modelo cadastra e llm sem modelo e recusado", async () => {
    const search = await jsonRequest(api, "/settings/providers", "POST", {
      name: "Busca",
      kind: "search",
      url: "https://api.tavily.test",
    });
    expect(search.status).toBe(201);

    const llm = await jsonRequest(api, "/settings/providers", "POST", {
      name: "Texto",
      kind: "llm",
      url: "https://llm.test/v1",
      model: "",
    });
    expect(llm.status).toBe(422);
  });

  test("FR-009: tipo desconhecido e recusado e ativo de outro tipo nao serve", async () => {
    const invalid = await jsonRequest(api, "/settings/providers", "POST", {
      name: "Estranho",
      kind: "outro",
      url: "https://x.test",
      model: "m",
    });
    expect(invalid.status).toBe(422);

    const created = await jsonRequest(api, "/settings/providers", "POST", {
      name: "Texto",
      kind: "llm",
      url: "https://llm.test/v1",
      model: "m",
    });
    const id = ((await created.json()) as { profiles: Array<{ id: string }> }).profiles[0]?.id ?? "";
    const wrongKind = await jsonRequest(api, "/settings/active", "PUT", { kind: "search", id });
    expect(wrongKind.status).toBe(404);

    const invalidKind = await jsonRequest(api, "/settings/active", "PUT", { kind: "outro", id: null });
    expect(invalidKind.status).toBe(422);
  });

  test("FR-009: listagem traz a chave mascarada e o ativo de busca", async () => {
    const created = await jsonRequest(api, "/settings/providers", "POST", {
      name: "Busca Tavily",
      kind: "search",
      url: "https://api.tavily.test",
      apiKey: "tvly-chave-boa-1234",
    });
    const createdBody = (await created.json()) as SettingsBody;
    const listed = (await (await api.request("/settings")).json()) as SettingsBody;
    expect(listed.profiles).toHaveLength(1);
    expect(listed.profiles[0]?.apiKey).toBeString();
    expect(JSON.stringify(listed)).not.toContain("tvly-chave-boa-1234");
    expect(listed.active.search).toBe(createdBody.active.search);
  });
});
