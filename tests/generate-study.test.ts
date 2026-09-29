/**
 * Pipeline contract: the study generator's branches — evaluate-only, ideas from file, optional
 * HTML compilation, cache reuse, and the numeric guardrail reporting issues.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StudyCache } from "../src/application/cache.ts";
import { generateStudy } from "../src/application/generate-study.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { silentLogger } from "./helpers.ts";
import type { LlmClient } from "../src/domain/ports.ts";
import type { StudyConfig } from "../src/domain/types.ts";

function tempDir(prefix = "goodbizz-pipeline-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function harness() {
  const handle = openMigratedDatabase(":memory:");
  const cache = new StudyCache(new SqliteCacheStore(handle.db));
  return { handle, cache };
}

function config(overrides: Partial<StudyConfig> = {}): StudyConfig {
  return {
    ...resolveStudyConfig({ niche: "oficinas mecanicas", numIdeas: 2, mock: true }),
    outputDir: tempDir(),
    ...overrides,
  };
}

describe("generateStudy", () => {
  test("stops after evaluation in evaluate-only mode without writing artifacts", async () => {
    const { handle, cache } = harness();
    const steps: string[] = [];
    const result = await generateStudy(config({ evaluateOnly: true }), {
      llm: new LlmMock(),
      decider: new DeciderMock(),
      cache,
      logger: silentLogger(),
      onProgress: (step) => steps.push(step),
    });

    expect(result.evaluations).toHaveLength(2);
    expect(result.files).toEqual([]);
    expect(result.folders).toEqual({});
    expect(steps.some((step) => step.includes("--so-avaliar"))).toBe(true);
    handle.sqlite.close();
  });

  test("reads ideas from a file instead of asking the provider", async () => {
    const { handle, cache } = harness();
    const dir = tempDir();
    const ideasPath = join(dir, "ideas.json");
    writeFileSync(
      ideasPath,
      JSON.stringify(["Triagem de WhatsApp", { nome: "Ficha do cliente", descricao: "Preenche cadastro" }]),
    );

    const requests: string[] = [];
    const spy: LlmClient = {
      async generateText(system: string, user: string) {
        requests.push(system.slice(0, 40));
        return new LlmMock().generateText(system, user);
      },
    };

    const result = await generateStudy(config({ ideasFile: ideasPath, numIdeas: 5 }), {
      llm: spy,
      decider: new DeciderMock(),
      cache,
      logger: silentLogger(),
    });

    expect(result.ideas.map((idea) => idea.name)).toEqual(["Triagem de WhatsApp", "Ficha do cliente"]);
    expect(requests.some((prefix) => prefix.includes("IDEIAS"))).toBe(false);
    expect(result.evaluations).toHaveLength(2);
    handle.sqlite.close();
  });

  test("compiles a unified HTML artifact when pdf output is requested", async () => {
    const { handle, cache } = harness();
    const result = await generateStudy(config({ pdf: true }), {
      llm: new LlmMock(),
      decider: new DeciderMock(),
      cache,
      logger: silentLogger(),
    });

    const html = result.files.find((file) => file.path === "estudo-completo.html");
    expect(html).toBeDefined();
    const content = typeof html?.content === "string" ? html.content : "";
    expect(content).toContain("<!doctype html>");
    expect(content).toContain("Estudo de nicho");
    expect(content).toContain("page-break-after");
    handle.sqlite.close();
  });

  test("reuses cached answers on a second run of the same configuration", async () => {
    const { handle, cache } = harness();
    const deps = { llm: new LlmMock(), decider: new DeciderMock(), cache, logger: silentLogger() };
    const cfg = config();

    const first = await generateStudy(cfg, deps);
    expect(first.cacheHits).toBe(0);
    expect(first.cacheCount).toBeGreaterThan(0);

    const second = await generateStudy(cfg, deps);
    expect(second.cacheHits).toBeGreaterThan(0);
    expect(second.evaluations).toEqual(first.evaluations);
    handle.sqlite.close();
  });

  test("reports guardrail issues when the generated document breaks the contract", async () => {
    const { handle, cache } = harness();
    const broken: LlmClient = {
      async generateText(system: string) {
        if (system.includes("IDEIAS")) {
          return JSON.stringify([{ nome: "Ideia curta", setor: "s", descricao: "descricao curta" }]);
        }
        if (system.includes("BRIEF")) return "# Brief\ncurto";
        return "## 1. Resumo executivo\n\nTexto com acento: avaliacao\n";
      },
    };

    const result = await generateStudy(config({ numIdeas: 1 }), {
      llm: broken,
      decider: new DeciderMock(),
      cache,
      logger: silentLogger(),
    });

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toContain("01-ideia-curta:");
    expect(result.issues[0]).toContain("section(s) missing");
    handle.sqlite.close();
  });

  test("strips accents from every markdown artifact, not only the per-idea document", async () => {
    const { handle, cache } = harness();
    // O provedor real escreve acentos mesmo instruido a nao usar: o brief e o indice precisam passar
    // pela normalizacao global (passo 6/6 do baseline).
    const accented: LlmClient = {
      async generateText(system: string) {
        if (system.includes("IDEIAS")) {
          return JSON.stringify([
            { nome: "Ação de cobrança", setor: "cobrança", descricao: "praça pública" },
          ]);
        }
        if (system.includes("BRIEF")) return "# Brief\n\nPerto de praça e ponto de ônibus.";
        return "## 1. Resumo executivo\n\nTexto sobre ação e praça.\n";
      },
    };

    const result = await generateStudy(config({ numIdeas: 1 }), {
      llm: accented,
      decider: new DeciderMock(),
      cache,
      logger: silentLogger(),
    });

    const markdown = result.files.filter((file) => file.path.endsWith(".md"));
    expect(markdown.length).toBeGreaterThan(1);
    for (const file of markdown) {
      const content = typeof file.content === "string" ? file.content : "";
      expect(content).not.toMatch(/[áàâãäçéèêëíìîïñóòôõöúùûü]/i);
    }
    // dados.json e csv seguem o baseline: so o markdown e normalizado.
    const dados = result.files.find((file) => file.path === "dados.json");
    expect(typeof dados?.content === "string" ? dados.content : "").toContain("praça");
    handle.sqlite.close();
  });
});
