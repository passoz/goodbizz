/**
 * Casos da pesquisa por ideia (FR-005): falha de busca de uma ideia não derruba o estudo e ideias
 * lidas de arquivo também são pesquisadas.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
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

describe("pesquisa por ideia em casos de borda", () => {
  test("FR-005: ideia lida de arquivo é pesquisada e a busca que falha vira aviso com o nome dela", async () => {
    const dir = mkdtempSync(join(tmpdir(), "goodbizz-ideas-cases-"));
    const ideasFile = join(dir, "ideias.json");
    writeFileSync(
      ideasFile,
      JSON.stringify([{ nome: "Cobrança de fiado", descricao: "Cobra o fiado no WhatsApp." }]),
    );
    const mock = new LlmMock();
    const llm: LlmClient = {
      generateText: (system, user) =>
        system.includes("PALAVRA-CHAVE: BUSCAS")
          ? Promise.resolve(JSON.stringify(["a", "b", "c", "d", "e", "f"]))
          : system.includes("PALAVRA-CHAVE: EVIDENCIAS")
            ? Promise.resolve(
                JSON.stringify([
                  {
                    tipo: "preco",
                    afirmacao: "preço",
                    trecho: "Plano de cobrança a R$ 49.",
                    url: "https://cobra.test/",
                  },
                ]),
              )
            : mock.generateText(system, user),
    };
    const queries: string[] = [];
    const search: SearchClient = {
      search(query) {
        queries.push(query);
        if (query.includes("concorrentes")) return Promise.reject(new Error("provedor de busca fora do ar"));
        if (!query.includes("Cobrança de fiado")) return Promise.resolve([]);
        return Promise.resolve([
          { title: "Cobra", url: "https://cobra.test", content: "Plano de cobrança a R$ 49." },
        ]);
      },
    };
    const handle = openMigratedDatabase(":memory:");
    const cfg = {
      ...resolveStudyConfig({ niche: "mercearia", mock: true, ideasFile }),
      outputDir: dir,
      evaluateOnly: true,
    };
    const result = await generateStudy(cfg, {
      llm,
      decider: new DeciderMock(),
      search,
      cache: new StudyCache(new SqliteCacheStore(handle.db)),
      logger: QUIET,
    });
    handle.sqlite.close();
    expect(queries.filter((query) => query.includes("Cobrança de fiado"))).toHaveLength(2);
    expect(result.evaluations).toHaveLength(1);
    expect(
      result.issues.some((issue) => issue.includes("Cobrança de fiado") && issue.includes("fora do ar")),
    ).toBe(true);
    expect(result.evidences).toEqual([
      {
        id: "E1",
        tipo: "preco",
        afirmacao: "preço",
        trecho: "Plano de cobrança a R$ 49.",
        url: "https://cobra.test/",
        valor: null,
        unidade: "",
        ideia: "Cobrança de fiado",
      },
    ]);
  });
});
