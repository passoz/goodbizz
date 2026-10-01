/**
 * Título e sujeito do estudo (PWN 0004, tasks 1.1 e 1.3).
 *
 * O título vira o cabeçalho do estudo, então a regra é de domínio: a mesma função é usada pela
 * API, pela CLI e pela interface, e o limite vale sobre o texto digitado.
 */
import { describe, expect, test } from "bun:test";

import {
  MAX_DESCRIPTION_LENGTH,
  MAX_NICHE_LENGTH,
  MIN_NICHE_LENGTH,
  nicheLengthError,
  studySubject,
  titleCase,
} from "../src/domain/naming.ts";

describe("titleCase", () => {
  test("capitaliza cada palavra e preserva os espacos", () => {
    expect(titleCase("clinicas odontologicas em cidade media")).toBe(
      "Clinicas Odontologicas Em Cidade Media",
    );
  });

  test("preserva acentos e o restante do texto", () => {
    expect(titleCase("clínicas odontológicas em cidade média")).toBe(
      "Clínicas Odontológicas Em Cidade Média",
    );
    // Só a primeira letra sobe: caixa alta digitada pelo operador não é rebaixada.
    expect(titleCase("clínica de BEBÊ")).toBe("Clínica De BEBÊ");
  });

  test("normaliza espacos em excesso e nas pontas", () => {
    expect(titleCase("   oficinas   mecanicas  ")).toBe("Oficinas Mecanicas");
  });
});

describe("nicheLengthError", () => {
  test("recusa titulo curto demais", () => {
    expect(nicheLengthError("a")).toContain(String(MIN_NICHE_LENGTH));
    expect(nicheLengthError("ab")).toBeNull();
  });

  test("recusa titulo acima do limite citando o teto", () => {
    const error = nicheLengthError("x".repeat(MAX_NICHE_LENGTH + 1));
    expect(error).toContain(String(MAX_NICHE_LENGTH));
    expect(error).toContain("descrição");
    expect(nicheLengthError("x".repeat(MAX_NICHE_LENGTH))).toBeNull();
  });

  test("o teto da descricao e maior que o do titulo", () => {
    expect(MAX_DESCRIPTION_LENGTH).toBeGreaterThan(MAX_NICHE_LENGTH);
  });
});

describe("studySubject", () => {
  test("sem descricao o sujeito e o proprio titulo", () => {
    expect(studySubject({ niche: "Clinicas", description: "" })).toBe("Clinicas");
    expect(studySubject({ niche: "Clinicas", description: "   " })).toBe("Clinicas");
  });

  test("com descricao o sujeito concatena as duas partes", () => {
    expect(studySubject({ niche: "Clinicas", description: "bairro, uma cadeira" })).toBe(
      "Clinicas — bairro, uma cadeira",
    );
  });
});
