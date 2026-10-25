/**
 * Casos da busca simulada (QR-001): buscas distintas devolvem páginas distintas, o
 * conteúdo cita a busca e a URL é estável, e o modo real exige busca sem mock.
 */
import { describe, expect, test } from "bun:test";

let SearchMock: new () => { search(query: string): Promise<Array<{ title: string; url: string; content: string }>>; usage(): { calls: number } };
try {
  SearchMock = (await import("../src/infrastructure/search-mock.ts")).SearchMock;
} catch {
  SearchMock = class {
    search(): Promise<never[]> {
      throw new Error("QR-001: busca simulada ausente (RED: SearchMock não implementado)");
    }
    usage() {
      return { calls: 0 };
    }
  } as unknown as typeof SearchMock;
}

describe("casos da busca simulada", () => {
  test("QR-001: buscas distintas devolvem URLs distintas com conteúdo da busca", async () => {
    const mock = new SearchMock();
    const price = await mock.search("preço de sistema para padaria");
    const rival = await mock.search("concorrentes de automação para padaria");
    expect(price.length).toBeGreaterThan(0);
    expect(rival.length).toBeGreaterThan(0);
    const priceUrls = new Set(price.map((result) => result.url));
    const rivalUrls = new Set(rival.map((result) => result.url));
    const overlap = [...priceUrls].filter((url) => rivalUrls.has(url));
    expect(overlap).toHaveLength(0);
    for (const result of price) expect(result.content).toContain("padaria");
  });

  test("QR-001: a mesma busca após outras buscas repete as URLs", async () => {
    const mock = new SearchMock();
    const first = await mock.search("custos e perdas na operação de mercado");
    await mock.search("outra busca qualquer");
    const again = await mock.search("custos e perdas na operação de mercado");
    expect(again.map((result) => result.url)).toEqual(first.map((result) => result.url));
  });
});
