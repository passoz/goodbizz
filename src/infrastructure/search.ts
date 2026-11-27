/**
 * Cliente HTTP do provedor de busca no protocolo Tavily: `POST {base}/search` com Bearer e corpo
 * `{query, max_results, search_depth: "basic"}`; cada resultado traz `title`, `url` e o texto
 * extraído da página em `content`, que é o que valida o trecho literal das evidências.
 *
 * Mesma política de reenvio do LLM: 429 e 5xx são instabilidade e ganham nova tentativa; recusa de
 * credencial e pedido inválido não melhoram com reenvio. A falha sai como `SearchError` com a
 * frase que o operador lê e o detalhe cru entre parênteses, sem a chave.
 */
import { scrub } from "../config/redact.ts";
import { searchProviderNeedsKey } from "../config/providers.ts";
import { SearchError } from "../domain/errors.ts";
import type { SearchClient } from "../domain/ports.ts";
import type { ProviderUsage, SearchResult, StudyConfig } from "../domain/types.ts";
import { SearchMock } from "./search-mock.ts";

/** Resultados por busca (A-002): cinco páginas bastam e cada busca `basic` custa 1 crédito. */
export const SEARCH_MAX_RESULTS = 5;

/** Corpo de erro da Tavily (`{"detail": {"error": ...}}`) e variações de gateway. */
function errorDetail(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "sem corpo";
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const detail = record["detail"];
      if (typeof detail === "string") return detail;
      if (detail !== null && typeof detail === "object" && !Array.isArray(detail)) {
        const nested = (detail as Record<string, unknown>)["error"];
        if (typeof nested === "string") return nested;
      }
      for (const key of ["error", "message"]) {
        const value = record[key];
        if (typeof value === "string") return value;
      }
    }
  } catch {
    // corpo não-JSON (HTML de gateway): vai o texto cru, recortado
  }
  return trimmed;
}

/** Frase humana por status, no mesmo tom de `explainFailure`. */
function statusMessage(status: number, detail: string, keyless = false): string {
  const suffix = ` (detalhe: HTTP ${status}: ${detail})`;
  if (status === 401 || status === 403) {
    if (keyless) {
      return (
        "O provedor de busca bloqueou o pedido (401/403), normalmente por excesso de consultas " +
        "automaticas. Espere alguns minutos e execute o estudo de novo, ou troque SEARCH_API_URL." +
        suffix
      );
    }
    return (
      "O provedor de busca recusou a credencial (401/403). Confira a chave de busca " +
      "(SEARCH_API_KEY ou o perfil de busca em /settings)." +
      suffix
    );
  }
  if (status === 429 || status === 432 || status === 433) {
    return (
      "O provedor de busca recusou por limite de uso (429 / cota de créditos). Espere alguns minutos " +
      "ou confira os créditos do plano e execute o estudo de novo." +
      suffix
    );
  }
  if (status >= 500)
    return `O provedor de busca devolveu erro interno (5xx). Tente de novo em alguns minutos.${suffix}`;
  return `O provedor de busca recusou a busca (HTTP ${status}).${suffix}`;
}

function retryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Resultados válidos do corpo Tavily; `null` quando o corpo não segue o protocolo. */
function parseResults(body: unknown): SearchResult[] | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const results = (body as Record<string, unknown>)["results"];
  if (!Array.isArray(results)) return null;
  const parsed: SearchResult[] = [];
  for (const item of results) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const url = typeof row["url"] === "string" ? row["url"].trim() : "";
    if (url === "") continue;
    parsed.push({
      title: typeof row["title"] === "string" ? row["title"] : "",
      url,
      content: typeof row["content"] === "string" ? row["content"] : "",
    });
  }
  return parsed;
}

