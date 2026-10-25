/**
 * Seção Fontes (FR-007, EC-004): o código anexa ao README de cada ideia a seção "Fontes" com as
 * evidências citadas no texto; id inexistente fica fora da seção e vai para `issues`.
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

async function run(plan: string) {
  const mock = new LlmMock();
  const llm: LlmClient = {
    generateText(system, user) {
      if (system.includes("PALAVRA-CHAVE: BUSCAS")) return Promise.resolve(JSON.stringify(["q1", "q2", "q3", "q4", "q5", "q6"]));
      if (system.includes("PALAVRA-CHAVE: EVIDENCIAS")) {
        const url = /URL: (\S+)/.exec(user)?.[1] ?? "";
        return Promise.resolve(JSON.stringify([{ tipo: "mercado", afirmacao: `Fato de ${url}`, trecho: "Fato verificado.", url }]));
      }
      if (system.includes("PALAVRA-CHAVE: BRIEF") || system.includes("PALAVRA-CHAVE: IDEIAS")) {
        return mock.generateText(system, user);
      }
      return Promise.resolve(plan);
    },
  };
  const search: SearchClient = {
    search: (query) =>
      Promise.resolve([{ title: query, url: `https://fonte.test/${encodeURIComponent(query)}`, content: "Fato verificado." }]),
  };
  const handle = openMigratedDatabase(":memory:");
  const cfg = {
    ...resolveStudyConfig({ niche: "deposito de bebidas", numIdeas: 2, mock: true }),
    outputDir: mkdtempSync(join(tmpdir(), "goodbizz-sources-")),
    concurrency: 1,
  };
  const result = await generateStudy(cfg, {
    llm,
    decider: new DeciderMock(),
    search,
    cache: new StudyCache(new SqliteCacheStore(handle.db)),
    logger: QUIET,
  });
  handle.sqlite.close();
  const readmes = result.files
    .filter((file) => /^\d\d-[^/]+\/README\.md$/.test(file.path))
    .map((file) => String(file.content));
  return { result, readmes };
}

/** Texto da última seção de nível 2 do arquivo. */
function lastSection(markdown: string): { title: string; body: string } {
  const parts = markdown.split(/^## /m);
  const last = parts[parts.length - 1] ?? "";
  const [title = "", ...rest] = last.split("\n");
  return { title: title.trim(), body: rest.join("\n") };
}

describe("seção Fontes", () => {
  test("FR-007: o README termina com Fontes listando exatamente E2 e E7 com URL", async () => {
    const { result, readmes } = await run("# Plano\n\n## 1. Resumo executivo\n\nPreço [E2]. Concorrente [E7]. De novo [E2].\n");
    expect(readmes).toHaveLength(2);
    const e2 = result.evidences.find((evidence) => evidence.id === "E2");
    const e7 = result.evidences.find((evidence) => evidence.id === "E7");
    for (const readme of readmes) {
      const section = lastSection(readme);
      expect(section.title).toBe("Fontes");
      const items = section.body.split("\n").filter((line) => line.startsWith("- "));
      expect(items).toHaveLength(2);
      expect(items[0]).toContain("[E2]");
      expect(items[0]).toContain(e2?.url ?? "?");
      expect(items[1]).toContain("[E7]");
      expect(items[1]).toContain(e7?.url ?? "?");
    }
  });

  test("FR-007 / EC-004: citação de id inexistente fica fora de Fontes e vai para issues", async () => {
    const { result, readmes } = await run("# Plano\n\nPreço [E99] e fato [E1].\n");
    for (const readme of readmes) {
      const section = lastSection(readme);
      expect(section.title).toBe("Fontes");
      expect(section.body).not.toContain("E99");
      expect(section.body).toContain("[E1]");
    }
    expect(result.issues.filter((issue) => issue.includes("E99"))).toHaveLength(2);
  });

  test("FR-007: plano sem citação ainda termina com Fontes dizendo que nada foi citado", async () => {
    const { readmes } = await run("# Plano\n\nTexto sem fonte.\n");
    for (const readme of readmes) {
      const section = lastSection(readme);
      expect(section.title).toBe("Fontes");
      expect(section.body).toContain("nenhuma evidência");
    }
  });
});
