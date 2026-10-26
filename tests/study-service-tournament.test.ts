/**
 * Remoção de ideia com torneio no serviço de estudos (Work 0017, task 1.6).
 */
import { describe, expect, test } from "bun:test";

import { resolveStudyConfig } from "../src/config/runtime.ts";
import { makeHarness } from "./helpers.ts";

describe("remocao com torneio", () => {
  test("o resumo gravado depois da remocao guarda as partidas restantes", async () => {
    const harness = makeHarness();
    const created = await harness.service.create(
      resolveStudyConfig({ niche: "bares", numIdeas: 4, mock: true }),
    );
    const study = await harness.service.run(created.id);
    const target = study.evaluations[1];
    const after = await harness.service.removeIdea(study.id, target?.id ?? "");
    const reloaded = await harness.service.get(study.id);

    expect(after.summary?.tournament?.rounds).toBe(study.summary?.tournament?.rounds);
    expect(reloaded.summary?.tournament?.matches.map((match) => [match.a, match.b])).toEqual(
      (study.summary?.tournament?.matches ?? [])
        .filter((match) => match.a !== target?.id && match.b !== target?.id)
        .map((match) => [match.a, match.b]),
    );
    harness.close();
  });

  test("remover ate sobrar uma ideia apaga o torneio", async () => {
    const harness = makeHarness();
    const created = await harness.service.create(
      resolveStudyConfig({ niche: "bares", numIdeas: 2, mock: true }),
    );
    const study = await harness.service.run(created.id);
    const after = await harness.service.removeIdea(study.id, study.evaluations[0]?.id ?? "");
    expect(after.summary?.tournament ?? null).toBeNull();
    expect(after.evaluations[0]?.tournament ?? null).toBeNull();
    harness.close();
  });
});
