import { describe, expect, test } from "bun:test";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";

const probes: Record<string, string> = {
  dinheiro: "Voce pagaria mais por isso?",
  reputacao: "Isso melhora sua reputacao?",
  processo: "Isso reduz seu retrabalho?",
  tecnologia: "Voce adotaria tecnologia para isso?",
};

describe("DeciderMock determinism", () => {
  test("same seed is stable across instances", async () => {
    const first = await new DeciderMock("stable").queryProbes("estado um", probes);
    const second = await new DeciderMock("stable").queryProbes("estado um", probes);
    expect(first).toEqual(second);
    expect(Object.values(first).every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  test("different seeds produce different outputs", async () => {
    const first = await new DeciderMock("seed-um").queryProbes("estado um", probes);
    const second = await new DeciderMock("seed-dois").queryProbes("estado um", probes);
    expect(first).not.toEqual(second);
  });

  test("different states discriminate in probe probabilities", async () => {
    const client = new DeciderMock("stable");
    const first = await client.queryProbes("estado alfa", probes);
    const second = await client.queryProbes("estado beta", probes);
    const differing = Object.keys(probes).filter((id) => first[id] !== second[id]);
    expect(differing.length).toBeGreaterThan(0);
  });
});
