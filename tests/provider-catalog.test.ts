/**
 * Catálogo de modelos do decisor: o endpoint System One não tem GET, então a sonda usa a base
 * informada no preset (`catalogUrl`) ou a URL sem `/systemone` e devolve a lista para o dropdown.
 */
import { afterEach, describe, expect, test } from "bun:test";

import { probeProvider } from "../src/infrastructure/provider-probe.ts";

const realFetch = globalThis.fetch;

interface Seen {
  url: string;
  method: string;
}

function fakeFetch(): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({ url, method: init?.method ?? "GET" });
    if (url.endsWith("/systemone/v1/systemone")) {
      return Response.json({ answers: { ping: { type: "noul", answer: "sim" } } });
    }
    if (url.endsWith("/openai/v1/models")) {
      return Response.json({ data: [{ id: "jev-1.14" }, { id: "gemini-decision-1" }] });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return seen;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("catálogo do decisor", () => {
  test("usa o catalogUrl do preset quando o System One não expõe /models", async () => {
    const seen = fakeFetch();
    const result = await probeProvider({
      kind: "decider",
      url: "https://opencode.ai/inference/go/systemone/v1/systemone",
      model: "jev-1.14",
      apiKey: "chave",
      catalogUrl: "https://opencode.ai/inference/go/openai/v1",
    });
    expect(result.ok).toBe(true);
    expect(result.models).toEqual(["jev-1.14", "gemini-decision-1"]);
    expect(seen.some((request) => request.method === "POST")).toBe(true);
    expect(seen.map((request) => request.url)).toContain(
      "https://opencode.ai/inference/go/openai/v1/models",
    );
  });

  test("sem catalogUrl, tenta a própria URL", async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/v1/systemone")) {
        return Response.json({ answers: { ping: { type: "noul", answer: "sim" } } });
      }
      if (url.endsWith("/v1/models")) {
        return Response.json({ data: [{ id: "jev-latest" }] });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const result = await probeProvider({
      kind: "decider",
      url: "https://api.typesafe.ai/v1",
      model: "jev-latest",
      apiKey: "chave",
    });
    expect(result.ok).toBe(true);
    expect(result.models).toEqual(["jev-latest"]);
  });
});
