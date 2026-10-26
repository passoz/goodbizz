/**
 * Pagina de configuracoes com a busca (FR-009): a API aceita perfis do tipo search sem modelo e
 * devolve so a chave mascarada, o Testar sonda o provedor de busca e a pagina mostra a terceira lista.
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Hono } from "hono";

import { loadEnv } from "../src/config/env.ts";
import { buildApiApp } from "../src/infrastructure/http/api.ts";
import { buildUiApp } from "../src/infrastructure/http/ui/routes.tsx";
import { makeHarness, type TestHarness } from "./helpers.ts";

interface CreatedBody {
  profiles: Array<{ id: string; kind: string; apiKey: string; hasKey: boolean }>;
  active: { search: string | null };
}

interface ProbeBody {
  ok: boolean;
}

let harness: TestHarness;
let api: Hono;
let ui: Hono;

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
  ui = buildUiApp({ service: harness.service, sessionSecret: loadEnv().SESSION_SECRET, production: false });
});

afterEach(() => {
  harness.close();
});

describe("tipo search na pagina de configuracoes", () => {
  test("FR-009: cadastro search responde 201 e devolve so a chave mascarada", async () => {
    const response = await jsonRequest(api, "/settings/providers", "POST", {
      name: "Busca Tavily",
      kind: "search",
      url: "https://api.tavily.test",
      apiKey: "tvly-chave-boa-1234",
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as CreatedBody;
    expect(body.profiles).toHaveLength(1);
    expect(body.profiles[0]?.kind).toBe("search");
    expect(body.profiles[0]?.apiKey).not.toContain("boa");
    expect(body.profiles[0]?.hasKey).toBe(true);
    expect(JSON.stringify(body)).not.toContain("tvly-chave-boa-1234");
    expect(body.active.search).toBeString();
  });

  test("FR-009: Testar sonda o provedor de busca sem vazar a chave", async () => {
    const realFetch = globalThis.fetch;
    const seen: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request) => {
      seen.push(String(input));
      return Response.json({ query: "teste", results: [] });
    }) as typeof fetch;
    try {
      const response = await jsonRequest(api, "/settings/test", "POST", {
        kind: "search",
        url: "https://api.tavily.test",
        apiKey: "tvly-chave-sonda",
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as ProbeBody;
      expect(body.ok).toBe(true);
      expect(seen).toHaveLength(1);
      expect(seen[0]).toBe("https://api.tavily.test/search");
      expect(JSON.stringify(body)).not.toContain("tvly-chave-sonda");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("FR-009: a pagina /settings mostra a terceira lista de busca", async () => {
    const body = await (await ui.request("/settings")).text();
    const pickers = body.match(/<form[^>]*data-provider-picker/g) ?? [];
    expect(pickers).toHaveLength(3);
    expect(body).toContain('data-kind="search"');
    expect(body).toContain("Provedor de busca (Tavily)");
  });
});
