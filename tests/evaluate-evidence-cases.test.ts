/**
 * Casos das evidências no decisor (FR-006): o método de sondas (`noul`) também recebe as
 * evidências, e ideia sem evidência nenhuma não ganha bloco vazio no estado.
 */
import { describe, expect, test } from "bun:test";

import { evaluateIdea } from "../src/application/evaluate.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import type { DeciderClient } from "../src/domain/ports.ts";
import type { Evidence } from "../src/domain/types.ts";

function recording(): { decider: DeciderClient; states: string[] } {
  const inner = new DeciderMock();
  const states: string[] = [];
  return {
    states,
    decider: {
      ask: (state, questions) => (states.push(state), inner.ask(state, questions)),
      queryProbes: (state, probes) => (states.push(state), inner.queryProbes(state, probes)),
    },
  };
}

const EVIDENCE: Evidence = {
  id: "E4",
  tipo: "custo",
  afirmacao: "A perda com quebra é alta",
  trecho: "Depósitos perdem 3% do estoque com quebra.",
  url: "https://fonte.test/quebra",
  valor: 3,
  unidade: "%",
  ideia: "",
};

describe("evidências no decisor em casos de borda", () => {
  test("FR-006: as sondas do método noul recebem as evidências", async () => {
    const { decider, states } = recording();
    const cfg = resolveStudyConfig({ niche: "deposito", mock: true, painMethod: "noul" });
    const idea = { name: "Controle de quebra", sector: "estoque", description: "Registra a quebra." };
    await evaluateIdea(idea, decider, cfg, [EVIDENCE]);
    expect(states.length).toBeGreaterThan(0);
    expect(states.every((state) => state.includes("[E4]") && state.includes(EVIDENCE.trecho))).toBe(true);
  });

  test("FR-006: sem evidência o estado não ganha o bloco de evidências", async () => {
    const { decider, states } = recording();
    const cfg = resolveStudyConfig({ niche: "deposito", mock: true });
    await evaluateIdea(
      { name: "Sem fonte", sector: "", description: "Ideia sem pesquisa." },
      decider,
      cfg,
      [],
    );
    expect(states.some((state) => state.includes("Evidências"))).toBe(false);
  });
});
