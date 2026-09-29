/**
 * Extracao tolerante de JSON de respostas de LLM: aceita bloco cercado por ```json,
 * JSON puro ou JSON embutido em prosa.
 */
import { ValidationError } from "../domain/errors.ts";
import { scrub } from "../config/redact.ts";

const FENCE = /```(?:json)?\s*([\s\S]+?)```/;

/** Pares de delimitadores testados, na ordem do baseline. */
const ENCLOSURES: ReadonlyArray<readonly [string, string]> = [
  ["[", "]"],
  ["{", "}"],
];

export function extractJson(text: string): unknown {
  let body = text.trim();
  const fence = FENCE.exec(body);
  if (fence) body = (fence[1] ?? "").trim();
  try {
    return JSON.parse(body);
  } catch {
    // segue para a extracao por delimitadores
  }
  for (const [open, close] of ENCLOSURES) {
    const start = body.indexOf(open);
    const end = body.lastIndexOf(close);
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(body.slice(start, end + 1));
      } catch {
        continue;
      }
    }
  }
  throw new ValidationError(`response without readable JSON: ${scrub(body.slice(0, 300))}`);
}
