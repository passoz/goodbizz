/**
 * Casos da adição com pesquisa (FR-012): a adição numera as novas evidências em sequência às do
 * estudo e a busca que falha numa ideia nova vira aviso com o nome dela, sem derrubar a adição.
 */
import { describe, expect, test } from "bun:test";

import { StudyCache } from "../src/application/cache.ts";
import { generateAddition } from "../src/application/generate-study.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import type { LlmClient, SearchClient } from "../src/domain/ports.ts";
import type { Evidence, StudyConfig, StudyIdea } from "../src/domain/types.ts";
import { silentLogger } from "./helpers.ts";

const QUIET = silentLogger();

function makeConfig(): StudyConfig {
  return {
    niche: "cafeterias",
    description: "",
    cacheSeed: "adicao-casos",
    providerFingerprint: "",
    setupFee: 1500,
    city: "",
    monthlyTicket: 300,
    numIdeas: 2,
    outputDir: "estudo",
    ideasFile: "",
    evaluateOnly: false,
    painMethod: "choice",
    mock: false,
    mockLlm: false,
    mockDecider: false,
    pdf: false,
    paraphrases: 3,
    concurrency: 8,
    timeout: 60,
    llmBaseUrl: "http://localhost",
    llmModel: "model",
    llmKey: "key",
    deciderUrl: "http://localhost",
    deciderModel: "model",
    deciderKey: "key",
    mockSearch: true,
    searchBaseUrl: "https://api.tavily.com",
    searchApiKey: "",
  };
}

function oldIdea(name: string): StudyIdea {
  return {
    id: `id-${name}`,
    name,
    sector: "atendimento",
    description: "ideia ja existente",
    indicators: {
      fit: 1,
      fitConf: 0.9,
      sale: 1,
      saleConf: 0.9,
      disruption: 1,
      disruptionConf: 0.9,
      pain: "FORTE",
      painProbs: {},
      painConf: 0.9,
      solo: 1,
    },
    business: { wtp: 10, meta30: 5, price: 300, priceConf: 0.9 },
    algorithm: {
      label: "FORTE",
      painScore: 1,
      internalScore: 1,
      margin: 1,
      deviation: 0,
      probes: {},
      byParaphrase: {},
    },
    index: 1,
    tier: "A",
  };
}

function knownEvidence(id: string): Evidence {
  return {
    id,
    tipo: "mercado",
    afirmacao: `achado antigo ${id}`,
    trecho: "trecho antigo verificado",
    url: `https://antiga.test/${id}`,
    valor: null,
    unidade: "",
    ideia: "",
  };
}

describe("adição com pesquisa em casos de borda", () => {
  test("FR-012: as novas evidências continuam a numeração das do estudo e o decisor vê a lista somada", async () => {
    const known = [knownEvidence("E1"), knownEvidence("E2")];
    const deciderStates: string[] = [];
    const llm: LlmClient = {
      async generateText(system: string, user: string): Promise<string> {
        if (system.includes("PALAVRA-CHAVE: EVIDENCIAS")) {
          const url = /URL: (\S+)/.exec(user)?.[1] ?? "";
          return JSON.stringify([
            {
              tipo: "concorrente",
              afirmacao: "existe concorrente",
              trecho: "Concorrente vende por R$ 150.",
              url,
            },
          ]);
        }
        if (user.includes("Gere exatamente")) {
          return JSON.stringify([
            { name: "Ideia Bossa", sector: "atendimento", description: "resolve o que ja existe" },
            { name: "Ideia Breve", sector: "agenda", description: "agenda o que ja existe" },
          ]);
        }
        return "Plano da ideia nova com [E3] e numero 1.2 medido.";
      },
    };
    const queries: string[] = [];
    const search: SearchClient = {
      search(query: string) {
        queries.push(query);
        return Promise.resolve([
          {
            title: query,
            url: `https://borda.test/${encodeURIComponent(query)}`,
            content: "Concorrente vende por R$ 150.",
          },
        ]);
      },
    };
    const decider = new DeciderMock();
    const innerAsk = decider.ask.bind(decider);
    decider.ask = async (state, questions) => {
      deciderStates.push(state);
      return innerAsk(state, questions);
    };
    const handle = openMigratedDatabase(":memory:");
    const result = await generateAddition(
      makeConfig(),
      { brief: "BRIEF JA GRAVADO", existing: [oldIdea("Ideia Antiga")], evidences: known },
      2,
      "pedido-borda",
      { llm, decider, search, cache: new StudyCache(new SqliteCacheStore(handle.db)), logger: QUIET },
    );
    handle.sqlite.close();

    // Duas buscas por ideia nova, nenhuma pela antiga; ids continuam de E3 em diante.
    expect(queries.filter((query) => query.includes("Ideia Bossa"))).toHaveLength(2);
    expect(queries.filter((query) => query.includes("Ideia Breve"))).toHaveLength(2);
    expect(queries.some((query) => query.includes("Ideia Antiga"))).toBe(false);
    expect(result.evidences.slice(0, known.length)).toEqual(known);
    expect(result.evidences.slice(known.length).map((evidence) => evidence.id)).toEqual([
      "E3",
      "E4",
      "E5",
      "E6",
    ]);
    // O decisor de cada ideia nova recebe as evidências do estudo mais as da ideia.
    for (const name of ["Ideia Bossa", "Ideia Breve"]) {
      const own = deciderStates.filter((state) => state.includes(name));
      expect(own.length).toBeGreaterThan(0);
      for (const state of own) {
        expect(state).toContain("[E1]");
        expect(state).toContain("[E2]");
      }
    }
  });

  test("FR-012: a busca que falha numa ideia nova vira aviso com o nome dela", async () => {
    const llm: LlmClient = {
      async generateText(system: string, user: string): Promise<string> {
        if (system.includes("PALAVRA-CHAVE: EVIDENCIAS")) {
          return JSON.stringify([
            {
              tipo: "preco",
              afirmacao: "preço",
              trecho: "Plano de assinatura a R$ 49.",
              url: "https://preco.test/nova",
            },
          ]);
        }
        if (user.includes("Gere exatamente")) {
          return JSON.stringify([{ name: "Ideia Firme", sector: "vendas", description: "cobra o fiado" }]);
        }
        return "Plano da ideia nova com numero 1.2 medido.";
      },
    };
    const search: SearchClient = {
      search(query: string) {
        if (query.includes("concorrentes")) return Promise.reject(new Error("provedor de busca fora do ar"));
        return Promise.resolve([
          { title: "Preco", url: "https://preco.test/nova", content: "Plano de assinatura a R$ 49." },
        ]);
      },
    };
    const handle = openMigratedDatabase(":memory:");
    const result = await generateAddition(
      makeConfig(),
      { brief: "BRIEF JA GRAVADO", existing: [oldIdea("Ideia Antiga")], evidences: [] },
      1,
      "pedido-falha",
      {
        llm,
        decider: new DeciderMock(),
        search,
        cache: new StudyCache(new SqliteCacheStore(handle.db)),
        logger: QUIET,
      },
    );
    handle.sqlite.close();

    expect(result.evaluations.map((evaluation) => evaluation.name)).toContain("Ideia Firme");
    expect(result.evidences.map((evidence) => evidence.id)).toEqual(["E1"]);
    expect(result.issues.some((issue) => issue.includes("Ideia Firme") && issue.includes("fora do ar"))).toBe(
      true,
    );
  });
});
