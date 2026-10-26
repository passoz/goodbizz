/**
 * Resposta do decisor simulado à pergunta de duelo (Work 0017, task 1.2).
 */
import { describe, expect, test } from "bun:test";

import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import type { QuestionSet } from "../src/domain/types.ts";

function duel(a: string, b: string): QuestionSet {
  return {
    duelo: { type: "choice", instructions: "Qual o dono contrata primeiro?", criteria: { A: a, B: b } },
  };
}

describe("duelo no decisor simulado", () => {
  test("probabilidades de A e B somam 1 e a choice e a maior", async () => {
    const answer = (
      await new DeciderMock().ask("estado", duel("Fiado Digital — fiado", "Rota Certa — rotas"))
    )["duelo"] as { choice: string; probabilities: Record<string, number> };
    const a = answer.probabilities["A"] ?? -1;
    const b = answer.probabilities["B"] ?? -1;
    expect(a + b).toBeCloseTo(1, 9);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(answer.choice).toBe(a >= b ? "A" : "B");
  });

  test("a forca vem do texto da opcao, nao do estado", async () => {
    const mock = new DeciderMock();
    const one = (await mock.ask("estado um", duel("Fiado Digital", "Rota Certa")))["duelo"];
    const two = (await mock.ask("estado dois bem diferente", duel("Fiado Digital", "Rota Certa")))["duelo"];
    expect(two).toEqual(one);
    const swapped = (await mock.ask("estado um", duel("Rota Certa", "Fiado Digital")))["duelo"] as {
      probabilities: Record<string, number>;
    };
    const original = one as { probabilities: Record<string, number> };
    expect(swapped.probabilities["B"]).toBeCloseTo(original.probabilities["A"] ?? -1, 9);
  });

  test("escolha de tres opcoes continua com uma opcao so", async () => {
    const answer = (
      await new DeciderMock().ask("estado", {
        dor: { type: "choice", instructions: "Que dor?", criteria: { x: "1", y: "2", z: "3" } },
      })
    )["dor"] as { probabilities: Record<string, number> };
    expect(Object.values(answer.probabilities).sort()).toEqual([0, 0, 1]);
  });
});