/** Texto do RSS sem marcação e com as entidades XML (`&amp;`, `&#39;` e as numéricas) resolvidas. */
function rssText(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resultados do RSS do Bing (`GET {base}/search?q=...&format=rss`), que não exige chave.
 * `null` quando o corpo não é o RSS (página de bloqueio ou HTML de erro).
 */
export function parseBingRss(xml: string): SearchResult[] | null {
  if (!/<rss[\s>]/i.test(xml)) return null;
  const parsed: SearchResult[] = [];
  for (const match of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const block = match[1] ?? "";
    const link = /<link>\s*([\s\S]*?)\s*<\/link>/i.exec(block)?.[1] ?? "";
    const url = rssText(link);
    if (url === "") continue;
    parsed.push({
      title: rssText(/<title>\s*([\s\S]*?)\s*<\/title>/i.exec(block)?.[1] ?? ""),
      url,
      content: rssText(/<description>\s*([\s\S]*?)\s*<\/description>/i.exec(block)?.[1] ?? ""),
    });
    if (parsed.length === SEARCH_MAX_RESULTS) break;
  }
  return parsed;
}

export class SearchHttp implements SearchClient {
  private readonly url: string;
  private readonly consumed: ProviderUsage = {
    calls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
  };

  /**
   * @param timeout segundos por chamada.
   * @param backoffMs espera base entre tentativas (cresce linear); os testes passam 0.
   */
  constructor(
    baseUrl: string,
    private readonly key: string,
    private readonly timeout = 60,
    private readonly retries = 3,
    private readonly backoffMs = 1_500,
  ) {
    this.url = baseUrl.trim().replace(/\/+$/, "") + "/search";
  }

  /** Texto de erro sem a chave (pelo valor e pelo formato de credencial). */
  private clean(text: string): string {
    return scrub(text, [this.key]).slice(0, 300);
  }

  async search(query: string): Promise<SearchResult[]> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "goodbizz/2.0",
    };
    if (this.key.trim() !== "") headers["Authorization"] = `Bearer ${this.key.trim()}`;
    const body = JSON.stringify({ query, max_results: SEARCH_MAX_RESULTS, search_depth: "basic" });
    let last: SearchError | null = null;
    for (let attempt = 0; attempt < this.retries; attempt++) {
      if (attempt > 0 && this.backoffMs > 0) {
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, this.backoffMs * attempt);
        await promise;
      }
      let response: Response;
      try {
        response = await fetch(this.url, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(this.timeout * 1000),
        });
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        last = new SearchError(
          "Não foi possível falar com o provedor de busca (rede ou DNS): a busca não chegou lá. " +
            `Confira SEARCH_API_URL e a conexão e execute o estudo de novo. (detalhe: ${this.clean(raw)})`,
        );
        continue;
      }
      if (!response.ok) {
        const detail = this.clean(errorDetail(await response.text().catch(() => "")));
        const failure = new SearchError(statusMessage(response.status, detail), response.status);
        if (!retryable(response.status)) throw failure;
        last = failure;
        continue;
      }
      let parsed: SearchResult[] | null = null;
      try {
        parsed = parseResults(await response.json());
      } catch {
        parsed = null;
      }
      if (parsed === null) {
        throw new SearchError(
          "O provedor de busca respondeu fora do protocolo Tavily (o corpo não traz a lista results). " +
            "Confira se SEARCH_API_URL aponta para a API de busca.",
          response.status,
        );
      }
      this.consumed.calls += 1;
      return parsed;
    }
    throw last ?? new SearchError("O provedor de busca não respondeu.");
  }

  /** Chamadas que chegaram ao provedor com sucesso desde o início do processo. */
  usage(): ProviderUsage {
    return { ...this.consumed };
  }
}

/** Busca sem chave pelo RSS do Bing; retomada e mensagens iguais às do protocolo Tavily. */
export class SearchBing implements SearchClient {
  private readonly url: string;
  private readonly consumed: ProviderUsage = {
    calls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
  };

  constructor(
    baseUrl: string,
    private readonly timeout = 60,
    private readonly retries = 3,
    private readonly backoffMs = 1_500,
  ) {
    const base = baseUrl.trim().replace(/\/+$/, "");
    this.url = /\/search$/i.test(base) ? base : `${base}/search`;
  }

  async search(query: string): Promise<SearchResult[]> {
    const params = new URLSearchParams({
      q: query,
      format: "rss",
      count: String(SEARCH_MAX_RESULTS * 2),
      mkt: "pt-BR",
    });
    const target = `${this.url}?${params.toString()}`;
    let last: SearchError | null = null;
    for (let attempt = 0; attempt < this.retries; attempt++) {
      if (attempt > 0 && this.backoffMs > 0) {
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, this.backoffMs * attempt);
        await promise;
      }
      let response: Response;
      try {
        response = await fetch(target, {
          headers: {
            "User-Agent": "goodbizz/2.0",
            Accept: "application/rss+xml, application/xml;q=0.9",
            "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          },
          signal: AbortSignal.timeout(this.timeout * 1000),
        });
      } catch (error) {
        const raw = error instanceof Error ? error.message : String(error);
        last = new SearchError(
          "Não foi possível falar com o provedor de busca (rede ou DNS): a busca não chegou lá. " +
            `Confira SEARCH_API_URL e a conexão e execute o estudo de novo. (detalhe: ${scrub(raw).slice(0, 300)})`,
        );
        continue;
      }
      if (!response.ok) {
        const detail = scrub(await response.text().catch(() => "")).slice(0, 300);
        const failure = new SearchError(statusMessage(response.status, detail, true), response.status);
        if (!retryable(response.status)) throw failure;
        last = failure;
        continue;
      }
      let parsed: SearchResult[] | null = null;
      try {
        parsed = parseBingRss(await response.text());
      } catch {
        parsed = null;
      }
      if (parsed === null) {
        throw new SearchError(
          "O provedor de busca respondeu fora do protocolo de busca (o corpo não é o RSS do Bing). " +
            "Confira se SEARCH_API_URL aponta para https://www.bing.com.",
          response.status,
        );
      }
      this.consumed.calls += 1;
      return parsed;
    }
    throw last ?? new SearchError("O provedor de busca não respondeu.");
  }

  usage(): ProviderUsage {
    return { ...this.consumed };
  }
}

/** Escolhe o adaptador pela URL: Bing RSS sem chave; o resto fala o protocolo Tavily. */
export function createSearch(
  baseUrl: string,
  key: string,
  timeout = 60,
  retries = 3,
  backoffMs = 1_500,
): SearchClient {
  return searchProviderNeedsKey(baseUrl)
    ? new SearchHttp(baseUrl, key, timeout, retries, backoffMs)
    : new SearchBing(baseUrl, timeout, retries, backoffMs);
}

/** Monta o cliente de busca a partir da configuração resolvida (simulado, Bing ou Tavily). */
export function createSearchClient(cfg: StudyConfig): SearchClient {
  if (cfg.mock || cfg.mockSearch) return new SearchMock();
  return createSearch(cfg.searchBaseUrl, cfg.searchApiKey, cfg.timeout);
}
