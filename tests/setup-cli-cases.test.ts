import { describe, expect, test } from "bun:test";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import type { StudyConfig } from "../src/domain/types.ts";

function setupOf(cfg: StudyConfig): unknown {
  return "setupFee" in cfg ? cfg.setupFee : undefined;
}

/**
 * Casos da task 1.8 (FR-008): setupFee no domínio, no config e na CLI.
 * RED: sem o parâmetro o config resolvido não traz setupFee e a asserção do padrão 1500 falha.
 */
describe("FR-008: casos do setupFee no config", () => {
  test("o setup padrão é 1500", () => {
    const cfg = resolveStudyConfig({ niche: "bebidas", mock: true });
    expect(setupOf(cfg)).toBe(1500);
  });

  test("fora de 0 a 100000 ou não inteiro é recusado", () => {
    const bad = [-1, 100001, 1.5, Number.NaN];
    for (const setupFee of bad) {
      expect(() =>
        resolveStudyConfig({ niche: "bebidas", mock: true, setupFee }),
      ).toThrow();
    }
  });

  test("limites 0 e 100000 passam", () => {
    for (const setupFee of [0, 100000]) {
      const cfg = resolveStudyConfig({ niche: "bebidas", mock: true, setupFee });
      expect(setupOf(cfg)).toBe(setupFee);
    }
  });
});
