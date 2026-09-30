/**
 * Consumo do decisor: o envelope do `/v1/systemone` conta a chamada sempre e os tokens quando vierem.
 * `fetch` é substituído por um stub — nenhum teste fala com rede de verdade.
 */
import { afterEach, describe, expect, test } from "bun:test";

import { DeciderHttp } from "../src/infrastructure/decider.ts";

const realFetch = globalThis.fetch;

function stubFetch(body: unknown, status = 200): void {
  globalThis.fetch = (async () =>
    new Response(typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as unknown as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("consumo do decisor", () => {
  test("conta a chamada e soma os tokens quando o envelope traz usage", async () => {
    stubFetch({
      model: "jev-1.13-free",
      answers: { q1: { type: "noul", noul: 0.42 } },
      usage: { input_tokens: 120, output_tokens: 30 },
    });
    const decider = new DeciderHttp("https://exemplo.test/v1/systemone", "systemone-latest", "chave");

    const answers = await decider.ask("estado do mercado", { q1: { type: "noul", instructions: "?" } });

    expect(answers["q1"]).toEqual({ type: "noul", noul: 0.42 });
    expect(decider.usage()).toEqual({
      calls: 1,
      inputTokens: 120,
      cachedInputTokens: 0,
      outputTokens: 30,
    });
  });

  test("aceita os nomes no formato OpenAI (prompt_tokens/completion_tokens)", async () => {
    stubFetch({ answers: {}, usage: { prompt_tokens: 10, completion_tokens: 5 } });
    const decider = new DeciderHttp("https://exemplo.test/v1/systemone");
    await decider.ask("estado", {});
    expect(decider.usage()).toEqual({ calls: 1, inputTokens: 10, cachedInputTokens: 0, outputTokens: 5 });
  });

  test("sem usage no envelope conta só a chamada e soma entre chamadas", async () => {
    stubFetch({ answers: { q1: { noul: 0.3 } } });
    const decider = new DeciderHttp("https://exemplo.test/v1/systemone");
    await decider.ask("estado", {});
    await decider.queryProbes("estado", { p1: "texto da sonda" });
    expect(decider.usage()).toEqual({ calls: 2, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });
  });

  test("tokens inválidos no usage são ignorados", async () => {
    stubFetch({ answers: {}, usage: { input_tokens: "muitos", output_tokens: null } });
    const decider = new DeciderHttp("https://exemplo.test/v1/systemone");
    await decider.ask("estado", {});
    expect(decider.usage().inputTokens).toBe(0);
    expect(decider.usage().calls).toBe(1);
  });
});
