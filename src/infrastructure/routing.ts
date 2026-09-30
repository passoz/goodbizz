/**
 * Clientes que resolvem a configuração a cada chamada, para que a aba `/settings` valha sem
 * reiniciar o processo.
 *
 * O cliente HTTP concreto só é trocado quando a configuração muda (impressão digital do objeto);
 * o consumo acumulado sobrevive à troca, então a medição por estudo continua correta depois de
 * uma edição de URL/chave.
 */
import type { ProviderConfig } from "../config/providers.ts";
import type { DeciderClient, LlmClient } from "../domain/ports.ts";
import type { DeciderAnswers, ProviderUsage, QuestionSet } from "../domain/types.ts";
import { DeciderHttp } from "./decider.ts";
import { DeciderMock } from "./decider-mock.ts";
import { LlmHttp } from "./llm.ts";
import { LlmMock } from "./llm-mock.ts";

const ZERO: ProviderUsage = { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

/** Soma dois consumos (usado ao aposentar um cliente trocado). */
export function sumUsage(left: ProviderUsage, right: ProviderUsage | undefined): ProviderUsage {
  const other = right ?? ZERO;
  return {
    calls: left.calls + other.calls,
    inputTokens: left.inputTokens + other.inputTokens,
    cachedInputTokens: left.cachedInputTokens + other.cachedInputTokens,
    outputTokens: left.outputTokens + other.outputTokens,
  };
}

export interface RoutingOptions {
  /** Configuração efetiva no momento da chamada (settings sobre ambiente). */
  resolve: () => ProviderConfig;
  /** Simulação pedida por ambiente (`GOODBIZZ_MOCK_*`): ignora URL e chave. */
  mock: boolean;
  timeout?: number;
}

export class RoutingLlmClient implements LlmClient {
  private inner: LlmClient | null = null;
  private fingerprint = "";
  private retired: ProviderUsage = { ...ZERO };

  constructor(private readonly options: RoutingOptions) {}

  private client(): LlmClient {
    const cfg = this.options.resolve();
    const fingerprint = `${cfg.llmBaseUrl}|${cfg.llmModel}|${cfg.llmApiKey}`;
    if (this.inner === null || fingerprint !== this.fingerprint) {
      this.retired = sumUsage(this.retired, this.inner?.usage?.());
      this.inner = this.options.mock
        ? new LlmMock()
        : new LlmHttp(cfg.llmBaseUrl, cfg.llmModel, cfg.llmApiKey, this.options.timeout ?? 60);
      this.fingerprint = fingerprint;
    }
    const inner = this.inner;
    if (inner === null) throw new Error("LLM client não inicializado");
    return inner;
  }

  generateText(system: string, user: string): Promise<string> {
    return this.client().generateText(system, user);
  }

  /** Consumo acumulado, incluindo o dos clientes já trocados por mudança de configuração. */
  usage(): ProviderUsage {
    return sumUsage(this.retired, this.inner?.usage?.());
  }
}

export class RoutingDeciderClient implements DeciderClient {
  private inner: DeciderClient | null = null;
  private fingerprint = "";
  private retired: ProviderUsage = { ...ZERO };

  constructor(private readonly options: RoutingOptions) {}

  private client(): DeciderClient {
    const cfg = this.options.resolve();
    const fingerprint = `${cfg.deciderUrl}|${cfg.deciderModel}|${cfg.deciderApiKey}`;
    if (this.inner === null || fingerprint !== this.fingerprint) {
      this.retired = sumUsage(this.retired, this.inner?.usage?.());
      this.inner =
        this.options.mock || cfg.deciderUrl.trim().length === 0
          ? new DeciderMock()
          : new DeciderHttp(cfg.deciderUrl, cfg.deciderModel, cfg.deciderApiKey, this.options.timeout ?? 60);
      this.fingerprint = fingerprint;
    }
    const inner = this.inner;
    if (inner === null) throw new Error("decisor não inicializado");
    return inner;
  }

  ask(state: string, questions: QuestionSet): Promise<DeciderAnswers> {
    return this.client().ask(state, questions);
  }

  queryProbes(state: string, probes: Record<string, string>): Promise<Record<string, number>> {
    return this.client().queryProbes(state, probes);
  }

  usage(): ProviderUsage {
    return sumUsage(this.retired, this.inner?.usage?.());
  }
}
