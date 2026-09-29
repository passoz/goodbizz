/**
 * Verificacoes estruturais dos documentos de estrategia: secoes, acentos, tabelas e numeros.
 */

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Titulos obrigatorios, verbatim do baseline. */
export const REQUIRED_SECTIONS: string[] = [
  "1. Resumo executivo",
  "2. Indicadores coletados",
  "3. Como funciona",
  "4. Estrategia de venda",
  "5. Estrategia de marketing",
  "6. Precificacao e economia unitaria",
  "7. SWOT",
  "8. Business Model Canvas",
  "9. Ferramentas complementares",
  "10. Proximos passos",
];

const ACC = /[áàâãäçéèêëíìîïñóòôõöúùûüÁÀÂÃÄÇÉÈÊËÍÌÎÏÑÓÒÔÕÖÚÙÛÜ]/;
const ACC_GLOBAL = /[áàâãäçéèêëíìîïñóòôõöúùûüÁÀÂÃÄÇÉÈÊËÍÌÎÏÑÓÒÔÕÖÚÙÛÜ]/g;

/** Remove diacriticos/acentos combinantes do texto. */
export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "");
}

/** Indica se o texto contem letras latinas acentuadas. */
export function hasAccents(text: string): boolean {
  return ACC.test(text);
}

/** Formata uma lista de strings como o repr de lista do Python: ['a', 'b']. */
function pyStringList(items: readonly string[]): string {
  return `[${items.map((item) => `'${item}'`).join(", ")}]`;
}

/** Reproduz str.splitlines(): quebra por CR/LF e nao gera linha vazia final para o ultimo separador. */
function splitLines(text: string): string[] {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/** Linha inicial de cada bloco de tabela com numero de colunas inconsistente (ignora cercas de codigo). */
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

/** Formas equivalentes de um numero medido (o proprio valor, %g, .1f, .2f e inteiro). */
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
  const missingSections = REQUIRED_SECTIONS.filter((section) => !text.includes(`## ${section}`));
  if (missingSections.length > 0) {
    issues.push(`${missingSections.length} section(s) missing: ${pyStringList(missingSections)}`);
  }
  const accentCount = text.match(ACC_GLOBAL)?.length ?? 0;
  if (accentCount > 0) {
    issues.push(`${accentCount} accented character(s)`);
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

  const missingLiterals = literals.filter((literal) => !text.toLowerCase().includes(literal.toLowerCase()));
  if (missingLiterals.length > 0) {
    issues.push(`missing required phrase(s): ${pyStringList(missingLiterals)}`);
  }

  const lineCount = splitLines(text).length;
  if (lineCount < minLines) {
    issues.push(`document too short: ${lineCount} lines (min ${minLines})`);
  }
  return issues;
}

/** Remove acentos de todos os arquivos .md sob `root`. Retorna os caminhos modificados. */
export function normalizeMarkdownFiles(root: string): string[] {
  const found: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop() ?? "";
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) found.push(full);
    }
  }
  found.sort();
  const modified: string[] = [];
  for (const file of found) {
    const content = readFileSync(file, "utf8");
    if (!hasAccents(content)) continue;
    writeFileSync(file, stripAccents(content), "utf8");
    modified.push(file);
  }
  return modified;
}
