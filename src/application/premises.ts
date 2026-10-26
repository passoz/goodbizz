/**
 * Chamada de premissas por ideia (FR-001): o LLM declara de 2 a 4 fatores positivos
 * com unidade e uma recuperação entre 0 e 1, cada fonte é um id de evidência do
 * estudo ou `INFERENCE`, e o código valida tudo antes de calcular o valor.
 */
import { ValidationError } from "../domain/errors.ts";
import { extractJson } from "../infrastructure/json.ts";
import type { LlmClient } from "../domain/ports.ts";
import type { Evidence, StudyConfig } from "../domain/types.ts";

/** Uma premissa de perda: quanto de quê, e de onde veio o número. */
export interface Premise {
  /** Nome do fator (ex.: "horas perdidas por mês"). */
  nome: string;
  /** Valor positivo do fator. */
  valor: number;
  /** Unidade do fator (ex.: "horas/mês", "R$"). */
  unidade: string;
  /** Id de evidência existente (`E#`) ou `INFERENCE`. */
  fonte: string;
}

/** Premissas validadas de uma ideia: os fatores e a fração recuperável. */
export interface PremisesResult {
  fatores: Premise[];
  /** Fração da perda que vira ganho (0 a 1). */
  recuperacao: number;
}

/** Tentativas de chamada ao LLM por ideia (FR-001): JSON inválido ganha uma segunda chance. */
export const PREMISE_ATTEMPTS = 2;

export const PREMISES_SYSTEM_PROMPT = `PALAVRA-CHAVE: PREMISSAS
Você declara as premissas da conta de retorno de uma ideia de automação para um pequeno negócio.
Responda SOMENTE um objeto JSON, sem texto em volta, no formato:
{"fatores": [{"nome": "...", "valor": 0, "unidade": "...", "fonte": "E1"}], "recuperacao": 0.5}
Regras:
- "fatores" tem de 2 a 4 itens: quantidades POSITIVAS que, multiplicadas, dão a perda mensal em R$.
- Cada fator informa "unidade" (ex.: "horas/mês", "atendimentos/mês", "R$").
- "recuperacao" é um número entre 0 e 1: a fração da perda que a automação recupera.
- "fonte" é o id da evidência que sustenta o número (formato [E#], só id que está na lista
  recebida) ou "INFERENCE" quando é estimativa sem evidência.
- As CHAVES do JSON ("fatores", "nome", "valor", "unidade", "fonte", "recuperacao") ficam
  exatamente assim, sem acento.`;

/** Bloco de evidências citáveis para o prompt de premissas. */
function citableEvidences(evidences: readonly Evidence[]): string {
  if (evidences.length === 0) return "Sem evidências pesquisadas: declare todas as fontes como INFERENCE.";
  return evidences.map((evidence) => `${evidence.id}: ${evidence.afirmacao}`).join("\n");
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function isEvidenceId(source: string, known: ReadonlySet<string>): boolean {
  return /^E\d+$/.test(source) && known.has(source);
}

/**
 * Valida as premissas cruas do LLM. Fonte que não é id existente vira `INFERENCE` com
 * correção registrada; qualquer outra violação (contagem de fatores, valor não positivo,
 * recuperação fora de 0 a 1) rejeita o conjunto inteiro.
 */
export function validatePremises(
  raw: unknown,
  evidences: readonly Evidence[],
  corrections: string[],
): PremisesResult | null {
  const root = asRecord(raw);
  const rawFactors = root["fatores"];
  if (!Array.isArray(rawFactors) || rawFactors.length < 2 || rawFactors.length > 4) return null;
  const known = new Set(evidences.map((evidence) => evidence.id));
  const fatores: Premise[] = [];
  for (const entry of rawFactors) {
    const item = asRecord(entry);
    const nome = typeof item["nome"] === "string" ? (item["nome"] as string).trim() : "";
    const valor = item["valor"];
    const unidade = typeof item["unidade"] === "string" ? (item["unidade"] as string).trim() : "";
    const fonte = typeof item["fonte"] === "string" ? (item["fonte"] as string).trim() : "";
    if (nome === "" || typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) return null;
    if (unidade === "" || fonte === "") return null;
    if (fonte === "INFERENCE") {
      fatores.push({ nome, valor, unidade, fonte });
    } else if (isEvidenceId(fonte, known)) {
      fatores.push({ nome, valor, unidade, fonte });
    } else {
      corrections.push(`fonte ${fonte} inexistente virou INFERENCE`);
      fatores.push({ nome, valor, unidade, fonte: "INFERENCE" });
    }
  }
  const recuperacao = root["recuperacao"];
  if (
    typeof recuperacao !== "number" ||
    !Number.isFinite(recuperacao) ||
    recuperacao < 0 ||
    recuperacao > 1
  ) {
    return null;
  }
  return { fatores, recuperacao };
}

/**
 * Pede as premissas de uma ideia ao LLM, com uma repetição em JSON inválido. Devolve
 * `null` quando as duas tentativas falham: a ideia segue sem bloco de valor e o estudo
 * registra em `issues`.
 */
export async function requestPremises(
  llm: LlmClient,
  cfg: StudyConfig,
  ideaName: string,
  ideaDescription: string,
  evidences: readonly Evidence[],
): Promise<{ premises: PremisesResult | null; corrections: string[] }> {
  const corrections: string[] = [];
  const user =
    `Ideia: ${ideaName}\nDescrição: ${ideaDescription}\nNicho: ${cfg.niche}` +
    (cfg.city ? ` | Cidade/região: ${cfg.city}` : "") +
    `\n\nEvidências citáveis:\n${citableEvidences(evidences)}\n\nDeclare as premissas desta ideia.`;
  for (let attempt = 0; attempt < PREMISE_ATTEMPTS; attempt += 1) {
    let text: string;
    try {
      text = await llm.generateText(PREMISES_SYSTEM_PROMPT, user);
    } catch {
      continue;
    }
    let parsed: unknown = null;
    try {
      parsed = extractJson(text);
    } catch (error) {
      if (!(error instanceof ValidationError)) throw error;
      continue;
    }
    const validated = validatePremises(parsed, evidences, corrections);
    if (validated !== null) return { premises: validated, corrections };
  }
  return { premises: null, corrections };
}
