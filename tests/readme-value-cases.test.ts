import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const README = readFileSync("docs/manual.md", "utf8");
const SPEC = JSON.parse(readFileSync(".specs/system.json", "utf8")) as {
  rules: Array<{ id: string; statement: string }>;
};

/** Casos da task 1.14 (SC-004): README cobre a seção 11, o setup e o guardrail; spec com BR novas. */
describe("SC-004: casos da documentação e da reconciliação", () => {
  test("o README cita a seção 11, o setup e o guardrail com regeração", () => {
    expect(README).toContain("11.");
    expect(README).toContain("--setup");
    expect(README).toContain("regenera");
  });

  test("a spec traz BR-011 e BR-012 com o texto novo", () => {
    const rules = new Map(SPEC.rules.map((rule) => [rule.id, rule.statement]));
    expect(rules.get("BR-011")).toContain("regener");
    expect(rules.get("BR-012")).toContain("11");
  });
});
