import { describe, expect, test } from "bun:test";

const read = (relative: string) => Bun.file(new URL(relative, import.meta.url)).text();

describe("toolchain contract", () => {
  test(".env.example declares the four canonical provider keys", async () => {
    const example = await read("../.env.example");
    for (const key of ["LLM_API_URL", "LLM_API_KEY", "DECISION_API_URL", "DECISION_API_KEY"]) {
      expect(example).toContain(`${key}=`);
    }
    expect(example).not.toContain("GOODBIZZ_LLM_KEY");
    expect(example).not.toContain("GOODBIZZ_DECISOR_URL");
  });

  test("package.json exposes the single-command gates", async () => {
    const pkg = JSON.parse(await read("../package.json")) as { scripts: Record<string, string> };
    for (const script of ["check", "test", "lint", "format:check", "start", "cli"]) {
      expect(pkg.scripts[script]).toBeString();
    }
    expect(pkg.scripts.check).toContain("tsc");
  });

  test("tsconfig is strict and uses the Hono JSX runtime", async () => {
    const tsconfig = JSON.parse(await read("../tsconfig.json")) as {
      compilerOptions: Record<string, unknown>;
    };
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.jsx).toBe("react-jsx");
    expect(tsconfig.compilerOptions.jsxImportSource).toBe("hono/jsx");
  });

  test("bunfig enforces the coverage gate", async () => {
    const bunfig = await read("../bunfig.toml");
    expect(bunfig).toContain("coverageThreshold");
  });
});
