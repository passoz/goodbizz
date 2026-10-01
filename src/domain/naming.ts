/**
 * Nome do estudo: o título exibido e o sujeito enviado aos provedores.
 *
 * Puro e de domínio: sem rede, sem banco e sem relógio, para que a API, a CLI e a interface
 * apliquem exatamente a mesma regra. O título é o que o operador lê no cartão da lista e no
 * cabeçalho do estudo, então o comprimento é limitado no texto digitado.
 */
import type { StudyConfig } from "./types.ts";

/** Teto do título, medido no texto digitado (o mesmo limite do `maxlength` da interface). */
export const MAX_NICHE_LENGTH = 50;
/** Piso do título: uma palavra de uma letra não identifica estudo nenhum. */
export const MIN_NICHE_LENGTH = 2;
/** Teto da descrição de contexto: é um parágrafo curto, não um briefing. */
export const MAX_DESCRIPTION_LENGTH = 300;

/** Primeira letra de cada palavra; preserva acentos, pontuação e o restante do texto. */
const CAPITALIZE = /(^|\s)(\p{L})/gu;

/**
 * Título do estudo: espaços normalizados e cada palavra capitalizada.
 * `clinicas odontologicas em cidade media` -> `Clinicas Odontologicas Em Cidade Media`.
 */
export function titleCase(raw: string): string {
  return raw
    .replace(/\s+/gu, " ")
    .trim()
    .replace(CAPITALIZE, (_match, space: string, letter: string) => `${space}${letter.toUpperCase()}`);
}

/** Texto não vazio quando o título digitado está fora do limite; `null` quando está dentro. */
export function nicheLengthError(raw: string): string | null {
  if (raw.length < MIN_NICHE_LENGTH) {
    return `o nicho precisa de pelo menos ${MIN_NICHE_LENGTH} caracteres`;
  }
  if (raw.length > MAX_NICHE_LENGTH) {
    return (
      `o nicho precisa ter no máximo ${MAX_NICHE_LENGTH} caracteres (veio com ${raw.length}); ` +
      "mova o detalhe para a descrição"
    );
  }
  return null;
}

/**
 * Sujeito do estudo: o título com a descrição concatenada, enviado aos provedores.
 * Sem descrição o sujeito é o próprio título, para o texto enviado não mudar.
 */
export function studySubject(cfg: Pick<StudyConfig, "niche" | "description">): string {
  const description = cfg.description.trim();
  return description === "" ? cfg.niche : `${cfg.niche} — ${description}`;
}
