import { describe, expect, test } from "bun:test";
import { DOC_SYSTEM_PROMPT, IDEAS_SYSTEM_PROMPT } from "../src/application/prompts.ts";

/**
 * Casos da task 1.5 (FR-005): enquadramento do consultor solo.
 * RED: sem o enquadramento, os prompts não citam consultor solo nem as proibições.
 */

describe("FR-005: enquadramento do consultor solo", () => {
  test("os dois prompts citam consultor solo, n8n, WhatsApp, 2 semanas e setup mais mensalidade", () => {
    for (const prompt of [IDEAS_SYSTEM_PROMPT, DOC_SYSTEM_PROMPT]) {
      expect(prompt).toContain("consultor solo");
      expect(prompt).toContain("n8n");
      expect(prompt).toContain("WhatsApp");
      expect(prompt).toContain("2 semanas");
      expect(prompt).toContain("setup");
      expect(prompt).toContain("mensalidade");
    }
  });

  test("os dois prompts vetam software próprio, equipe de vendas, expansão regional e LTV/CAC", () => {
    for (const prompt of [IDEAS_SYSTEM_PROMPT, DOC_SYSTEM_PROMPT]) {
      expect(prompt).toContain("software próprio");
      expect(prompt).toContain("equipe de vendas");
      expect(prompt).toContain("expansão regional");
      expect(prompt).toContain("LTV/CAC");
    }
  });
});
