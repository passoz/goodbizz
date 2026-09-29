/**
 * Cliente HTTP minimo para endpoints compativeis com chat/completions (OpenAI),
 * com reenvio e backoff linear. Sem dependencias externas.
 */
import type { LlmClient } from "../domain/ports.ts";
import type { StudyConfig } from "../domain/types.ts";
import { LlmError } from "../domain/errors.ts";
import { scrub } from "../config/redact.ts";
import { LlmMock } from "./llm-mock.ts";

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string } }>;
}

export class LlmHttp implements LlmClient {
  private readonly url: string;

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
        const data = (await response.json()) as ChatCompletion;
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== "string") throw new Error("response missing choices[0].message.content");
        return content;
      } catch (error) {
        lastError = error;
        const { promise, resolve } = Promise.withResolvers<void>();
        setTimeout(resolve, 1_500 * (attempt + 1));
        await promise;
      }
    }
    throw new LlmError(`LLM failed after ${this.retries} attempts: ${scrub(String(lastError))}`);
  }
}

export function createLlmClient(cfg: StudyConfig): LlmClient {
  if (cfg.mockLlm) return new LlmMock();
  return new LlmHttp(cfg.llmBaseUrl, cfg.llmModel, cfg.llmKey, cfg.timeout);
}
