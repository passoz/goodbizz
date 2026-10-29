/**
 * Adaptador de busca no protocolo Tavily, visto pelo "Testar" do tipo search (QR-002): POST
 * `{url}/search` com Bearer e corpo `{query, max_results: 5, search_depth: "basic"}`; recusa de
 * credencial, limite de uso e rede viram frases humanas com o detalhe cru; a chave nunca volta.
 */
import { afterEach, describe, expect, test } from "bun:test";

import { probeProvider } from "../src/infrastructure/provider-probe.ts";

const KEY = "tvly-dev-SEGREDO1234567890";
const realFetch = globalThis.fetch;

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/** Troca o fetch global por um que grava a requisição e responde com `reply`. */
function fakeFetch(reply: () => Response | Promise<Response>): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({
      url: String(input),
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return reply();
  }) as typeof fetch;
  return seen;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("adaptador de busca Tavily", () => {
  test("QR-002: o Testar faz POST /search no protocolo Tavily e não devolve a chave", async () => {
    const seen = fakeFetch(() =>
      Response.json({
        query: "teste",
        results: [
          { title: "A", url: "https://a.test", content: "conteúdo A", score: 0.9 },
          { title: "B", url: "https://b.test", content: "conteúdo B", score: 0.8 },
        ],
      }),
    );
    const result = await probeProvider({
      kind: "search",
      url: "https://api.tavily.test/",
      model: "",
      apiKey: KEY,
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://api.tavily.test/search");
    expect(seen[0]?.method).toBe("POST");
    expect(seen[0]?.headers["authorization"]).toBe(`Bearer ${KEY}`);
    expect(seen[0]?.body).toMatchObject({ max_results: 5, search_depth: "basic" });
    const body = seen[0]?.body;
    expect(
      body !== null && typeof body === "object" && "query" in body && typeof body.query === "string",
    ).toBe(true);
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("2 resultado");
    expect(JSON.stringify(result)).not.toContain("SEGREDO");
  });

  test("QR-002: 401 vira a frase da credencial de busca com o detalhe cru e sem a chave", async () => {
    fakeFetch(() =>
      Response.json({ detail: { error: `Unauthorized: invalid API key ${KEY}` } }, { status: 401 }),
    );
    const result = await probeProvider({
      kind: "search",
      url: "https://api.tavily.test",
      model: "",
      apiKey: KEY,
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.detail).toContain("credencial");
    expect(result.detail).toContain("SEARCH_API_KEY");
    expect(result.detail).toContain("(detalhe:");
    expect(result.detail).toContain("Unauthorized");
    expect(result.detail).not.toContain("SEGREDO");
  });

  test("QR-002: 429 vira a frase de limite de uso e rede vira a frase de rede", async () => {
    fakeFetch(() => Response.json({ detail: { error: "rate limit exceeded" } }, { status: 429 }));
    const limited = await probeProvider({
      kind: "search",
      url: "https://api.tavily.test",
      model: "",
      apiKey: KEY,
    });
    expect(limited.ok).toBe(false);
    expect(limited.detail).toContain("limite de uso");
    expect(limited.detail).toContain("rate limit exceeded");

    fakeFetch(() => Promise.reject(new TypeError("fetch failed: getaddrinfo ENOTFOUND api.tavily.test")));
    const offline = await probeProvider({
      kind: "search",
      url: "https://api.tavily.test",
      model: "",
      apiKey: KEY,
    });
    expect(offline.ok).toBe(false);
    expect(offline.status).toBeNull();
    expect(offline.detail).toContain("rede ou DNS");
    expect(offline.detail).toContain("ENOTFOUND");
  });
});
