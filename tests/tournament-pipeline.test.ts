/**
 * Torneio no pipeline (Work 0017, task 1.3): a etapa roda depois da avaliação e a ordem do resumo e
 * das pastas segue a média de pontos por partida, com desempate pelo índice e depois pelo nome.
 */
import { describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { StudyCache } from "../src/application/cache.ts";
import { generateAddition, generateStudy } from "../src/application/generate-study.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import type { DeciderClient } from "../src/domain/ports.ts";
import type { DeciderAnswers, QuestionSet, StudyConfig } from "../src/domain/types.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SearchMock } from "../src/infrastructure/search-mock.ts";
import { silentLogger, tempDir } from "./helpers.ts";

/**
 * Decisor controlado: a nota de fit e de venda vem de `scores` pelo nome da ideia no estado, e o
 * duelo segue `duel` (que recebe os textos das opções A e B).
 */
class ControlledDecider implements DeciderClient {
  duels = 0;
  constructor(
    private readonly scores: Record<string, number>,
    private readonly duel: (a: string, b: string) => "A" | "B",
  ) {}

  async ask(state: string, questions: QuestionSet): Promise<DeciderAnswers> {
    const output: DeciderAnswers = {};
    const named = Object.keys(this.scores).find((name) => state.includes(`Ideia: ${name} —`));
    for (const [qid, question] of Object.entries(questions)) {
      if (question.type === "choice" && qid === "duelo") {
        this.duels += 1;
        const pick = this.duel(question.criteria["A"] ?? "", question.criteria["B"] ?? "");
        output[qid] = { choice: pick, probabilities: { A: pick === "A" ? 1 : 0, B: pick === "B" ? 1 : 0 } };
      } else if (question.type === "choice") {
        const first = Object.keys(question.criteria)[0] ?? "";
        output[qid] = { choice: first, probabilities: { [first]: 1 }, confidence: 0.8 };
      } else if (question.type === "score") {
        output[qid] = { score: named === undefined ? 1 : (this.scores[named] ?? 1), confidence: 0.8 };
      } else {
        output[qid] = { noul: 0.5 };
      }
    }
    return output;
  }

  async queryProbes(_state: string, probes: Record<string, string>): Promise<Record<string, number>> {
    return Object.fromEntries(Object.keys(probes).map((id) => [id, 0.5]));
  }
}

function setup(names: string[], overrides: Partial<StudyConfig> = {}) {
  const dir = tempDir("goodbizz-torneio-");
  const ideasFile = join(dir, "ideias.json");
  writeFileSync(
    ideasFile,
    JSON.stringify(names.map((nome) => ({ nome, setor: "bebidas", descricao: nome }))),
  );
  const handle = openMigratedDatabase(":memory:");
  const cache = new StudyCache(new SqliteCacheStore(handle.db));
  const cfg: StudyConfig = {
    ...resolveStudyConfig({ niche: "depósitos de bebidas", numIdeas: names.length, mock: true }),
    outputDir: dir,
    ideasFile,
    cacheSeed: "estudo-pipeline",
    ...overrides,
  };
  return { handle, cache, cfg };
}

const EIGHT = [
  "Agenda Viva",
  "Fiado Digital",
  "Rota Certa",
  "Estoque Esperto",
  "Pix Cobrador",
  "Combo Evento",
  "Avalia Mais",
  "Gelo Garantido",
];

/** Fiado Digital tem o menor índice de todos: só o torneio pode colocá-la em primeiro. */
const EIGHT_SCORES: Record<string, number> = Object.fromEntries(
  EIGHT.map((name, position) => [name, name === "Fiado Digital" ? 0.2 : 1 + position * 0.1]),
);

const preferFiado = (a: string) => (a.startsWith("Fiado Digital") ? "A" : "B");

describe("torneio no pipeline", () => {
  test("pasta 01: a ideia que o decisor sempre escolhe fica em primeiro com media 1.0", async () => {
    const { handle, cache, cfg } = setup(EIGHT);
    const decider = new ControlledDecider(EIGHT_SCORES, preferFiado);
    const result = await generateStudy(cfg, { llm: new LlmMock(), decider, search: new SearchMock(), cache, logger: silentLogger() });

    const fiado = result.evaluations.find((item) => item.name === "Fiado Digital");
    expect(Math.min(...result.evaluations.map((item) => item.index))).toBe(fiado?.index ?? -1);
    expect(result.summary.tournament?.rounds).toBe(4);
    expect(result.summary.ordered[0]?.name).toBe("Fiado Digital");
    expect(result.summary.ordered[0]?.tournament?.score).toBe(1);
    expect(result.folders["Fiado Digital"]).toBe("01-fiado-digital");
    expect(result.files.some((file) => file.path === "01-fiado-digital/README.md")).toBe(true);
    expect(decider.duels).toBeLessThanOrEqual(32);
    handle.sqlite.close();
  });

  test("pasta 01: o modo --so-avaliar tambem ordena pelo torneio", async () => {
    const { handle, cache, cfg } = setup(EIGHT, { evaluateOnly: true });
    const decider = new ControlledDecider(EIGHT_SCORES, preferFiado);
    const result = await generateStudy(cfg, { llm: new LlmMock(), decider, search: new SearchMock(), cache, logger: silentLogger() });
    expect(result.summary.ordered[0]?.name).toBe("Fiado Digital");
    expect(result.evaluations.every((item) => (item.tournament?.games ?? 0) > 0)).toBe(true);
    handle.sqlite.close();
  });

  test("desempate: media igual desempata pelo indice e depois pelo nome", async () => {
    const names = ["Beta", "Alfa", "Gama"];
    const { handle, cache, cfg } = setup(names);
    // Sempre A: as duas ordens se anulam e toda ideia termina com 0.5 por partida.
    const decider = new ControlledDecider({ Beta: 1.5, Alfa: 1.5, Gama: 1.8 }, () => "A");
    const result = await generateStudy(cfg, { llm: new LlmMock(), decider, search: new SearchMock(), cache, logger: silentLogger() });

    expect(result.summary.ordered.map((item) => item.tournament?.score)).toEqual([0.5, 0.5, 0.5]);
    expect(result.summary.ordered.map((item) => item.name)).toEqual(["Gama", "Alfa", "Beta"]);
    expect(result.folders).toEqual({ Gama: "01-gama", Alfa: "02-alfa", Beta: "03-beta" });
    handle.sqlite.close();
  });

  test("adicao: o torneio roda de novo sobre todas as ideias", async () => {
    const { handle, cache, cfg } = setup(["Agenda Viva", "Fiado Digital", "Rota Certa"]);
    const decider = new ControlledDecider(EIGHT_SCORES, preferFiado);
    const study = await generateStudy(cfg, { llm: new LlmMock(), decider, search: new SearchMock(), cache, logger: silentLogger() });

    const added = await generateAddition(
      { ...cfg, ideasFile: "" },
      { brief: study.brief, existing: study.evaluations, evidences: [] },
      2,
      "pedido-1",
      { llm: new LlmMock(), decider, search: new SearchMock(), cache, logger: silentLogger() },
    );
    expect(added.evaluations).toHaveLength(5);
    expect(added.summary.tournament?.rounds).toBe(4);
    expect(added.evaluations.every((item) => (item.tournament?.games ?? 0) > 0)).toBe(true);
    expect(added.summary.ordered[0]?.name).toBe("Fiado Digital");
    handle.sqlite.close();
  });
});
