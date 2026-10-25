/**
 * Fase de pesquisa do estudo: o LLM planeja as buscas, o provedor de busca devolve páginas com o
 * conteúdo extraído e o LLM separa as evidências (afirmação + trecho + URL).
 *
 * Toda resposta de provedor passa pelo cache do estudo (escopo do provedor na chave): reexecutar
 * com o mesmo provedor não repete busca nem extração. Falha de busca não derruba o estudo; ela
 * vira uma linha em `issues`, com a frase humana que o adaptador já montou.
 */
import { cacheKeyFor, scopedKey } from "./cache.ts";
import type { StudyCache } from "./cache.ts";
import { EVIDENCE_SYSTEM_PROMPT, QUERIES_SYSTEM_PROMPT } from "./prompts.ts";
import { studySubject } from "../domain/naming.ts";
import { extractJson } from "../infrastructure/json.ts";
import type { LlmClient, SearchClient } from "../domain/ports.ts";
import type { Evidence, SearchResult, StudyConfig } from "../domain/types.ts";

/** Faixa de buscas do estudo (FR-002): menos que isso não cobre o nicho; mais gasta crédito à toa. */
export const MIN_QUERIES = 6;
export const MAX_QUERIES = 10;

export interface ResearchDeps {
  llm: LlmClient;
  search: SearchClient;
  cache: StudyCache;
}

export interface ResearchOutcome {
  queries: string[];
  evidences: Evidence[];
  issues: string[];
}

/** Evidência antes de ganhar o id: o id só sai depois que a ordem final é conhecida. */
type Candidate = Omit<Evidence, "id">;

/** Run `worker` over `items` with at most `limit` concurrent invocations, keeping the order. */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const size = Math.max(1, Math.floor(limit));
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index] as T;
      results[index] = await worker(item);
    }
  });
  await Promise.all(runners);
  return results;
}

/** Impressão das evidências para as chaves de cache: mudou a pesquisa, muda o texto gerado. */
export function evidenceHash(evidences: readonly Evidence[]): string {
  return cacheKeyFor(JSON.stringify(evidences));
}

/**
 * Buscas padrão, uma por tema exigido. Completam a lista quando o LLM devolve menos de
 * `MIN_QUERIES` (ou nada utilizável): o estudo nunca fica sem a cobertura mínima.
 */
function fallbackQueries(cfg: StudyConfig): string[] {
  const niche = cfg.niche.toLowerCase();
  const place = cfg.city || "Brasil";
  return [
    `software de gestão para ${niche} preço mensalidade`,
    `${niche} ${place} reclamações de clientes`,
    `custos e perdas na operação de ${niche}`,
    `número de ${niche} em ${place}`,
    `concorrentes automação WhatsApp para ${niche}`,
    `regulação e licença para ${niche}`,
  ];
}

/** Lista de buscas do JSON do LLM: strings (ou objetos com `busca`/`query`), sem repetição. */
function parseQueries(text: string): string[] {
  let raw: unknown;
  try {
    raw = extractJson(text);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const item of raw) {
    const value =
      typeof item === "string"
        ? item
        : item !== null && typeof item === "object"
          ? String((item as Record<string, unknown>).busca ?? (item as Record<string, unknown>).query ?? "")
          : "";
    const query = value.replace(/\s+/g, " ").trim();
    if (query === "" || seen.has(query.toLowerCase())) continue;
    seen.add(query.toLowerCase());
    queries.push(query);
  }
  return queries;
}

