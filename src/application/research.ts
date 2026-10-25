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

/** Texto de um campo do JSON do extrator; ausente ou de outro tipo vira "". */
function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

const KINDS: Record<string, true> = {
  concorrente: true,
  preco: true,
  reclamacao: true,
  custo: true,
  mercado: true,
  regulacao: true,
};

/** Evidência candidata a partir do objeto do extrator; sem trecho ou URL não há o que citar. */
function candidateOf(raw: unknown, ideia: string): Candidate | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const trecho = text(row.trecho);
  const url = text(row.url);
  if (trecho === "" || url === "") return null;
  const tipo = text(row.tipo).toLowerCase();
  const valor = typeof row.valor === "number" && Number.isFinite(row.valor) ? row.valor : null;
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

/** Extração de evidências de uma busca, com cache por busca e conteúdo. */
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
    let parsed: unknown;
    try {
      parsed = extractJson(await deps.llm.generateText(EVIDENCE_SYSTEM_PROMPT, user));
    } catch {
      parsed = null;
    }
    if (!Array.isArray(parsed)) {
      issues.push(`pesquisa: o extrator não devolveu JSON válido para a busca "${query}"`);
      return [];
    }
    raw = parsed;
    await deps.cache.put(key, raw);
  }
  return raw.map((item) => candidateOf(item, ideia)).filter((item): item is Candidate => item !== null);
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
  const extracted = await mapLimit(found, cfg.concurrency, (item) =>
    extract(item.query, item.results, "", cfg, deps, scope, issues),
  );
  // O id sai da ordem das buscas, não da ordem de chegada: a mesma pesquisa dá os mesmos ids.
  const evidences = extracted.flat().map((candidate, offset) => ({ id: `E${offset + 1}`, ...candidate }));
  return { queries, evidences, issues };
}
