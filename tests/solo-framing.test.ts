import { describe, expect, test } from "bun:test";
import { DOC_SYSTEM_PROMPT, IDEAS_SYSTEM_PROMPT } from "../src/application/prompts.ts";

/**
 * Aceitação da task 1.5 (FR-005): enquadramento do consultor solo.
 * Espia os prompts: os dois descrevem o operador como consultor solo e vetam o plano de startup.
 */

describe("FR-005: aceitação do consultor solo", () => {
  test("os prompts enquadram o consultor solo e proíbem o plano de startup", () => {
    for (const prompt of [IDEAS_SYSTEM_PROMPT, DOC_SYSTEM_PROMPT]) {
      expect(prompt).toContain("consultor solo");
      expect(prompt).toContain("setup");
      expect(prompt).toContain("mensalidade");
      expect(prompt).toContain("software próprio");
      expect(prompt).toContain("equipe de vendas");
      expect(prompt).toContain("expansão regional");
      expect(prompt).toContain("LTV/CAC");
    }
  });
});
