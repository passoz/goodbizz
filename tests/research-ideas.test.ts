/**
 * Pesquisa por ideia (FR-005): cada ideia ganha uma busca de concorrente direto e uma de preço da
 * solução, e as evidências dessas buscas guardam o nome da ideia.
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
import type { LlmClient, SearchClient } from "../src/domain/ports.ts";

const QUIET = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
const IDEAS = [
  { nome: "Alerta de estoque", setor: "estoque", descricao: "Avisa o dono quando a cerveja gelada acaba." },
  { nome: "Pedido pelo WhatsApp", setor: "vendas", descricao: "Recebe e confirma pedidos de entrega." },
];

async function run() {
  const mock = new LlmMock();
  const llm: LlmClient = {
    generateText(system, user) {
      if (system.includes("PALAVRA-CHAVE: BUSCAS")) {
        return Promise.resolve(JSON.stringify(["s1", "s2", "s3", "s4", "s5", "s6"]));
      }
      if (system.includes("PALAVRA-CHAVE: IDEIAS")) return Promise.resolve(JSON.stringify(IDEAS));
      if (system.includes("PALAVRA-CHAVE: EVIDENCIAS")) {
        const url = /URL: (\S+)/.exec(user)?.[1] ?? "";
        return Promise.resolve(
          JSON.stringify([{ tipo: "concorrente", afirmacao: "existe concorrente", trecho: "Concorrente vende por R$ 150.", url }]),
        );
      }
      return mock.generateText(system, user);
    },
  };
  const queries: string[] = [];
  const search: SearchClient = {
    search(query) {
      queries.push(query);
      return Promise.resolve([
        { title: query, url: `https://busca.test/${encodeURIComponent(query)}`, content: "Concorrente vende por R$ 150." },
      ]);
    },
  };
  const handle = openMigratedDatabase(":memory:");
  const cfg = {
    ...resolveStudyConfig({ niche: "distribuidora de bebidas", city: "Arraial do Cabo", numIdeas: 2, mock: true }),
    outputDir: mkdtempSync(join(tmpdir(), "goodbizz-ideas-")),
  };
  const result = await generateStudy(cfg, {
    llm,
    decider: new DeciderMock(),
    search,
    cache: new StudyCache(new SqliteCacheStore(handle.db)),
    logger: QUIET,
  });
  handle.sqlite.close();
  return { queries, result };
}

describe("pesquisa por ideia", () => {
  test("FR-005: cada ideia recebe uma busca de concorrente e uma de preço", async () => {
    const { queries } = await run();
    for (const idea of IDEAS) {
      const own = queries.filter((query) => query.includes(idea.nome));
      expect(own).toHaveLength(2);
      expect(own.some((query) => query.includes("concorrentes"))).toBe(true);
      expect(own.some((query) => query.includes("preço"))).toBe(true);
    }
  });

  test("FR-005: as evidências da ideia guardam o nome dela e continuam a numeração do estudo", async () => {
    const { result } = await run();
    const study = result.evidences.filter((evidence) => evidence.ideia === "");
    expect(study).toHaveLength(6);
    for (const idea of IDEAS) {
      expect(result.evidences.filter((evidence) => evidence.ideia === idea.nome)).toHaveLength(2);
    }
    expect(result.evidences.map((evidence) => evidence.id)).toEqual(
      result.evidences.map((_evidence, index) => `E${index + 1}`),
    );
    const dados = JSON.parse(String(result.files.find((file) => file.path === "dados.json")?.content));
    expect((dados.evidencias as Array<{ ideia: string }>).filter((row) => row.ideia === "Alerta de estoque")).toHaveLength(2);
  });
});
