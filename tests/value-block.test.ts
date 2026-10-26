/**
 * Aceitação da task 1.4 (FR-004): o dataBlock traz o bloco VALOR e o plano tem a seção 11.
 * Espia o prompt enviado ao gerador do documento: sem a impl, o user não contém VALOR.
 */
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { StudyCache } from "../src/application/cache.ts";
import { generateStudy } from "../src/application/generate-study.ts";
import { createLogger, resolveStudyConfig } from "../src/config/runtime.ts";
import type { LlmClient } from "../src/domain/ports.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SearchMock } from "../src/infrastructure/search-mock.ts";

const QUIET = createLogger("fatal");

describe("FR-004: bloco VALOR e seção 11", () => {
  test("o prompt do documento traz o bloco VALOR com premissas e o plano tem a seção 11", async () => {
    const handle = openMigratedDatabase(":memory:");
    try {
      const cfg = {
        ...resolveStudyConfig({ niche: "depositos de bebidas", city: "Cabo Frio", numIdeas: 1, mock: true }),
        outputDir: mkdtempSync(join(tmpdir(), "goodbizz-valor-ac-")),
      };
      const inner = new LlmMock();
      const seen: string[] = [];
      const spy: LlmClient = {
        generateText: async (system: string, user: string) => {
          seen.push(`${system}\n${user}`);
          return inner.generateText(system, user);
        },
      };
      const result = await generateStudy(cfg, {
        llm: spy,
        decider: new DeciderMock(),
        search: new SearchMock(),
        cache: new StudyCache(new SqliteCacheStore(handle.db)),
        logger: QUIET,
      });
      const docPrompt = seen.find((prompt) => prompt.includes("DADOS MEDIDOS"));
      expect(docPrompt).toBeDefined();
      expect(docPrompt).toContain("VALOR");
      expect(docPrompt).toContain("perda mensal");
      const docs = Object.values(result.documents);
      expect(docs.length).toBeGreaterThan(0);
      expect(docs[0] as string).toContain("## 11. Proposta de valor e retorno");
    } finally {
      handle.sqlite.close();
    }
  });
});
