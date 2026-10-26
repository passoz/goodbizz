/**
 * Adição de ideias com pesquisa (FR-012): a adição reaproveita as evidências do estudo no prompt,
 * pesquisa só as ideias novas (duas buscas por ideia nova) e devolve a lista somada, que o serviço
 * persiste no estudo.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StudyCache } from "../src/application/cache.ts";
import { generateAddition } from "../src/application/generate-study.ts";
import { StudyService } from "../src/application/study-service.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SearchMock } from "../src/infrastructure/search-mock.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import type { SearchClient } from "../src/domain/ports.ts";
import type { Evidence, Idea, StudyConfig, StudyIdea } from "../src/domain/types.ts";
import { silentLogger, tempDir } from "./helpers.ts";

const QUIET = silentLogger();

function makeConfig(overrides: Partial<StudyConfig> = {}): StudyConfig {
  return {
    niche: "cafeterias",
    description: "",
    cacheSeed: "adicao",
    providerFingerprint: "",
    setupFee: 1500,
    city: "",
    monthlyTicket: 300,
    numIdeas: 3,
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
    ...overrides,
  };
}

function oldIdea(name: string, id: string): StudyIdea {
  return {
    id,
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

const FRESH: Idea[] = [
  { name: "Ideia Nova 1", sector: "atendimento", description: "resolve o que ja existe" },
  { name: "Ideia Nova 2", sector: "agenda", description: "agenda o que ja existe" },
];

describe("adição com pesquisa", () => {
  test("FR-012: a adição pesquisa só as ideias novas e preserva as evidências do estudo", async () => {
    const known = [knownEvidence("E1"), knownEvidence("E2")];
    const prompts: string[] = [];
    const llm = {
      async generateText(system: string, user: string): Promise<string> {
        prompts.push(`${system}\n${user}`);
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
        if (user.includes("Gere exatamente")) return JSON.stringify(FRESH);
        return "Plano da ideia nova com [E1] e numero 1.2 medido.";
      },
    };
    const queries: string[] = [];
    const search: SearchClient = {
      search(query: string) {
        queries.push(query);
        return Promise.resolve([
          {
            title: query,
            url: `https://adicao.test/${encodeURIComponent(query)}`,
            content: "Concorrente vende por R$ 150.",
          },
        ]);
      },
    };
    const handle = openMigratedDatabase(":memory:");
    const result = await generateAddition(
      makeConfig(),
      { brief: "BRIEF JA GRAVADO", existing: [oldIdea("Ideia Antiga", "id-antiga")], evidences: known },
      2,
      "pedido-1",
      {
        llm,
        decider: new DeciderMock(),
        search,
        cache: new StudyCache(new SqliteCacheStore(handle.db)),
        logger: QUIET,
      },
    );
    handle.sqlite.close();

    // Só as novas: duas buscas por ideia nova e nenhuma com o nome da antiga.
    for (const idea of FRESH) {
      const own = queries.filter((query) => query.includes(idea.name));
      expect(own).toHaveLength(2);
      expect(own.some((query) => query.includes("concorrentes"))).toBe(true);
      expect(own.some((query) => query.includes("preço"))).toBe(true);
    }
    expect(queries.some((query) => query.includes("Ideia Antiga"))).toBe(false);

    // As do estudo ficam na frente, com os mesmos ids; as novas continuam a numeração.
    expect(result.evidences.slice(0, known.length)).toEqual(known);
    const fresh = result.evidences.slice(known.length);
    expect(fresh).toHaveLength(4);
    expect(fresh.map((evidence) => evidence.id)).toEqual(["E3", "E4", "E5", "E6"]);
    for (const evidence of fresh) {
      expect(FRESH.map((idea) => idea.name)).toContain(evidence.ideia);
    }

    // O prompt das ideias leva as evidências do estudo e o documento cita a lista somada.
    const ideasPrompt = prompts.find((prompt) => prompt.includes("Gere exatamente")) ?? "";
    expect(ideasPrompt).toContain("[E1]");
    expect(ideasPrompt).toContain("[E2]");
    const docPrompt = prompts.find((prompt) => prompt.includes("Escreva o documento")) ?? "";
    expect(docPrompt).toContain("[E3]");

    // O dados.json do lote carrega a lista somada.
    const dados = JSON.parse(String(result.files.find((file) => file.path === "dados.json")?.content));
    expect(dados.evidencias).toEqual(result.evidences);
  });

  test("FR-012: o serviço grava a lista somada na adição", async () => {
    const db = openMigratedDatabase(":memory:");
    const inner = new SearchMock();
    const queries: string[] = [];
    const search: SearchClient = {
      search(query: string) {
        queries.push(query);
        return inner.search(query);
      },
      usage: () => inner.usage(),
    };
    const svc = new StudyService({
      repo: new SqliteStudyRepository(db.db),
      cache: new StudyCache(new SqliteCacheStore(db.db)),
      llm: new LlmMock(),
      decider: new DeciderMock(),
      search,
      logger: QUIET,
      artifactsRoot: mkdtempSync(join(tmpdir(), "goodbizz-addition-")),
    } as ConstructorParameters<typeof StudyService>[0]);
    try {
      const created = await svc.create(resolveStudyConfig({ niche: "cafeterias", numIdeas: 2, mock: true }));
      await svc.run(created.id);
      const before = await svc.get(created.id);
      expect(before.evidences.length).toBeGreaterThan(0);
      const callsBefore = queries.length;

      const after = await svc.addIdeas(created.id, 1);

      const added = queries.slice(callsBefore);
      expect(added.length).toBeGreaterThan(0);
      const freshNames = after.evaluations.filter(
        (idea) => !before.evaluations.some((old) => old.id === idea.id),
      );
      expect(freshNames).toHaveLength(1);
      const freshName = freshNames[0]?.name ?? "";
      for (const query of added) expect(query).toContain(freshName);
      expect(added.some((query) => before.evaluations.some((old) => query.includes(old.name)))).toBe(false);

      expect(after.evidences.length).toBeGreaterThan(before.evidences.length);
      expect(after.evidences.slice(0, before.evidences.length)).toEqual(before.evidences);
      expect(after.evidences.map((evidence) => evidence.id)).toEqual(
        after.evidences.map((_evidence, index) => `E${index + 1}`),
      );
      for (const evidence of after.evidences.slice(before.evidences.length)) {
        expect(evidence.ideia).toBe(freshName);
      }
      expect((await svc.get(created.id)).evidences).toEqual(after.evidences);
      void tempDir;
    } finally {
      db.sqlite.close();
    }
  });
});
