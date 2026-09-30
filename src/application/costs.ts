/**
 * Estimativa de custo de um estudo a partir do consumo medido.
 *
 * Os preços vêm do ambiente (`GOODBIZZ_PRICE_*`), porque o custo depende do plano/roteador de quem
 * opera — o código não tem como adivinhar. Os padrões são o preço de tabela do `deepseek-v4-flash`
 * (o modelo configurado no 9router deste deployment): US$ 0,14/1M de entrada, US$ 0,0028/1M de
 * entrada em cache e US$ 0,28/1M de saída. O decisor System One (motor `jev` do 9router) é grátis,
 * então o padrão dele é zero — troque se o seu decisor for pago.
 */
import { loadEnv } from "../config/env.ts";
import type { ProviderUsage, StudyUsage } from "../domain/types.ts";

export interface PriceTable {
  /** US$ por 1M de tokens de entrada cobrados cheio. */
  llmInputPerMTok: number;
  /** US$ por 1M de tokens de entrada servidos do cache. */
  llmCachedInputPerMTok: number;
  /** US$ por 1M de tokens de saída. */
  llmOutputPerMTok: number;
  deciderInputPerMTok: number;
  deciderOutputPerMTok: number;
  /** Cotação usada só para exibir em R$; 0 desliga a conversão. */
  usdBrl: number;
}

export interface CostEstimate {
  usd: number;
  brl: number | null;
  /** Base do cálculo, para o usuário saber o que está sendo assumido. */
  note: string;
}

/** Tabela de preços efetiva (ambiente). */
export function pricesFromEnv(): PriceTable {
  const env = loadEnv();
  return {
    llmInputPerMTok: env.GOODBIZZ_PRICE_LLM_INPUT_PER_MTOK,
    llmCachedInputPerMTok: env.GOODBIZZ_PRICE_LLM_CACHED_INPUT_PER_MTOK,
    llmOutputPerMTok: env.GOODBIZZ_PRICE_LLM_OUTPUT_PER_MTOK,
    deciderInputPerMTok: env.GOODBIZZ_PRICE_DECIDER_INPUT_PER_MTOK,
    deciderOutputPerMTok: env.GOODBIZZ_PRICE_DECIDER_OUTPUT_PER_MTOK,
    usdBrl: env.GOODBIZZ_USD_BRL,
  };
}

function tokensCost(
  usage: ProviderUsage,
  inputPerMTok: number,
  cachedPerMTok: number,
  outputPerMTok: number,
): number {
  const billedInput = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    (billedInput / 1_000_000) * inputPerMTok +
    (usage.cachedInputTokens / 1_000_000) * cachedPerMTok +
    (usage.outputTokens / 1_000_000) * outputPerMTok
  );
}

/** Arredonda para 6 casas: custo de estudo é fração de centavo e não quer barulho de float. */
function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Custo estimado com a tabela do ambiente; `null` quando o estudo não tem consumo medido. */
export function estimateCost(
  usage: StudyUsage | null,
  prices: PriceTable = pricesFromEnv(),
): CostEstimate | null {
  if (usage === null) return null;
  const usd = round6(
    tokensCost(usage.llm, prices.llmInputPerMTok, prices.llmCachedInputPerMTok, prices.llmOutputPerMTok) +
      tokensCost(
        usage.decider,
        prices.deciderInputPerMTok,
        prices.deciderInputPerMTok,
        prices.deciderOutputPerMTok,
      ),
  );
  const brl = prices.usdBrl > 0 ? round6(usd * prices.usdBrl) : null;
  const deciderFree = prices.deciderInputPerMTok + prices.deciderOutputPerMTok === 0;
  return {
    usd,
    brl,
    note:
      `estimativa com preços de tabela: US$ ${prices.llmInputPerMTok}/1M entrada, ` +
      `US$ ${prices.llmCachedInputPerMTok}/1M entrada em cache, US$ ${prices.llmOutputPerMTok}/1M saída` +
      (deciderFree
        ? "; decisor a custo zero"
        : `; decisor US$ ${prices.deciderInputPerMTok}/1M entrada e US$ ${prices.deciderOutputPerMTok}/1M saída`),
  };
}
