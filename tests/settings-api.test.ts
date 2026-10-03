/**
 * API do catálogo de provedores: CRUD, escolha do ativo e o teste de configuração contra um
 * provedor de verdade (um servidor local que imita OpenAI e System One).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import type { Server } from "bun";

import type { StudyService } from "../src/application/study-service.ts";
import { buildApiApp } from "../src/infrastructure/http/api.ts";
import { makeHarness, type TestHarness } from "./helpers.ts";

let harness: TestHarness;
let provider: Server<undefined>;
let providerBase = "";
/** Modo do provedor de teste: cada um exercita um ramo do veredito. */
type ProviderMode =
  | "openai"
  | "no-models"
  | "server-error"
  | "decider-not-json"
  | "decider-foreign"
  | "chat-auth"
  | "chat-reject"
  | "decider-reject";

let mode: ProviderMode = "openai";

beforeAll(() => {
  provider = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      const authorized = (request.headers.get("authorization") ?? "") === "Bearer chave-boa";
      if (!authorized) {
        return Response.json({ error: { message: "chave recusada" } }, { status: 401 });
      }
      if (url.pathname.endsWith("/systemone")) {
        if (mode === "decider-reject") {
          return Response.json({ error: "modelo desconhecido" }, { status: 400 });
        }
        if (mode === "decider-not-json") return new Response("<html>nada</html>", { status: 200 });
        if (mode === "decider-foreign") return Response.json({ foo: "bar" });
        return Response.json({ answers: { ping: { noul: 0.9 } } });
      }
      if (url.pathname.endsWith("/models")) {
        if (mode === "no-models" || mode === "chat-auth" || mode === "chat-reject") {
          return new Response("nao existe", { status: 404 });
        }
        if (mode === "server-error") {
          return Response.json({ error: { message: "quebrou" } }, { status: 500 });
        }
        return Response.json({ data: [{ id: "modelo-1" }, { id: "modelo-2" }] });
      }
      if (url.pathname.endsWith("/chat/completions")) {
        if (mode === "chat-auth") return new Response("sem chave", { status: 401 });
        if (mode === "chat-reject") {
          return Response.json({ error: { message: "modelo inexistente" } }, { status: 400 });
        }
        return Response.json({ choices: [{ message: { content: "ok" } }] });
      }
      return new Response("rota desconhecida", { status: 404 });
    },
  });
  providerBase = `http://127.0.0.1:${provider.port}/v1`;
});

function api(service: StudyService = harness.service) {
  return buildApiApp({
    service,
    providerStatus: () => ({ llm: false, decider: false, mockByDefault: true }),
  });
}

