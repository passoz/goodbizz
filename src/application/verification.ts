/**
 * Verificações estruturais dos documentos de estratégia: seções, tabelas e números.
 *
 * A regra "sem acento" do baseline foi revogada: o texto publicado é português acentuado. As
 * comparações de seção/frase abaixo ignoram acento e caixa, então o guardrail mede o conteúdo
 * (a seção existe) e não a grafia exata do modelo.
 */
import { DOC_SECTIONS } from "./prompts.ts";

/** Títulos obrigatórios, verbatim do prompt (fonte única em `prompts.ts`). */
export const REQUIRED_SECTIONS: string[] = DOC_SECTIONS;

/** Normaliza para comparação: sem diacríticos e em minúsculas. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Formata uma lista de strings como o repr de lista do Python: ['a', 'b']. */
function pyStringList(items: readonly string[]): string {
  return `[${items.map((item) => `'${item}'`).join(", ")}]`;
}

/** Reproduz str.splitlines(): quebra por CR/LF e não gera linha vazia final para o último separador. */
function splitLines(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Linha inicial de cada bloco de tabela com número de colunas inconsistente (ignora cercas de código). */
export function unalignedTables(text: string): number[] {
  const badLines: number[] = [];
  let block: Array<{ line: number; pipes: number }> = [];
  let inFence = false;
  const lines = splitLines(text);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      block = [];
      continue;
    }
    if (inFence) continue;
    if (line.trim().startsWith("|")) {
      block.push({ line: index + 1, pipes: line.split("|").length - 1 });
    } else {
      if (block.length > 1 && new Set(block.map((entry) => entry.pipes)).size > 1) {
        badLines.push(block[0]?.line ?? 0);
      }
      block = [];
    }
  }
  if (block.length > 1 && new Set(block.map((entry) => entry.pipes)).size > 1) {
    badLines.push(block[0]?.line ?? 0);
  }
  return badLines;
}

/** Equivalente ao format(value, "g") do Python (precisao 6, zeros finais removidos). */
function formatGeneral(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";
  const precision = 6;
  const rounded = Number(value.toPrecision(precision));
  if (rounded === 0) return "0";
  const exponent = Math.floor(Math.log10(Math.abs(rounded)));
  if (exponent < -4 || exponent >= precision) {
    return rounded
      .toExponential(precision - 1)
      .replace(/\.?0+(e[+-]\d+)$/, "$1")
      .replace(/e([+-])(\d)$/, "e$10$2");
  }
  const fixed = rounded.toFixed(Math.max(0, precision - 1 - exponent));
  return fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
}

/** Formas equivalentes de um número medido (o próprio valor, %g, .1f, .2f e inteiro). */
export function numberVariants(value: unknown): Set<string> {
  const raw = String(value).trim();
  const variants = new Set<string>([raw]);
  const parsed = Number(raw);
  if (raw === "" || Number.isNaN(parsed)) return variants;
  variants.add(formatGeneral(parsed));
  variants.add(parsed.toFixed(1));
  variants.add(parsed.toFixed(2));
  if (parsed === Math.trunc(parsed)) variants.add(String(Math.trunc(parsed)));
  return new Set([...variants].filter((variant) => variant.length > 0));
}

/** Retorna os problemas encontrados no documento (lista vazia = aprovado). */
export function checkDocument(
  text: string,
  numbers: readonly unknown[] = [],
  literals: readonly string[] = [],
  minLines = 80,
): string[] {
  const issues: string[] = [];
  const flat = fold(text);
  const missingSections = REQUIRED_SECTIONS.filter((section) => !flat.includes(fold(`## ${section}`)));
  if (missingSections.length > 0) {
    issues.push(`${missingSections.length} section(s) missing: ${pyStringList(missingSections)}`);
  }
  const badTables = unalignedTables(text);
  if (badTables.length > 0) {
    issues.push(`unaligned table at line(s) [${badTables.join(", ")}]`);
  }

  const checkable = numbers.filter((value) => typeof value !== "number" || value > 0);
  const tokens = new Set(text.match(/\d+[.,]?\d*/g) ?? []);
  const missingNumbers = checkable
    .filter((value) => ![...numberVariants(value)].some((variant) => tokens.has(variant)))
    .map((value) => String(value));
  if (missingNumbers.length > 0) {
    issues.push(`missing measured number(s): ${pyStringList(missingNumbers)}`);
  }

  const missingLiterals = literals.filter((literal) => !flat.includes(fold(literal)));
  if (missingLiterals.length > 0) {
    issues.push(`missing required phrase(s): ${pyStringList(missingLiterals)}`);
  }

  const lineCount = splitLines(text).length;
  if (lineCount < minLines) {
    issues.push(`document too short: ${lineCount} lines (min ${minLines})`);
  }
  return issues;
}
