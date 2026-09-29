/**
 * Normalizacao de artefatos Markdown: remove acentos antes de publicar os documentos.
 * Reexporta a implementacao de `verification.ts` para manter uma unica fonte de verdade.
 */

export { stripAccents } from "./verification.ts";
export { normalizeMarkdownFiles as removeAccentsFromMarkdown } from "./verification.ts";
