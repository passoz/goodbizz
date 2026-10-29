/**
 * Casos do adaptador de busca (QR-002): resposta fora do protocolo, erro interno e 403.
 */
import { afterEach, describe, expect, test } from "bun:test";

import { probeProvider } from "../src/infrastructure/provider-probe.ts";

const realFetch = globalThis.fetch;

function reply(response: () => Response): void {
  globalThis.fetch = (async () => response()) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("adaptador de busca em casos de borda", () => {
  test("QR-002: corpo sem a lista results é recusado como fora do protocolo", async () => {
    reply(() => Response.json({ answer: "sem resultados" }));
    const result = await probeProvider({
      kind: "search",
      url: "https://busca.test",
      model: "",
      apiKey: "chave-de-teste-1",
    });
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("protocolo Tavily");
  });

  test("QR-002: 500 vira a frase de erro interno e 403 a de credencial", async () => {
    reply(() => new Response("<html>bad gateway</html>", { status: 502 }));
    const broken = await probeProvider({
      kind: "search",
      url: "https://busca.test",
      model: "",
      apiKey: "chave-de-teste-1",
    });
    expect(broken.ok).toBe(false);
    expect(broken.status).toBe(502);
    expect(broken.detail).toContain("erro interno");

    reply(() => Response.json({ detail: "forbidden" }, { status: 403 }));
    const denied = await probeProvider({
      kind: "search",
      url: "https://busca.test",
      model: "",
      apiKey: "chave-de-teste-1",
    });
    expect(denied.status).toBe(403);
    expect(denied.detail).toContain("credencial");
    expect(denied.detail).toContain("forbidden");
  });
});
