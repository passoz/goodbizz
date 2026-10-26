import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const README = readFileSync("README.md", "utf8");
const SPEC = JSON.parse(readFileSync(".specs/system.json", "utf8")) as {
  rules: Array<{ id: string; statement: string }>;
};

/**
 * Aceitação da task 1.14 (SC-004): o README cobre a seção 11, o setup e o
 * guardrail, e a spec passa na validação com as regras novas.
 */
describe("SC-004: aceitação da documentação e da reconciliação", () => {
  test("o README cobre a seção 11, o setup e o guardrail e a spec traz BR-011 e BR-012 novas", () => {
    expect(README).toContain("11. Proposta");
    expect(README).toContain("--setup");
    expect(README).toContain("setup_fee");
    expect(README).toContain("Payback");
    expect(README).toContain("regenera");
    const rules = new Map(SPEC.rules.map((rule) => [rule.id, rule.statement]));
    expect(rules.get("BR-011")).toContain("regener");
    expect(rules.get("BR-011")).toContain("INFERENCE");
    expect(rules.get("BR-012")).toContain("11");
    expect(rules.get("BR-012")).toContain("Proposta de valor");
  });
});
