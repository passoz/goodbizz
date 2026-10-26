/**
 * Busca simulada determinística (QR-001): resultados fixos por busca, sem rede.
 *
 * Cada busca devolve até 2 páginas estáveis (URL derivada do hash da busca), com
 * conteúdo que cita a busca e traz um número — assim o extrator simulado passa na
 * validação literal do código sem nenhuma regra especial. A mesma busca repete as
 * mesmas URLs; buscas distintas devolvem páginas distintas.
 */
import type { SearchClient } from "../domain/ports.ts";
import type { ProviderUsage, SearchResult } from "../domain/types.ts";

/** Duas páginas por busca: o estudo (8) + ideias (2 por ideia) ganham evidências. */
const RESULTS_PER_QUERY = 2;

/** Hash estável (FNV-1a) para derivar URLs determinísticas da busca. */
function hashQuery(query: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < query.length; index++) {
    hash ^= query.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function slugQuery(query: string): string {
  const slug = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug === "" ? "busca" : slug;
}

export class SearchMock implements SearchClient {
  private calls = 0;

  search(query: string): Promise<SearchResult[]> {
    this.calls += 1;
    const clean = query.trim() === "" ? "o nicho" : query.trim();
    const digest = hashQuery(clean);
    const slug = slugQuery(clean);
    const results: SearchResult[] = [];
    for (let index = 0; index < RESULTS_PER_QUERY; index++) {
      results.push({
        title: `Guia ${index + 1} sobre ${clean}`,
        url: `https://mock.busca.test/${slug}/${digest}-${index + 1}`,
        content:
          `[QR-001] Resultado ${index + 1} para "${clean}". ` +
          `Levantamento com ${120 + index * 37} negócios mostra que ${clean} custa R$ ${99 + index * 41},90 por mês. ` +
          `Fonte verificada em https://mock.busca.test/${slug}/${digest}-${index + 1}.`,
      });
    }
    return Promise.resolve(results);
  }

  /** Chamadas desde o início do processo, como o cliente real. */
  usage(): ProviderUsage {
    return { calls: this.calls, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  }
}
