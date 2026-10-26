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

/**
 * Extrai do documento os valores em R$, os percentuais e as quantidades de
 * minutos, horas, dias, semanas ou meses que não estão no conjunto permitido
 * nem na mesma linha de `[INFERENCE]`.
 *
 * Normaliza formatos ("R$ 350,00" e "350 reais" contam como o permitido 350)
 * e ignora numeração estrutural (seção "11.4", item de lista "1." e célula de
 * tabela como "Mês 2").
 */
export function extractUnsourcedNumbers(text: string, allowed: readonly string[] = []): string[] {
  const permitted = new Set<string>();
  for (const entry of allowed) {
    for (const variant of normalizeNumber(String(entry))) permitted.add(variant);
  }
  const found: string[] = [];
  const timeUnits = "(minutos?|horas?|dias?|semanas?|meses?|min|h)";
  const pattern = new RegExp(
    `R\\$\\s*\\d[\\d.,]*|\\d[\\d.,]*\\s*reais|\\d[\\d.,]*\\s*%|\\d[\\d.,]*\\s*${timeUnits}\\b`,
    "gi",
  );
  const lines = splitLines(text);
  for (const line of lines) {
    if (line.includes("[INFERENCE]")) continue;
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(line)) !== null) {
      const raw = match[0];
      if (isStructuralNumber(line, match.index, raw)) continue;
      const normalized = normalizeNumber(raw);
      if (normalized.some((variant) => permitted.has(variant))) continue;
      found.push(raw.trim());
    }
  }
  return found;
}

/** Normaliza um número para comparação: remove "R$", "reais", "%", unidade de tempo e separadores. */
function normalizeNumber(raw: string): string[] {
  let cleaned = raw
    .toLowerCase()
    .replace(/r\$/g, "")
    .replace(/\breais\b/g, "")
    .replace(/%/g, "")
    .replace(/\b(minutos?|horas?|dias?|semanas?|meses?|min|h)\b/g, "")
    .trim();
  cleaned = cleaned.replace(/,(\d{2})\b/g, ".$1");
  const variants = new Set<string>();
  variants.add(cleaned.replace(/[.\s]/g, "").replace(/,+/g, ""));
  const dotted = cleaned.replace(/\s+/g, "");
  const asNumber = Number(dotted.replace(/,(?=\d+$)/, ".").replace(/[.](?=.*[.])/g, ""));
  if (!Number.isNaN(asNumber) && dotted !== "") {
    variants.add(String(asNumber));
    variants.add(formatGeneral(asNumber));
    if (Number.isInteger(asNumber)) variants.add(String(Math.trunc(asNumber)));
  }
  return [...variants].filter((variant) => variant.length > 0);
}

/**
 * Diz se o número é numeração estrutural: título de seção ("## 11."),
 * item de lista ("1.") ou célula de tabela ("Mês 2").
 */
function isStructuralNumber(line: string, index: number, raw: string): boolean {
  const trimmed = line.trimStart();
  if (/^#{1,6}\s*\d/.test(trimmed) && index <= trimmed.indexOf(raw.trim()) + 4) {
    if (/^#{1,6}\s*\d+[.\d]*\b/.test(trimmed)) return true;
  }
  if (/^\d+\.\s/.test(trimmed)) return true;
  if (line.includes("|") && /^(mês|mes)\s+\d+$/i.test(raw.trim())) return true;
  if (/^(mês|mes)\s+\d+$/i.test(raw.trim())) return true;
  return false;
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
