import { describe, expect, test } from "bun:test";
import { ValidationError } from "../src/domain/errors.ts";
import type { Idea, StudyConfig } from "../src/domain/types.ts";
import { extractJson } from "../src/infrastructure/json.ts";
import { createLlmClient, LlmHttp } from "../src/infrastructure/llm.ts";
import { LlmMock, MOCK_BRIEF, MOCK_IDEAS } from "../src/infrastructure/llm-mock.ts";

const SECTION_HEADINGS = [
  "## 1. Resumo executivo",
  "## 2. Indicadores coletados",
  "## 3. Como funciona",
  "## 4. Estrategia de venda",
  "## 5. Estrategia de marketing",
  "## 6. Precificacao e economia unitaria",
  "## 7. SWOT",
  "## 8. Business Model Canvas",
  "## 9. Ferramentas complementares",
  "## 10. Proximos passos",
];

function baseConfig(overrides: Partial<StudyConfig> = {}): StudyConfig {
  return {
    niche: "oficinas mecanicas",
    city: "Niteroi",
    monthlyTicket: 300,
    numIdeas: 6,
    outputDir: "estudo",
    ideasFile: "",
    evaluateOnly: false,
    painMethod: "choice",
    mock: false,
    mockLlm: false,
    mockDecider: false,
    pdf: false,
    paraphrases: 3,
    concurrency: 8,
    timeout: 60,
    llmBaseUrl: "https://api.example.com/v1",
    llmModel: "gpt-test",
    llmKey: "sk-test-key-123456",
    deciderUrl: "",
    deciderModel: "",
    deciderKey: "",
    ...overrides,
  };
}