/** Buscas do estudo: as do LLM (em cache), cortadas em 10 e completadas até 6. */
async function planQueries(
  cfg: StudyConfig,
  deps: ResearchDeps,
  scope: string,
  issues: string[],
): Promise<string[]> {
  const key = scopedKey(cfg.cacheSeed, "buscas", scope, studySubject(cfg), cfg.city);
  let planned = await deps.cache.get<string[]>(key);
  if (planned === null) {
    const user =
      `Nicho: ${studySubject(cfg)}\n` +
      `Cidade ou região alvo: ${cfg.city || "não informada"}\n` +
      `Ticket mensal considerado: R$ ${cfg.monthlyTicket}\n\n` +
      `Gere de ${MIN_QUERIES} a ${MAX_QUERIES} buscas. Retorne apenas o array.`;
    planned = parseQueries(await deps.llm.generateText(QUERIES_SYSTEM_PROMPT, user));
    await deps.cache.put(key, planned);
  }
  const queries = planned.slice(0, MAX_QUERIES);
  if (queries.length < MIN_QUERIES) {
    issues.push(
      `pesquisa: o LLM devolveu ${planned.length} buscas; completei até ${MIN_QUERIES} com buscas padrão do nicho`,
    );
    const taken = new Set(queries.map((query) => query.toLowerCase()));
    for (const query of fallbackQueries(cfg)) {
      if (queries.length >= MIN_QUERIES) break;
      if (taken.has(query.toLowerCase())) continue;
      taken.add(query.toLowerCase());
      queries.push(query);
    }
  }
  return queries;
}

