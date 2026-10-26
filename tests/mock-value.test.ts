import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StudyCache } from "../src/application/cache.ts";
import { generateStudy } from "../src/application/generate-study.ts";
import { createLogger, resolveStudyConfig } from "../src/config/runtime.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SearchMock } from "../src/infrastructure/search-mock.ts";

const QUIET = createLogger("fatal");

/**
 * Aceitação da task 1.13 (QR-003): o modo simulado produz premissas, valor e
 * seção 11 determinísticos e coerentes com o guardrail.
 */
describe("QR-003: aceitação do modo simulado com valor", () => {
  async function runOnce() {
    const handle = openMigratedDatabase(":memory:");
    try {
      const cfg = {
        ...resolveStudyConfig({ niche: "cafés de bairro", numIdeas: 2, mock: true }),
        outputDir: mkdtempSync(join(tmpdir(), "goodbizz-mock-value-")),
      };
      const result = await generateStudy(cfg, {
        llm: new LlmMock(),
        decider: new DeciderMock(),
        search: new SearchMock(),
        cache: new StudyCache(new SqliteCacheStore(handle.db)),
        logger: QUIET,
      });
      const docs = Object.values(result.documents);
      return {
        premises: result.premises.map((entry) => entry.premises),
        values: result.evaluations
          .filter((evaluation) => evaluation.value !== undefined)
          .map((evaluation) => evaluation.value),
        unsourced: result.issues.filter((issue) => issue.includes("número sem fonte")),
        section11: docs.filter((doc) => doc.includes("## 11.")).length,
        total: docs.length,
      };
    } finally {
      handle.sqlite.close();
    }
  }
  test("duas execuções simuladas repetem premissas, valor e seção 11 sem número sem fonte em issues", async () => {
    const first = await runOnce();
    const second = await runOnce();
    expect(first.values.length).toBeGreaterThan(0);
    expect(first.values.length).toBe(first.total);
    expect(first.premises).toEqual(second.premises);
    expect(first.values).toEqual(second.values);
    expect(first.section11).toBe(first.total);
    expect(first.unsourced).toEqual([]);
  });
});
