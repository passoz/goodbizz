/**
 * Evidência literal (FR-003): só entra no estudo a evidência cujo trecho aparece, com espaços
 * normalizados, no conteúdo do resultado da mesma URL. As que entram vão para `00-evidencias.md`
 * e para a chave `evidencias` do `dados.json`; as inventadas não aparecem em nenhum dos dois.
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

const CONTENT =
  "O Sistema Adega cobra R$  189\n  por mês no plano básico. Clientes reclamam da demora na entrega.";

/** Uma única busca útil: o planejador devolve 6 buscas, mas só a primeira traz resultado. */
function fakes() {
  const mock = new LlmMock();
  const llm: LlmClient = {
    generateText(system, user) {
      if (system.includes("PALAVRA-CHAVE: BUSCAS")) {
        return Promise.resolve(JSON.stringify(["b1", "b2", "b3", "b4", "b5", "b6"]));
      }
      if (system.includes("PALAVRA-CHAVE: EVIDENCIAS")) {
        return Promise.resolve(
          JSON.stringify([
            {
              tipo: "preco",
              afirmacao: "O concorrente cobra mensalidade",
              trecho: "O Sistema Adega cobra R$ 189 por mês no plano básico.",
              url: "https://adega.test/precos",
              valor: 189,
              unidade: "R$/mês",
            },
            {
              tipo: "preco",
              afirmacao: "Número inventado",
              trecho: "O Sistema Adega cobra R$ 99 por mês.",
              url: "https://adega.test/precos",
              valor: 99,
              unidade: "R$/mês",
            },
            {
              tipo: "reclamacao",
              afirmacao: "Trecho literal mas atribuído a outra URL",
              trecho: "Clientes reclamam da demora na entrega.",
              url: "https://outro.test/",
              valor: null,
              unidade: "",
            },
            {
              tipo: "reclamacao",
              afirmacao: "Clientes reclamam da entrega",
              trecho: "Clientes reclamam da demora na entrega.",
              url: "https://adega.test/precos",
              valor: 30,
              unidade: "min",
            },
          ]),
        );
      }
      return mock.generateText(system, user);
    },
  };
  const search: SearchClient = {
    search(query) {
      if (query !== "b1") return Promise.resolve([]);
      return Promise.resolve([{ title: "Preços", url: "https://adega.test/precos", content: CONTENT }]);
    },
  };
  return { llm, search };
}

async function study() {
  const handle = openMigratedDatabase(":memory:");
  const { llm, search } = fakes();
  const cfg = {
    ...resolveStudyConfig({ niche: "adega", city: "Búzios", numIdeas: 1, mock: true }),
    outputDir: mkdtempSync(join(tmpdir(), "goodbizz-evidence-")),
  };
  const result = await generateStudy(cfg, {
    llm,
    decider: new DeciderMock(),
    search,
    cache: new StudyCache(new SqliteCacheStore(handle.db)),
    logger: QUIET,
  });
  handle.sqlite.close();
  const file = (path: string): string => {
    const found = result.files.find((entry) => entry.path === path);
    return typeof found?.content === "string" ? found.content : "";
  };
  return { result, evidencias: file("00-evidencias.md"), dados: JSON.parse(file("dados.json") || "{}") };
}

describe("evidência literal", () => {
  test("FR-003: só o trecho literal da mesma URL entra no estudo", async () => {
    const { result } = await study();
    const study_ = result.evidences.filter((evidence) => evidence.ideia === "");
    expect(study_.map((evidence) => evidence.trecho)).toEqual([
      "O Sistema Adega cobra R$ 189 por mês no plano básico.",
      "Clientes reclamam da demora na entrega.",
    ]);
    expect(study_.map((evidence) => evidence.id)).toEqual(["E1", "E2"]);
    expect(study_.every((evidence) => evidence.url === "https://adega.test/precos")).toBe(true);
  });

  test("FR-003: o valor só fica quando o número aparece no trecho", async () => {
    const { result } = await study();
    const [price, complaint] = result.evidences;
    expect(price).toMatchObject({ valor: 189, unidade: "R$/mês" });
    expect(complaint).toMatchObject({ valor: null, unidade: "" });
  });

  test("FR-003: 00-evidencias.md lista as evidências válidas e omite a inventada", async () => {
    const { evidencias } = await study();
    expect(evidencias).toContain("E1");
    expect(evidencias).toContain("O Sistema Adega cobra R$ 189 por mês no plano básico.");
    expect(evidencias).toContain("https://adega.test/precos");
    expect(evidencias).not.toContain("R$ 99");
    expect(evidencias).not.toContain("https://outro.test/");
  });

  test("FR-003: dados.json grava a chave evidencias com os campos do contrato", async () => {
    const { dados } = await study();
    const rows = (dados.evidencias ?? []) as Array<Record<string, unknown>>;
    expect(rows.filter((row) => row.ideia === "")).toEqual([
      {
        id: "E1",
        tipo: "preco",
        afirmacao: "O concorrente cobra mensalidade",
        trecho: "O Sistema Adega cobra R$ 189 por mês no plano básico.",
        url: "https://adega.test/precos",
        valor: 189,
        unidade: "R$/mês",
        ideia: "",
      },
      {
        id: "E2",
        tipo: "reclamacao",
        afirmacao: "Clientes reclamam da entrega",
        trecho: "Clientes reclamam da demora na entrega.",
        url: "https://adega.test/precos",
        valor: null,
        unidade: "",
        ideia: "",
      },
    ]);
    expect(JSON.stringify(dados)).not.toContain("R$ 99");
  });
});
