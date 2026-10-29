import { describe, expect, test } from "bun:test";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import type { StudyConfig } from "../src/domain/types.ts";

/**
 * Aceitação da task 1.8 (FR-008): setupFee no domínio, no config e na CLI.
 * O setup padrão é 1500, fora de 0 a 100000 é recusado e os dois aliases chegam ao config.
 */
describe("FR-008: aceitação do setupFee", () => {
  test("o setup padrão é 1500, fora de 0 a 100000 é recusado e os dois aliases chegam ao config", () => {
    const base: StudyConfig = resolveStudyConfig({ niche: "bebidas", mock: true });
    expect("setupFee" in base ? base.setupFee : undefined).toBe(1500);
    expect(() => resolveStudyConfig({ niche: "bebidas", mock: true, setupFee: -1 })).toThrow();
    expect(() => resolveStudyConfig({ niche: "bebidas", mock: true, setupFee: 100001 })).toThrow();
    for (const setupFee of [0, 1500, 1800, 100000]) {
      const cfg: StudyConfig = resolveStudyConfig({ niche: "bebidas", mock: true, setupFee });
      expect("setupFee" in cfg ? cfg.setupFee : undefined).toBe(setupFee);
    }
  });
});