/** Uma busca no provedor, com cache. Falha e resultado vazio viram aviso, nunca exceção. */
async function runSearch(
  query: string,
  cfg: StudyConfig,
  deps: ResearchDeps,
  scope: string,
  issues: string[],
): Promise<SearchResult[]> {
  const key = scopedKey(cfg.cacheSeed, "busca", scope, query);
  let results = await deps.cache.get<SearchResult[]>(key);
  if (results === null) {
    try {
      results = await deps.search.search(query);
    } catch (error) {
      issues.push(`pesquisa: a busca "${query}" falhou: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
    await deps.cache.put(key, results);
  }
  if (results.length === 0) issues.push(`pesquisa: a busca "${query}" não trouxe resultado`);
  return results;
}

/** Espaços normalizados: quebra de linha e espaço duplo do conteúdo não reprovam um trecho fiel. */
function squash(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** URL comparável: sem fragmento e sem barra final (a mesma página volta assim de buscas diferentes). */
function urlKey(url: string): string {
  return url.trim().replace(/#.*$/, "").replace(/\/+$/, "");
}

/**
 * Números escritos no trecho, lidos nos dois formatos (`1.200,50` e `1,200.50`). O `valor` que o
 * extrator informou só fica se for um destes: número que não está no trecho é número inventado.
 */
function numbersIn(quote: string): number[] {
  const values: number[] = [];
  for (const token of quote.match(/\d[\d.,]*\d|\d/g) ?? []) {
    const brazilian = Number(token.replace(/\./g, "").replace(",", "."));
    const english = Number(token.replace(/,/g, ""));
    for (const value of [brazilian, english]) if (Number.isFinite(value)) values.push(value);
  }
  return values;
}

/** Texto de um campo do JSON do extrator; ausente ou de outro tipo vira "". */
function text(value: unknown): string {
  return typeof value === "string" ? squash(value) : "";
}

const KINDS: Record<string, true> = {
  concorrente: true,
  preco: true,
  reclamacao: true,
  custo: true,
  mercado: true,
  regulacao: true,
};

/**
 * Evidência candidata a partir do objeto do extrator (FR-003): o trecho precisa aparecer, com
 * espaços normalizados, no conteúdo do resultado da MESMA URL. Qualquer outra coisa é descartada.
 * @param pages URL comparável -> conteúdo normalizado dos resultados desta pesquisa.
 */
function candidateOf(raw: unknown, ideia: string, pages: ReadonlyMap<string, string>): Candidate | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const trecho = text(row.trecho);
  const url = text(row.url);
  if (trecho === "" || url === "") return null;
  const content = pages.get(urlKey(url));
  if (content === undefined || !content.includes(trecho)) return null;
  const tipo = text(row.tipo).toLowerCase();
  const informed = typeof row.valor === "number" && Number.isFinite(row.valor) ? row.valor : null;
  const valor =
    informed !== null && numbersIn(trecho).some((value) => Math.abs(value - informed) < 1e-9) ? informed : null;
  return {
    tipo: KINDS[tipo] === true ? tipo : "mercado",
    afirmacao: text(row.afirmacao) || trecho,
    trecho,
    url,
    valor,
    unidade: valor === null ? "" : text(row.unidade),
    ideia,
  };
}

/** Resultados como o extrator os lê: cada um com URL, título e o conteúdo que valida o trecho. */
function resultsBlock(query: string, results: readonly SearchResult[]): string {
  const blocks = results.map(
    (result, index) =>
      `RESULTADO ${index + 1}\nURL: ${result.url}\nTÍTULO: ${result.title}\nCONTEÚDO:\n${result.content}\nFIM DO RESULTADO`,
  );
  return `BUSCA: ${query}\n\n${blocks.join("\n\n")}`;
}

/** Tentativas de extração por busca (EC-002): JSON inválido ganha uma segunda chance, não três. */
const EXTRACTION_ATTEMPTS = 2;

/**
 * Extração de evidências de uma busca, com cache por busca e conteúdo. A resposta crua do
 * extrator fica no cache; a validação literal roda a cada leitura, então endurecer a regra vale
 * também para o que já estava gravado.
 */
async function extract(
  query: string,
  results: readonly SearchResult[],
  ideia: string,
  cfg: StudyConfig,
  deps: ResearchDeps,
  scope: string,
  issues: string[],
): Promise<Candidate[]> {
  if (results.length === 0) return [];
  const key = scopedKey(cfg.cacheSeed, "evidencias", scope, query, cacheKeyFor(JSON.stringify(results)));
  let raw = await deps.cache.get<unknown[]>(key);
  if (raw === null) {
    const user = `${resultsBlock(query, results)}\n\nExtraia as evidências desta busca. Retorne apenas o array.`;
    for (let attempt = 0; attempt < EXTRACTION_ATTEMPTS && raw === null; attempt++) {
      try {
        const parsed = extractJson(await deps.llm.generateText(EVIDENCE_SYSTEM_PROMPT, user));
        if (Array.isArray(parsed)) raw = parsed;
      } catch {
        // resposta sem JSON: a próxima volta pede de novo
      }
    }
    if (raw === null) {
      issues.push(
        `pesquisa: o extrator não devolveu JSON válido para a busca "${query}" em ${EXTRACTION_ATTEMPTS} tentativas; ` +
          "a busca ficou sem evidências",
      );
      return [];
    }
    await deps.cache.put(key, raw);
  }
  const pages = new Map(results.map((result) => [urlKey(result.url), squash(result.content)]));
  return raw.map((item) => candidateOf(item, ideia, pages)).filter((item): item is Candidate => item !== null);
}

/**
 * Tira dos resultados as URLs já vistas (EC-003): duas buscas que devolvem a mesma página geram
 * uma única entrada antes da extração, na busca que a trouxe primeiro.
 */
function unseen(results: readonly SearchResult[], seen: Set<string>): SearchResult[] {
  const fresh: SearchResult[] = [];
  for (const result of results) {
    const key = urlKey(result.url);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    fresh.push(result);
  }
  return fresh;
}

/**
 * Pesquisa do estudo: planeja as buscas, consulta o provedor e extrai as evidências, nessa ordem.
 * @param scope impressão do provedor efetivo (entra em toda chave de cache).
 */
export async function researchStudy(
  cfg: StudyConfig,
  deps: ResearchDeps,
  scope: string,
): Promise<ResearchOutcome> {
  const issues: string[] = [];
  const queries = await planQueries(cfg, deps, scope, issues);
  const found = await mapLimit(queries, cfg.concurrency, async (query) => ({
    query,
    results: await runSearch(query, cfg, deps, scope, issues),
  }));
  const seen = new Set<string>();
  const unique = found.map((item) => ({ query: item.query, results: unseen(item.results, seen) }));
  const extracted = await mapLimit(unique, cfg.concurrency, (item) =>
    extract(item.query, item.results, "", cfg, deps, scope, issues),
  );
  // O id sai da ordem das buscas, não da ordem de chegada: a mesma pesquisa dá os mesmos ids.
  const evidences = extracted.flat().map((candidate, offset) => ({ id: `E${offset + 1}`, ...candidate }));
  return { queries, evidences, issues };
}