describe("extractJson", () => {
  test("parses a fenced json block", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  test("parses json embedded in prose", () => {
    expect(extractJson('Segue o array: [{"nome":"x"}] e nada mais.')).toEqual([{ nome: "x" }]);
  });

  test("parses a bare json object", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  test("throws ValidationError when there is no readable json", () => {
    expect(() => extractJson("resposta totalmente invalida sem json")).toThrow(ValidationError);
  });
});

describe("LlmMock", () => {
  test("returns six ideas for the IDEAS prompt", async () => {
    const client = new LlmMock();
    const raw = await client.generateText("PALAVRA-CHAVE: IDEIAS", "gere ideias");
    const ideas = JSON.parse(raw) as Idea[];
    expect(ideas).toHaveLength(6);
    expect(ideas[0]?.name).toBe("Triagem de WhatsApp");
    expect(MOCK_IDEAS).toHaveLength(6);
  });

  test("returns the brief for the BRIEF prompt", async () => {
    const client = new LlmMock();
    const raw = await client.generateText("PALAVRA-CHAVE: BRIEF", "monte o brief");
    expect(raw).toContain("# Brief");
    expect(raw).toBe(MOCK_BRIEF);
  });

  test("builds a document from a synthetic measured-data block", async () => {
    const user = [
      "DADOS MEDIDOS",
      "Ideia: Triagem de WhatsApp (setor: atendimento)",
      "Descricao: Le as mensagens e separa duvida simples.",
      "Nicho: oficinas mecanicas | Cidade/regiao: Niteroi",
      "Ticket assumido: R$ 300/mes (R$ 3600/ano)",
      "",
      "INDICE DE ACAO: 1.90 | TIER: A",
      "fit: 1.80/2.00 (confianca 0.91)",
      "facilidade de venda: 1.70/2.00 (confianca 0.88)",
      "disrupcao: 1.60/2.00 (confianca 0.80)",
      "tipo de dor: FORTE (confianca 0.75) | distribuicao: dinheiro=0.70",
      "suporte solo: 0.82",
      "ALGORITMO DA DOR: dor forte | escore de dor 1.42 | dor interna 0.30 | margem +0.55 | desvio 0.09",
      "VALIDACAO: pagaria R$ 297/mes = 0.88 | 30 clientes em 24 meses = 0.71 | preco vs valor 1.90/2.00 (confianca 0.86)",
      "FIM DOS DADOS",
    ].join("\n");

    const document = await new LlmMock().generateText("Voce e consultor.", user);
    for (const heading of SECTION_HEADINGS) {
      expect(document).toContain(heading);
    }
    expect(document).toContain("**Tier:** A");
    expect(document).toContain("# Triagem de WhatsApp");
    expect(document).toContain("SWOT");
    expect(document).toContain("Business Model Canvas");
    expect(document).toContain("Porter");
    expect(document).toContain("Proximos passos");
    const nonEmpty = document.split("\n").filter((line) => line.trim().length > 0);
    expect(nonEmpty.length).toBeGreaterThanOrEqual(80);
    expect(document).not.toMatch(/[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]/);
    expect(document).toContain("1.90");
    expect(document).toContain("1.80");
    expect(document).toContain("0.82");
    expect(document).toContain("297");
  });
});

describe("createLlmClient", () => {
  test("returns an LlmMock when mockLlm is true", () => {
    const client = createLlmClient(baseConfig({ mockLlm: true }));
    expect(client).toBeInstanceOf(LlmMock);
  });

  test("returns an LlmHttp when mockLlm is false", () => {
    const client = createLlmClient(baseConfig({ mockLlm: false }));
    expect(client).toBeInstanceOf(LlmHttp);
  });
});

describe("LlmHttp over loopback", () => {
  test("posts chat completions with the bearer key and returns the content", async () => {
    const observed: { value: { path: string; auth: string | null; body: Record<string, unknown> } | null } = {
      value: null,
    };
    const server = Bun.serve({
      port: 0,
      fetch: async (request) => {
        observed.value = {
          path: new URL(request.url).pathname,
          auth: request.headers.get("authorization"),
          body: (await request.json()) as Record<string, unknown>,
        };
        return Response.json({ choices: [{ message: { content: "  ola  " } }] });
      },
    });
    try {
      const client = new LlmHttp(`http://127.0.0.1:${server.port}/v1`, "gpt-test", "sk-abc123", 5);
      expect(await client.generateText("sys", "usr")).toBe("  ola  ");
      const seen = observed.value;
      if (seen === null) throw new Error("the stub server was not called");
      expect(seen.path).toBe("/v1/chat/completions");
      expect(seen.auth).toBe("Bearer sk-abc123");
      expect(seen.body["model"]).toBe("gpt-test");
      expect(seen.body["temperature"]).toBe(0.4);
      // Gateways que fazem streaming por padrao so respondem JSON unico se o cliente declarar.
      expect(seen.body["stream"]).toBe(false);
      const messages = seen.body["messages"] as Array<{ role: string; content: string }>;
      expect(messages.map((message) => message.role)).toEqual(["system", "user"]);
    } finally {
      await server.stop(true);
    }
  });

  test("retries a transient failure and succeeds on the next attempt", async () => {
    let calls = 0;
    const server = Bun.serve({
      port: 0,
      fetch: () => {
        calls += 1;
        if (calls === 1) return new Response("busy", { status: 503 });
        return Response.json({ choices: [{ message: { content: "ok" } }] });
      },
    });
    try {
      const client = new LlmHttp(`http://127.0.0.1:${server.port}/v1`, "m", "k", 5, 2);
      expect(await client.generateText("s", "u")).toBe("ok");
      expect(calls).toBe(2);
    } finally {
      await server.stop(true);
    }
  });

  test("fails with a redacted message when the provider stays down", async () => {
    const secret = "sk-super-secret-value-123";
    const server = Bun.serve({
      port: 0,
      fetch: () => new Response(`provider rejected ${secret}`, { status: 500 }),
    });
    try {
      const client = new LlmHttp(`http://127.0.0.1:${server.port}/v1`, "m", secret, 5, 1);
      let message = "";
      try {
        await client.generateText("s", "u");
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toContain("LLM failed after 1 attempts");
      expect(message).not.toContain(secret);
    } finally {
      await server.stop(true);
    }
  });
});

describe("LlmMock document markers", () => {
  test("accepts the english data markers as well as the portuguese ones", async () => {
    const mock = new LlmMock();
    const english = [
      "MEASURED DATA",
      "Ideia: Teste",
      "INDICE DE ACAO: 1.5 | TIER: B",
      "VALIDATION: pagaria R$ 350 por mes = 0.60 | 30 clientes em 24 meses = 0.40",
      "END OF DATA",
      "",
      "Escreva o documento.",
    ].join("\n");
    const document = await mock.generateText("voce e consultor", english);
    expect(document).toContain("Teste");
    expect(document).toContain("## 1. Resumo executivo");
    expect(document).toContain("ticket de R$ 350 por mes");
  });
});
