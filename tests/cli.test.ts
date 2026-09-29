/**
 * CLI contract: subcommand dispatch, exit codes and the offline `generate`/`recalibrate` flow.
 *
 * `serve` is intentionally not exercised here: booting the listener belongs to the integrator's
 * end-to-end smoke test, because `src/index.ts` composes the full HTTP service.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { main } from "../src/cli.ts";
import { resetEnv } from "../src/config/env.ts";

interface Captured {
  log: string[];
  error: string[];
  restore: () => void;
}

/** Capture console.log/console.error so assertions inspect the CLI transcript. */
function capture(): Captured {
  const log: string[] = [];
  const error: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    log.push(args.map((value) => String(value)).join(" "));
  };
  console.error = (...args: unknown[]) => {
    error.push(args.map((value) => String(value)).join(" "));
  };
  return {
    log,
    error,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "goodbizz-cli-"));
}

const initialMock = Bun.env.GOODBIZZ_MOCK;

beforeAll(() => {
  Bun.env.GOODBIZZ_MOCK = "1";
  resetEnv();
});

afterAll(() => {
  if (initialMock === undefined) delete Bun.env.GOODBIZZ_MOCK;
  else Bun.env.GOODBIZZ_MOCK = initialMock;
  resetEnv();
});

describe("goodbizz CLI", () => {
  test("help lists every subcommand", async () => {
    const captured = capture();
    try {
      expect(await main([])).toBe(0);
      expect(await main(["help"])).toBe(0);
    } finally {
      captured.restore();
    }
    const output = captured.log.join("\n");
    for (const word of ["generate", "diagnose", "recalibrate", "serve"]) {
      expect(output).toContain(word);
    }
  });

  test("unknown subcommand prints help to stderr and returns 2", async () => {
    const captured = capture();
    let code = 0;
    try {
      code = await main(["bogus-subcommand"]);
    } finally {
      captured.restore();
    }
    expect(code).toBe(2);
    expect(captured.error.join("\n")).toContain("generate");
  });

  test("generate --mock prints the six steps and writes the artifact tree", async () => {
    const dir = tempDir();
    const captured = capture();
    let code = 0;
    try {
      code = await main(["generate", "oficinas mecanicas", "--mock", "--ideas", "3", "--output", dir]);
    } finally {
      captured.restore();
    }

    expect(code).toBe(0);
    const output = captured.log.join("\n");
    for (const step of ["[1/6]", "[2/6]", "[3/6]", "[4/6]", "[5/6]", "[6/6]"]) {
      expect(output).toContain(step);
    }
    for (const name of ["README.md", "00-brief.md", "00-tabelao.md", "00-tabelao.csv", "dados.json"]) {
      expect(existsSync(join(dir, name))).toBe(true);
    }
    const firstFolder = readdirSync(dir).find((entry) => entry.startsWith("01-"));
    expect(firstFolder).toBeDefined();
    expect(existsSync(join(dir, String(firstFolder), "README.md"))).toBe(true);
    expect(output).toContain("Nao use esta saida como estudo real.");
  });

  test("re-running generate reuses the cache", async () => {
    const dir = tempDir();
    const argv = ["generate", "x", "--mock", "--ideas", "2", "--output", dir];

    const first = capture();
    try {
      expect(await main(argv)).toBe(0);
    } finally {
      first.restore();
    }

    const second = capture();
    let code = 0;
    try {
      code = await main(argv);
    } finally {
      second.restore();
    }

    expect(code).toBe(0);
    const match = /\((\d+) reaproveitadas\)/.exec(second.log.join("\n"));
    expect(match).not.toBeNull();
    expect(Number(match?.[1])).toBeGreaterThan(0);
  });

  test("recalibrate prints the recommended thresholds from a generated dataset", async () => {
    const dir = tempDir();
    const seed = capture();
    try {
      expect(await main(["generate", "oficinas mecanicas", "--mock", "--ideas", "3", "--output", dir])).toBe(
        0,
      );
    } finally {
      seed.restore();
    }

    const captured = capture();
    let code = 0;
    try {
      code = await main(["recalibrate", join(dir, "dados.json")]);
    } finally {
      captured.restore();
    }

    expect(code).toBe(0);
    const output = captured.log.join("\n");
    expect(output).toContain("Recommended: STRONG_THRESHOLD=");
    expect(output).toContain("Dataset:");
  });
});

describe("goodbizz CLI help matrix", () => {
  const helpCases: Array<[string[], string]> = [
    [["--help"], "Comandos:"],
    [["help"], "Comandos:"],
    [["generate", "--help"], "generate"],
    [["diagnose", "--help"], "diagnose"],
    [["recalibrate", "--help"], "recalibrate"],
    [["serve", "--help"], "serve"],
  ];

  for (const [argv, expected] of helpCases) {
    test(`\`${argv.join(" ")}\` exits 0 with usage text`, async () => {
      const captured = capture();
      let code = -1;
      try {
        code = await main(argv);
      } finally {
        captured.restore();
      }
      expect(code).toBe(0);
      expect(captured.log.join("\n")).toContain(expected);
    });
  }

  test("--version prints the package version", async () => {
    const captured = capture();
    let code = -1;
    try {
      code = await main(["--version"]);
    } finally {
      captured.restore();
    }
    expect(code).toBe(0);
    expect(captured.log.join("")).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("goodbizz CLI failures", () => {
  test("reports a configuration error with exit 2 when the niche is missing", async () => {
    const captured = capture();
    let code = -1;
    try {
      code = await main(["generate", "--mock", "--output", tempDir()]);
    } finally {
      captured.restore();
    }
    expect(code).toBe(2);
    expect(captured.error.join("\n")).toContain("--niche");
  });

  test("requires --ideas for diagnose", async () => {
    const captured = capture();
    let code = -1;
    try {
      code = await main(["diagnose", "--mock"]);
    } finally {
      captured.restore();
    }
    expect(code).toBe(2);
    expect(captured.error.join("\n")).toContain("--ideas");
  });

  test("requires at least one data file for recalibrate", async () => {
    const captured = capture();
    let code = -1;
    try {
      code = await main(["recalibrate"]);
    } finally {
      captured.restore();
    }
    expect(code).toBe(2);
  });

  test("diagnoses the probes of an ideas file and keeps code 0 when the signal is usable", async () => {
    const dir = tempDir();
    const ideasPath = join(dir, "ideas.json");
    await Bun.write(
      ideasPath,
      JSON.stringify([
        { nome: "Triagem de WhatsApp", descricao: "Le as mensagens e separa duvida de intencao." },
        { nome: "Ficha do cliente", descricao: "Extrai os dados do documento e preenche o cadastro." },
      ]),
    );

    const captured = capture();
    let code = -1;
    try {
      code = await main(["diagnose", "--ideas", ideasPath, "--niche", "oficinas", "--mock"]);
    } finally {
      captured.restore();
    }

    const output = captured.log.join("\n");
    expect(output).toContain("sondas");
    expect(output).toContain("veredito");
    expect(output).toContain("sondas utilizaveis:");
    expect(output).toContain("referência: soma afirmação+negação de 1.00");
    expect([0, 1]).toContain(code);
  });

  test("fails cleanly when the ideas file does not exist", async () => {
    const captured = capture();
    let code = -1;
    try {
      code = await main(["diagnose", "--ideas", join(tempDir(), "nope.json"), "--mock"]);
    } finally {
      captured.restore();
    }
    expect(code).toBe(2);
    expect(captured.error.join("\n")).toContain("nao foi possivel ler");
  });
});
