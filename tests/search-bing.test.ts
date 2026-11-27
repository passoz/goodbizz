/**
 * Busca sem chave pelo RSS do Bing: a URL escolhe o adaptador, o corpo RSS vira resultados com
 * entidades resolvidas e marcação removida, e o "Testar" fala com o provedor de verdade.
 */
import { afterEach, describe, expect, test } from "bun:test";

import { searchProviderNeedsKey } from "../src/config/providers.ts";
import { probeProvider } from "../src/infrastructure/provider-probe.ts";
import { createSearch } from "../src/infrastructure/search.ts";

const realFetch = globalThis.fetch;

function rss(items: string): string {
  return `<?xml version="1.0" encoding="utf-8" ?><rss version="2.0"><channel>${items}</channel></rss>`;
}

function item(title: string, link: string, description: string): string {
  return `<item><title>${title}</title><link>${link}</link><description>${description}</description></item>`;
}

interface Seen {
  url: string;
  method: string;
  headers: Record<string, string>;
}

function fakeFetch(reply: (url: string) => Response): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({
      url,
      method: init?.method ?? "GET",
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
    });
    return reply(url);
  }) as typeof fetch;
  return seen;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("searchProviderNeedsKey", () => {
  test("Bing não exige chave; Tavily e URL inválida exigem", () => {
    expect(searchProviderNeedsKey("https://www.bing.com")).toBe(false);
    expect(searchProviderNeedsKey("https://api.tavily.com")).toBe(true);
    expect(searchProviderNeedsKey("https://bing.com")).toBe(false);
    expect(searchProviderNeedsKey("not a url")).toBe(true);
  });
});

describe("SearchBing", () => {
  test("faz GET no RSS do Bing sem chave e devolve os resultados limpos", async () => {
    const seen = fakeFetch(() =>
      new Response(
        rss(
          item("Oficinas &amp; serviços", "https://a.test/oficinas?x=1&amp;y=2", "<p>Preço médio de R$ 120</p>") +
            item("B", "https://b.test", "Segundo resultado &#39;bom&#39;"),
        ),
      ),
    );
    const results = await createSearch("https://www.bing.com", "", 5, 1, 0).search("oficinas mecânicas");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe("GET");
    expect(seen[0]?.headers["authorization"]).toBeUndefined();
    const target = new URL(seen[0]?.url ?? "");
    expect(target.hostname).toBe("www.bing.com");
    expect(target.pathname).toBe("/search");
    expect(target.searchParams.get("q")).toBe("oficinas mecânicas");
    expect(target.searchParams.get("format")).toBe("rss");
    expect(results).toEqual([
      {
        title: "Oficinas & serviços",
        url: "https://a.test/oficinas?x=1&y=2",
        content: "Preço médio de R$ 120",
      },
      { title: "B", url: "https://b.test", content: "Segundo resultado 'bom'" },
    ]);
  });

  test("página que não é RSS vira erro claro, sem retentar", async () => {
    const seen = fakeFetch(() => new Response("<html>Making sure you're not a bot!</html>"));
    const error = await createSearch("https://www.bing.com", "", 5, 3, 0)
      .search("teste")
      .then(
        () => null,
        (cause: unknown) => cause,
      );
    expect(String((error as Error).message)).toContain("RSS");
    expect(seen).toHaveLength(1);
  });
});

describe("Testar do provedor de busca no Bing", () => {
  test("o Testar usa o RSS e informa a contagem", async () => {
    fakeFetch(() => new Response(rss(item("A", "https://a.test", "texto A"))));
    const result = await probeProvider({
      kind: "search",
      url: "https://www.bing.com",
      model: "",
      apiKey: "",
    });
    expect(result.ok).toBe(true);
    expect(result.detail).toContain("1 resultado");
  });
});
