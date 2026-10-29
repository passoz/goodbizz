/**
 * Evidências no decisor (FR-006): o estado de cada pergunta de `evaluateIdea` traz as evidências da
 * ideia e as do estudo, e o hash delas entra na chave de cache da avaliação.
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
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import type { DeciderClient, LlmClient, SearchClient } from "../src/domain/ports.ts";

const QUIET = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
const IDEAS = [
  { nome: "Alerta de estoque", setor: "estoque", descricao: "Avisa quando a cerveja acaba." },
  { nome: "Rota de entrega", setor: "logistica", descricao: "Monta a rota das entregas do dia." },
];

/** Decisor que repassa ao mock e guarda cada estado recebido. */
function recordingDecider(): { decider: DeciderClient; states: string[] } {
  const inner = new DeciderMock();
  const states: string[] = [];
  return {
    states,
    decider: {
      ask(state, questions) {
        states.push(state);
        return inner.ask(state, questions);
      },
      queryProbes(state, probes) {
        states.push(state);
        return inner.queryProbes(state, probes);
      },
    },
  };
}

function llm(): LlmClient {
  const mock = new LlmMock();
  return {
    generateText(system, user) {
      if (system.includes("PALAVRA-CHAVE: BUSCAS"))
        return Promise.resolve(JSON.stringify(["m1", "m2", "m3", "m4", "m5", "m6"]));
      if (system.includes("PALAVRA-CHAVE: IDEIAS")) return Promise.resolve(JSON.stringify(IDEAS));
      if (system.includes("PALAVRA-CHAVE: EVIDENCIAS")) {
        const url = /URL: (\S+)/.exec(user)?.[1] ?? "";
        const trecho = /CONTEÚDO:\n(.+)/.exec(user)?.[1] ?? "";
        return Promise.resolve(
          JSON.stringify([{ tipo: "mercado", afirmacao: `fato de ${url}`, trecho, url }]),
        );
      }
      return mock.generateText(system, user);
    },
  };
}

/**
 * Só a busca "m1" do estudo e a de concorrente de cada ideia trazem página. Em `falha` a busca de
 * concorrente cai: falha não entra no cache, então a execução seguinte pode trazer evidência nova.
 */
function search(mode: "ok" | "falha"): SearchClient {
  return {
    search(query) {
      if (query.includes("concorrentes") && mode === "falha") return Promise.reject(new Error("fora do ar"));
      const relevant = query === "m1" || query.includes("concorrentes");
      if (!relevant) return Promise.resolve([]);
      return Promise.resolve([
        {
          title: query,
          url: `https://fonte.test/${encodeURIComponent(query)}`,
          content: `Página sobre ${query}.`,
        },
      ]);
    },
  };
}

async function run(cache: StudyCache, version: "ok" | "falha") {
  const { decider, states } = recordingDecider();
  const cfg = {
    ...resolveStudyConfig({ niche: "deposito de bebidas", numIdeas: 2, mock: true }),
    outputDir: mkdtempSync(join(tmpdir(), "goodbizz-decider-evidence-")),
    evaluateOnly: true,
    concurrency: 1,
  };
  const result = await generateStudy(cfg, {
    llm: llm(),
    decider,
    search: search(version),
    cache,
    logger: QUIET,
  });
  return { result, states };
}

describe("evidências no estado do decisor", () => {
  test("FR-006: o estado da ideia traz as evidências dela e as do estudo, nunca as de outra ideia", async () => {
    const handle = openMigratedDatabase(":memory:");
    const { result, states } = await run(new StudyCache(new SqliteCacheStore(handle.db)), "ok");
    handle.sqlite.close();
    const studyEvidence = result.evidences.find((evidence) => evidence.ideia === "");
    const stock = result.evidences.find((evidence) => evidence.ideia === "Alerta de estoque");
    const route = result.evidences.find((evidence) => evidence.ideia === "Rota de entrega");
    expect(studyEvidence && stock && route).toBeTruthy();
    const stockStates = states.filter((state) => state.includes("Ideia: Alerta de estoque"));
    expect(stockStates.length).toBeGreaterThan(0);
    for (const state of stockStates) {
      expect(state).toContain(`[${studyEvidence?.id}]`);
      expect(state).toContain(`[${stock?.id}]`);
      expect(state).toContain(stock?.trecho ?? "?");
      expect(state).not.toContain(`[${route?.id}]`);
    }
  });

  test("FR-006: evidência nova refaz a avaliação e a mesma evidência sai do cache", async () => {
    const handle = openMigratedDatabase(":memory:");
    const cache = new StudyCache(new SqliteCacheStore(handle.db));
    const first = await run(cache, "falha");
    const repeated = await run(cache, "falha");
    const changed = await run(cache, "ok");
    handle.sqlite.close();
    // Duelos do torneio não veem evidências (só nomes e descrições): partida já disputada
    // sai do cache. Só os estados de avaliação contam aqui.
    const evals = (states: string[]) =>
      states.filter((state) => !state.includes("Comparação direta entre duas ideias"));
    expect(evals(first.states).length).toBeGreaterThan(0);
    expect(repeated.states).toHaveLength(0);
    expect(evals(changed.states).length).toBe(evals(first.states).length);
  });
});
