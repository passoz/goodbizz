/**
 * Evidências nos prompts (FR-004): brief, ideias e plano recebem a lista de evidências e o prompt
 * obriga a citar `[E#]`. Com o LLM simulado, o brief gravado cita um id que existe.
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

async function run() {
  const mock = new LlmMock();
  const calls: Array<{ system: string; user: string }> = [];
  const llm: LlmClient = {
    generateText(system, user) {
      calls.push({ system, user });
      return mock.generateText(system, user);
    },
  };
  const queries: string[] = [];
  const search: SearchClient = {
    search(query) {
      queries.push(query);
      const slug = encodeURIComponent(query);
      return Promise.resolve([
        {
          title: `Sobre ${query}`,
          url: `https://pesquisa.test/${slug}`,
          content: `Depósitos da região pagam R$ ${120 + queries.length} por mês em sistemas. Outra frase qualquer.`,
        },
      ]);
    },
  };
  const handle = openMigratedDatabase(":memory:");
  const cfg = {
    ...resolveStudyConfig({ niche: "deposito de bebidas", city: "Cabo Frio", numIdeas: 2, mock: true }),
    outputDir: mkdtempSync(join(tmpdir(), "goodbizz-prompts-")),
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
  const byKeyword = (keyword: string) => calls.filter((call) => call.system.includes(keyword));
  return { result, queries, calls, byKeyword };
}

describe("evidências nos prompts", () => {
  test("FR-004: o LLM simulado planeja de 6 a 10 buscas e extrai evidências literais", async () => {
    const { result } = await run();
    const study = result.evidences.filter((evidence) => evidence.ideia === "");
    expect(study.length).toBeGreaterThanOrEqual(6);
    expect(study.length).toBeLessThanOrEqual(10 * 4);
    expect(result.issues.some((issue) => issue.includes("completei"))).toBe(false);
    expect(study[0]?.trecho).toMatch(/^Depósitos da região pagam R\$ \d+ por mês em sistemas\.$/);
  });

  test("FR-004: brief e ideias recebem as evidências do estudo e a regra de citar [E#]", async () => {
    const { result, calls } = await run();
    const brief = calls.find((call) => call.system.includes("PALAVRA-CHAVE: BRIEF"));
    const ideas = calls.find((call) => call.system.includes("PALAVRA-CHAVE: IDEIAS"));
    const first = result.evidences[0];
    for (const call of [brief, ideas]) {
      expect(call?.system).toContain("[E#]");
      expect(call?.user).toContain(`[${first?.id}]`);
      expect(call?.user).toContain(first?.trecho ?? "?");
      expect(call?.user).toContain(first?.url ?? "?");
    }
  });

  test("FR-004: o plano recebe as evidências da ideia e as do estudo", async () => {
    const { result, calls } = await run();
    const idea = result.evaluations[0];
    const own = result.evidences.find((evidence) => evidence.ideia === idea?.name);
    const other = result.evidences.find((evidence) => evidence.ideia !== "" && evidence.ideia !== idea?.name);
    const plan = calls.find((call) => call.user.includes(`Ideia: ${idea?.name} (`));
    expect(plan?.system).toContain("[E#]");
    expect(plan?.user).toContain(`[${result.evidences[0]?.id}]`);
    expect(plan?.user).toContain(`[${own?.id}]`);
    expect(plan?.user).not.toContain(`[${other?.id}]`);
  });

  test("FR-004: o brief gravado cita pelo menos um [E#] que existe", async () => {
    const { result } = await run();
    const ids = new Set(result.evidences.map((evidence) => evidence.id));
    const cited = [...result.brief.matchAll(/\[(E\d+)\]/g)].map((match) => match[1] as string);
    expect(cited.length).toBeGreaterThan(0);
    expect(cited.every((id) => ids.has(id))).toBe(true);
  });
});