function jsonRequest(path: string, method: string, body: unknown) {
  return api().request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterAll(async () => {
  await provider.stop(true);
});

beforeEach(() => {
  harness = makeHarness();
});

afterEach(() => {
  harness.close();
});

describe("API do catálogo de provedores", () => {
  test("lista vazia devolve o catálogo, os ativos e o padrão do ambiente", async () => {
    const response = await api().request("/settings");
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      profiles: unknown[];
      active: { llm: string | null; decider: string | null };
      defaults: { llm: { model: string; hasKey: boolean } };
    };
    expect(body.profiles).toEqual([]);
    expect(body.active).toEqual({ llm: null, decider: null });
    expect(body.defaults.llm.model).toBeString();
  });

  test("cria um provedor, deixa ativo e nunca devolve a chave em claro", async () => {
    const response = await jsonRequest("/settings/providers", "POST", {
      name: "Token Harbor",
      kind: "llm",
      url: "https://tokenharbor.ai/v1",
      model: "mimo-v2.6-flash:free",
      apiKey: "chave-boa",
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      profiles: Array<{ id: string; name: string; apiKey: string; hasKey: boolean }>;
      active: { llm: string | null };
    };
    expect(body.profiles).toHaveLength(1);
    expect(body.profiles[0]?.name).toBe("Token Harbor");
    expect(body.profiles[0]?.apiKey).toBe("cha…-boa");
    expect(body.profiles[0]?.hasKey).toBe(true);
    expect(body.active.llm).toBe(body.profiles[0]?.id ?? "");
    expect(JSON.stringify(body)).not.toContain("chave-boa");

    // O catálogo é persistido: uma nova leitura traz o mesmo provedor.
    const listed = (await (await api().request("/settings")).json()) as { profiles: unknown[] };
    expect(listed.profiles).toHaveLength(1);
  });

  test("criar sem nome, URL ou modelo é recusado", async () => {
    const missingName = await jsonRequest("/settings/providers", "POST", {
      name: "",
      kind: "llm",
      url: "https://x.test/v1",
      model: "m",
    });
    expect(missingName.status).toBe(422);
    const missingModel = await jsonRequest("/settings/providers", "POST", {
      name: "n",
      kind: "llm",
      url: "https://x.test/v1",
      model: "",
    });
    expect(missingModel.status).toBe(422);
  });

  test("edita sem chave e mantém a chave anterior", async () => {
    const created = await jsonRequest("/settings/providers", "POST", {
      name: "Um",
      kind: "llm",
      url: "https://um.test/v1",
      model: "m1",
      apiKey: "chave-boa",
    });
    const id = ((await created.json()) as { profiles: Array<{ id: string }> }).profiles[0]?.id ?? "";

    const edited = await jsonRequest(`/settings/providers/${id}`, "PATCH", {
      name: "Um (renomeado)",
      model: "m2",
    });
    expect(edited.status).toBe(200);
    const body = (await edited.json()) as {
      profiles: Array<{ name: string; model: string; hasKey: boolean }>;
    };
    expect(body.profiles[0]?.name).toBe("Um (renomeado)");
    expect(body.profiles[0]?.model).toBe("m2");
    expect(body.profiles[0]?.hasKey).toBe(true);
  });

  test("editar provedor inexistente responde 404", async () => {
    const response = await jsonRequest("/settings/providers/nao-existe", "PATCH", { name: "x" });
    expect(response.status).toBe(404);
  });

  test("escolhe e limpa o ativo, e recusa id de outro tipo", async () => {
    const created = await jsonRequest("/settings/providers", "POST", {
      name: "Um",
      kind: "llm",
      url: "https://um.test/v1",
      model: "m",
    });
    const id = ((await created.json()) as { profiles: Array<{ id: string }> }).profiles[0]?.id ?? "";

    const cleared = await jsonRequest("/settings/active", "PUT", { kind: "llm", id: null });
    expect(cleared.status).toBe(200);
    expect(((await cleared.json()) as { active: { llm: string | null } }).active.llm).toBeNull();

    const wrongKind = await jsonRequest("/settings/active", "PUT", { kind: "decider", id });
    expect(wrongKind.status).toBe(404);

    const invalid = await jsonRequest("/settings/active", "PUT", { kind: "outro", id: null });
    expect(invalid.status).toBe(422);
  });

  test("exclui um provedor e limpa o ativo", async () => {
    const created = await jsonRequest("/settings/providers", "POST", {
      name: "Um",
      kind: "decider",
      url: "https://um.test/v1",
      model: "m",
    });
    const id = ((await created.json()) as { profiles: Array<{ id: string }> }).profiles[0]?.id ?? "";

    const removed = await jsonRequest(`/settings/providers/${id}`, "DELETE", {});
    expect(removed.status).toBe(200);
    const body = (await removed.json()) as { profiles: unknown[]; active: { decider: string | null } };
    expect(body.profiles).toEqual([]);
    expect(body.active.decider).toBeNull();
  });
});

describe("teste de provedor (ping/ready)", () => {
  test("LLM responde ao catálogo de modelos", async () => {
    mode = "openai";
    const response = await jsonRequest("/settings/test", "POST", {
      kind: "llm",
      url: providerBase,
      model: "modelo-1",
      apiKey: "chave-boa",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; status: number | null; detail: string };
    expect(body.ok).toBe(true);
    expect(body.status).toBe(200);
    expect(body.detail).toContain("2 modelo");
  });

  test("testar provedor salvo usa a chave guardada quando a tela devolve o campo vazio", async () => {
    mode = "openai";
    const created = await jsonRequest("/settings/providers", "POST", {
      name: "Salvo",
      kind: "llm",
      url: providerBase,
      model: "modelo-1",
      apiKey: "chave-boa",
    });
    const id = ((await created.json()) as { profiles: Array<{ id: string }> }).profiles[0]?.id ?? "";

    // O editar da UI manda `apiKey` vazio (a tela nunca viu a chave em claro) + o `id`.
    const response = await jsonRequest("/settings/test", "POST", {
      kind: "llm",
      id,
      url: providerBase,
      model: "modelo-1",
      apiKey: "",
    });
    const body = (await response.json()) as { ok: boolean; models?: string[] };
    expect(body.ok).toBe(true);
    // A lista de modelos vem com o veredito: e ela que o modal transforma em dropdown.
    expect(body.models).toEqual(["modelo-1", "modelo-2"]);

    // Sem `id` e sem chave, a mesma URL falha: a chave guardada so entra quando o provedor e nomeado.
    const anonymous = await jsonRequest("/settings/test", "POST", {
      kind: "llm",
      url: providerBase,
      model: "modelo-1",
      apiKey: "",
    });
    expect(((await anonymous.json()) as { ok: boolean }).ok).toBe(false);
  });

  test("editar um provedor aceita o corpo sem kind e recusa kind", async () => {
    const created = await jsonRequest("/settings/providers", "POST", {
      name: "Editavel",
      kind: "llm",
      url: "https://editavel.test/v1",
      model: "m1",
      apiKey: "k",
    });
    const id = ((await created.json()) as { profiles: Array<{ id: string }> }).profiles[0]?.id ?? "";

    const edited = await jsonRequest(`/settings/providers/${id}`, "PATCH", {
      name: "Editavel",
      url: "https://editavel2.test/v1",
      model: "m2",
      apiKey: "",
    });
    expect(edited.status).toBe(200);

    // O tipo e imutavel: o schema estrito continua recusando `kind` no PATCH (a UI nao o envia).
    const withKind = await jsonRequest(`/settings/providers/${id}`, "PATCH", { kind: "llm", model: "m3" });
    expect(withKind.status).toBe(422);
  });

  test("chave recusada não é sucesso", async () => {
    mode = "openai";
    const response = await jsonRequest("/settings/test", "POST", {
      kind: "llm",
      url: providerBase,
      model: "modelo-1",
      apiKey: "chave-errada",
    });
    const body = (await response.json()) as { ok: boolean; status: number | null; detail: string };
    expect(body.ok).toBe(false);
    expect(body.status).toBe(401);
    expect(body.detail).toContain("recusada");
    expect(body.detail).not.toContain("chave-errada");
  });

  test("sem /models cai na geração de 1 token", async () => {
    mode = "no-models";
    const response = await jsonRequest("/settings/test", "POST", {
      kind: "llm",
      url: providerBase,
      model: "modelo-1",
      apiKey: "chave-boa",
    });
    const body = (await response.json()) as { ok: boolean; detail: string };
    expect(body.ok).toBe(true);
    expect(body.detail).toContain("1 token");
  });

  test("decisor responde à pergunta mínima", async () => {
    mode = "openai";
    const response = await jsonRequest("/settings/test", "POST", {
      kind: "decider",
      url: providerBase,
      model: "systemone-latest",
      apiKey: "chave-boa",
    });
    const body = (await response.json()) as { ok: boolean; status: number | null };
    expect(body.ok).toBe(true);
    expect(body.status).toBe(200);
  });

  test("provedor inalcançável falha sem lançar", async () => {
    const response = await jsonRequest("/settings/test", "POST", {
      // Porta fechada: o teste tem de devolver veredito, não estourar.
      kind: "llm",
      url: "http://127.0.0.1:1/v1",
      model: "m",
      apiKey: "",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { ok: boolean; status: number | null; detail: string };
    expect(body.ok).toBe(false);
    expect(body.status).toBeNull();
    expect(body.detail.length).toBeGreaterThan(0);
  });

  test("erro do provedor vira veredito com o status e a mensagem", async () => {
    mode = "server-error";
    const response = await jsonRequest("/settings/test", "POST", {
      kind: "llm",
      url: providerBase,
      model: "modelo-1",
      apiKey: "chave-boa",
    });
    const body = (await response.json()) as { ok: boolean; status: number | null; detail: string };
    expect(body.ok).toBe(false);
    expect(body.status).toBe(500);
    expect(body.detail).toContain("quebrou");
  });

  test("chave recusada na geração de fallback também é falha", async () => {
    mode = "chat-auth";
    const response = await jsonRequest("/settings/test", "POST", {
      kind: "llm",
      url: providerBase,
      model: "modelo-1",
      apiKey: "chave-boa",
    });
    const body = (await response.json()) as { ok: boolean; status: number | null; detail: string };
    expect(body.ok).toBe(false);
    expect(body.status).toBe(401);
    expect(body.detail).toContain("recusada");
  });

  test("geração de fallback recusada traz a mensagem do provedor", async () => {
    mode = "chat-reject";
    const response = await jsonRequest("/settings/test", "POST", {
      kind: "llm",
      url: providerBase,
      model: "modelo-1",
      apiKey: "chave-boa",
    });
    const body = (await response.json()) as { ok: boolean; status: number | null; detail: string };
    expect(body.ok).toBe(false);
    expect(body.status).toBe(400);
    expect(body.detail).toContain("modelo inexistente");
  });

  test("decisor que recusa o pedido não é sucesso", async () => {
    mode = "decider-reject";
    const response = await jsonRequest("/settings/test", "POST", {
      kind: "decider",
      url: providerBase,
      model: "systemone-latest",
      apiKey: "chave-boa",
    });
    const body = (await response.json()) as { ok: boolean; status: number | null; detail: string };
    expect(body.ok).toBe(false);
    expect(body.status).toBe(400);
    expect(body.detail).toContain("recusou o pedido");
  });

  test("decisor que responde algo que não é JSON não é sucesso", async () => {
    mode = "decider-not-json";
    const response = await jsonRequest("/settings/test", "POST", {
      kind: "decider",
      url: providerBase,
      model: "systemone-latest",
      apiKey: "chave-boa",
    });
    const body = (await response.json()) as { ok: boolean; detail: string };
    expect(body.ok).toBe(false);
    expect(body.detail).toContain("não é JSON");
  });

  test("decisor que responde fora do contrato System One não é sucesso", async () => {
    mode = "decider-foreign";
    const response = await jsonRequest("/settings/test", "POST", {
      kind: "decider",
      url: providerBase,
      model: "systemone-latest",
      apiKey: "chave-boa",
    });
    const body = (await response.json()) as { ok: boolean; detail: string };
    expect(body.ok).toBe(false);
    expect(body.detail).toContain("System One");
  });

  test("URL vazia é recusada na borda", async () => {
    const response = await jsonRequest("/settings/test", "POST", { kind: "llm", url: "", model: "m" });
    expect(response.status).toBe(422);
  });
});
