/**
 * Cliente HTTP minimo para endpoints compativeis com chat/completions (OpenAI),
 * com reenvio e backoff linear. Sem dependencias externas.
 */
import type { LlmClient } from "../domain/ports.ts";
import type { StudyConfig } from "../domain/types.ts";
import { LlmError } from "../domain/errors.ts";
import type { ProviderUsage } from "../domain/types.ts";
import { scrub } from "../config/redact.ts";
import { LlmMock } from "./llm-mock.ts";

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

/** Corpo de erro no formato OpenAI; o `message` é o que o operador precisa ler. */
interface ProviderErrorBody {
  error?: { message?: string } | string;
}

/**
 * Política de reenvio, na mesma forma do `DeciderHttp`: status determinístico
 * (400, 401, 402, 403, 404 e 422 — recusa do pedido, credencial, saldo, modelo)
 * não melhora com uma segunda tentativa; 429 e 5xx são instabilidade do provedor.
 * Qualquer outro status também aborta: reenviar para status desconhecido foi
 * exatamente o que queimou tentativas no incidente de saldo zerado.
 */
function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Falha de status transitório: carrega o status para a mensagem final de exaustão. */
class ProviderStatusError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Extrai a mensagem do corpo de erro do provedor.
 * Corpo não-JSON (HTML de gateway, texto puro) vira `null` em vez de `SyntaxError`.
 */
async function readProviderError(response: Response): Promise<string | null> {
  let raw: string;
  try {
    raw = await response.text();
  } catch {
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  try {
    const parsed = JSON.parse(trimmed) as ProviderErrorBody;
    const detail = parsed.error;
    if (typeof detail === "string") return detail;
    return detail?.message ?? null;
  } catch {
    return null;
  }
}

/** Monta a mensagem de falha preservando o status e o texto do provedor, sem vazar segredo. */
async function providerErrorMessage(response: Response): Promise<string> {
  const detail = await readProviderError(response);
  if (detail !== null) return `provider error ${response.status}: ${detail}`;
  return `provider error ${response.status}: response not json: status=${response.status}`;
}

/** Soma consumo informado pelo provedor no formato OpenAI (`usage`). */
function addUsage(target: ProviderUsage, usage: ChatCompletion["usage"]): void {
  target.calls += 1;
  target.inputTokens += usage?.prompt_tokens ?? 0;
  target.cachedInputTokens += usage?.prompt_tokens_details?.cached_tokens ?? 0;
  target.outputTokens += usage?.completion_tokens ?? 0;
}

export class LlmHttp implements LlmClient {
  private readonly url: string;
  private readonly consumed: ProviderUsage = {
    calls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
  };

  constructor(
    baseUrl: string,
    private readonly model: string,
    private readonly key: string,
    private readonly timeout = 60,
    private readonly retries = 3,
  ) {
    this.url = baseUrl.replace(/\/+$/, "") + "/chat/completions";
  }

  async generateText(system: string, user: string): Promise<string> {
    const payload = JSON.stringify({
      model: this.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
      // Explicito de proposito: a API da OpenAI assume `false`, mas gateways compativeis (LiteLLM e
      // afins) fazem streaming por padrao, e ai a resposta vem em text/event-stream e nao e um JSON
      // unico. Declarar o comportamento esperado e o certo do lado do cliente.
      stream: false,
    });
    let lastError: unknown;
    for (let attempt = 0; attempt < this.retries; attempt++) {
      try {
        const response = await fetch(this.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.key}`,
          },
          body: payload,
          signal: AbortSignal.timeout(this.timeout * 1000),
        });
        // Sem esta checagem, um corpo de erro sem `choices` cai no extrator de conteudo e a
        // mensagem real do provedor (saldo, credencial, modelo) se perde num erro de parsing.
        if (!response.ok) {
          const message = scrub(await providerErrorMessage(response));
          if (!isRetryableStatus(response.status)) throw new LlmError(message);
          throw new ProviderStatusError(response.status, message);
        }
        const data = (await response.json()) as ChatCompletion;
        addUsage(this.consumed, data.usage);
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== "string") throw new Error("response missing choices[0].message.content");
        return content;
      } catch (error) {
        // Falha de status não retentável sobe direto: reenviar seria chamar de novo um
        // provedor que já recusou, gastando tempo sem chance de sucesso.
        if (error instanceof LlmError) throw error;
        lastError = error;
        if (attempt < this.retries - 1) {
          const { promise, resolve } = Promise.withResolvers<void>();
          setTimeout(resolve, 1_500 * (attempt + 1));
          await promise;
        }
      }
    }
    throw new LlmError(
      scrub(
        lastError instanceof ProviderStatusError
          ? `LLM failed after ${this.retries} attempts: ${lastError.message}`
          : `LLM failed after ${this.retries} attempts: ${String(lastError)}`,
      ),
    );
  }

  /** Consumo acumulado desde o início do processo (tokens vêm do `usage` do provedor). */
  usage(): ProviderUsage {
    return { ...this.consumed };
  }
}

export function createLlmClient(cfg: StudyConfig): LlmClient {
  if (cfg.mockLlm) return new LlmMock();
  return new LlmHttp(cfg.llmBaseUrl, cfg.llmModel, cfg.llmKey, cfg.timeout);
}
