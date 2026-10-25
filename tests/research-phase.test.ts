/**
 * Fase de pesquisa (FR-002): antes do brief o pipeline pede as buscas ao LLM, consulta o provedor
 * de busca e extrai evidências. O LLM e a busca aqui são falsos e registram a ordem das chamadas.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StudyCache } from "../src/application/cache.ts";
import { generateStudy } from "../src/application/generate-study.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import type { LlmClient, SearchClient } from "../src/domain/ports.ts";
import type { SearchResult } from "../src/domain/types.ts";

const QUIET = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

/** Linha do tempo compartilhada: a ordem entre busca e brief é o que o teste confere. */
type Event = { kind: "search"; query: string } | { kind: "llm"; system: string; user: string };

function fakes(queryCount: number) {
  const events: Event[] = [];
  const llm: LlmClient = {
    generateText(system, user) {
      events.push({ kind: "llm", system, user });
      if (system.includes("PALAVRA-CHAVE: BUSCAS")) {
        return Promise.resolve(
          JSON.stringify(Array.from({ length: queryCount }, (_unused, index) => `busca ${index + 1}`)),
        );
      }
      if (system.includes("PALAVRA-CHAVE: EVIDENCIAS")) {
        const url = /URL: (\S+)/.exec(user)?.[1] ?? "";
        return Promise.resolve(
          JSON.stringify([
            {
              tipo: "preco",
              afirmacao: "O sistema concorrente cobra mensalidade",
              trecho: "O plano básico custa R$ 189 por mês.",
              url,
              valor: 189,
              unidade: "R$/mês",
            },
          ]),
        );
      }
      if (system.includes("PALAVRA-CHAVE: IDEIAS")) {
        return Promise.resolve(
          JSON.stringify([
            { nome: "Alerta de estoque", setor: "estoque", descricao: "Avisa quando o estoque acaba." },
            { nome: "Pedido pelo WhatsApp", setor: "vendas", descricao: "Recebe pedidos no WhatsApp." },
          ]),
        );
      }
      if (system.includes("PALAVRA-CHAVE: BRIEF")) return Promise.resolve("# Brief\n\n- comprador: dono");
      return Promise.resolve("# Plano\n\n## 1. Resumo executivo\n\ntexto");
    },
  };
  const search: SearchClient = {
    search(query) {
      events.push({ kind: "search", query });
      const slug = query.replace(/\W+/g, "-");
      const results: SearchResult[] = [
        {
          title: `Resultado de ${query}`,
          url: `https://exemplo.test/${slug}`,
          content: `Página sobre ${query}. O plano básico custa R$ 189 por mês. Atende depósitos.`,
        },
      ];
      return Promise.resolve(results);
    },
  };
  return { events, llm, search };
}

function config() {
  return {
    ...resolveStudyConfig({ niche: "deposito de bebidas", city: "Cabo Frio", numIdeas: 2, mock: true }),
    outputDir: mkdtempSync(join(tmpdir(), "goodbizz-research-")),
    concurrency: 1,
  };
}

async function run(queryCount: number) {
  const handle = openMigratedDatabase(":memory:");
  const { events, llm, search } = fakes(queryCount);
  const steps: string[] = [];
  const result = await generateStudy(config(), {
    llm,
    decider: new DeciderMock(),
    search,
    cache: new StudyCache(new SqliteCacheStore(handle.db)),
    logger: QUIET,
    onProgress: (step) => steps.push(step),
  });
  handle.sqlite.close();
  return { events, steps, result };
}

describe("fase de pesquisa", () => {
  test("FR-002: as buscas acontecem antes do brief e ficam entre 6 e 10", async () => {
    const { events } = await run(12);
    const briefAt = events.findIndex((event) => event.kind === "llm" && event.system.includes("PALAVRA-CHAVE: BRIEF"));
    const beforeBrief = events.slice(0, briefAt).filter((event) => event.kind === "search");
    expect(briefAt).toBeGreaterThan(0);
    expect(beforeBrief.length).toBe(10);
  });

  test("FR-002: menos de 6 buscas do LLM são completadas até 6", async () => {
    const { events, result } = await run(3);
    const briefAt = events.findIndex((event) => event.kind === "llm" && event.system.includes("PALAVRA-CHAVE: BRIEF"));
    const queries = events
      .slice(0, briefAt)
      .filter((event): event is Extract<Event, { kind: "search" }> => event.kind === "search")
      .map((event) => event.query);
    expect(queries).toHaveLength(6);
    expect(new Set(queries).size).toBe(6);
    expect(queries.slice(0, 3)).toEqual(["busca 1", "busca 2", "busca 3"]);
    expect(result.issues.some((issue) => issue.includes("3 buscas"))).toBe(true);
  });

  test("FR-002: o progresso abre com a fase de pesquisa e as evidências voltam no resultado", async () => {
    const { steps, result } = await run(6);
    expect(steps[0]).toStartWith("[1/7] Pesquisando a web");
    expect(steps.some((step) => step.startsWith("[2/7]") && step.includes("brief"))).toBe(true);
    const study = result.evidences.filter((evidence) => evidence.ideia === "");
    expect(study.length).toBeGreaterThanOrEqual(6);
    expect(study[0]).toMatchObject({
      id: "E1",
      tipo: "preco",
      trecho: "O plano básico custa R$ 189 por mês.",
      url: "https://exemplo.test/busca-1",
      valor: 189,
      unidade: "R$/mês",
      ideia: "",
    });
    expect(study.map((evidence) => evidence.id)).toEqual(study.map((_evidence, index) => `E${index + 1}`));
  });
});
