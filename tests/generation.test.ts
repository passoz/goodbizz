import { describe, expect, test } from "bun:test";

import { ValidationError } from "../src/domain/errors.ts";
import type { LlmClient } from "../src/domain/ports.ts";
import type { IdeaEvaluation, StudyConfig } from "../src/domain/types.ts";
import {
  dataBlock,
  generateBrief,
  generateDocument,
  generateIdeas,
  parseIdeas,
} from "../src/application/generation.ts";
import {
  BRIEF_SYSTEM_PROMPT,
  DOC_LITERALS,
  DOC_SECTIONS,
  DOC_SYSTEM_PROMPT,
  IDEAS_SYSTEM_PROMPT,
} from "../src/application/prompts.ts";

function makeConfig(overrides: Partial<StudyConfig> = {}): StudyConfig {
  return {
    niche: "clinicas",
    city: "",
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
    llmBaseUrl: "http://localhost",
    llmModel: "model",
    llmKey: "key",
    deciderUrl: "http://localhost",
    deciderModel: "model",
    deciderKey: "key",
    ...overrides,
  };
}

function makeEvaluation(): IdeaEvaluation {
  return {
    name: "Triagem automatica",
    sector: "clinicas",
    description: "Recebe a mensagem, triagem e agenda.",
    indicators: {
      fit: 1.5,
      fitConf: 0.8,
      sale: 1.5,
      saleConf: 0.75,
      disruption: 1,
      disruptionConf: 0.6,
      pain: "dinheiro_direto",
      painProbs: { reputacao: 0.25, dinheiro_direto: 0.5, backoffice: 0.25 },
      painConf: 0.7,
      solo: 0.4,
    },
    business: { wtp: 0.5, meta30: 0.4, price: 2, priceConf: 0.6 },
    algorithm: {
      label: "FORTE",
      painScore: 0.72,
      internalScore: 0.3,
      margin: 0.15,
      deviation: 0.05,
      probes: {},
      byParaphrase: {},
    },
    index: 1.5,
    tier: "C",
  };
}

/** Records every call and always returns the canned reply. */
class StubLlm implements LlmClient {
  readonly calls: Array<{ system: string; user: string }> = [];

  constructor(private readonly reply: string) {}

  async generateText(system: string, user: string): Promise<string> {
    this.calls.push({ system, user });
    return this.reply;
  }
}

describe("parseIdeas", () => {
  test("accepts an array of strings", () => {
    expect(parseIdeas([" a ", "b"])).toEqual([
      { name: "a", sector: "", description: "a" },
      { name: "b", sector: "", description: "b" },
    ]);
  });

  test("accepts an array of objects and normalises keys", () => {
    expect(parseIdeas([{ nome: "N", setor: "S", descricao: "D" }])).toEqual([
      { name: "N", sector: "S", description: "D" },
    ]);
    expect(parseIdeas([{ name: "N2", sector: "S2", description: "D2" }])).toEqual([
      { name: "N2", sector: "S2", description: "D2" },
    ]);
  });

  test("accepts a wrapper object with ideas", () => {
    const ideas = parseIdeas({ ideas: [{ nome: "N", setor: "S", descricao: "D" }] });
    expect(ideas).toHaveLength(1);
    expect(ideas[0]?.name).toBe("N");
  });

  test("falls back to Ideia n when no name is given", () => {
    expect(parseIdeas([{}])).toEqual([{ name: "Ideia 1", sector: "", description: "Ideia 1" }]);
  });

  test("throws ValidationError when nothing usable is found", () => {
    expect(() => parseIdeas([])).toThrow(ValidationError);
    expect(() => parseIdeas({ ideas: [] })).toThrow(ValidationError);
    expect(() => parseIdeas("nope")).toThrow(ValidationError);
  });
});

describe("dataBlock", () => {
  test("renders every measured number with the baseline layout", () => {
    const block = dataBlock(makeEvaluation(), makeConfig());
    expect(block).toContain("ÍNDICE DE AÇÃO: 1.5 | TIER: C");
    expect(block).toContain("fit: 1.5/2.00 (confiança 0.80)");
    expect(block).toContain("facilidade de venda: 1.5/2.00 (confiança 0.75)");
    expect(block).toContain("disrupção: 1/2.00 (confiança 0.60)");
    expect(block).toContain("suporte solo: 0.40");
    expect(block).toContain("ALGORITMO DA DOR:");
    expect(block).toContain("VALIDAÇÃO: pagaria R$ 300/mês = 0.50");
    expect(block).toContain("margem +0.15");
    expect(block).toContain("Escalas:");
    expect(block).toContain("Regras de negócio para este plano:");
    expect(block).toContain("Ticket assumido: R$ 300/mês (R$ 3600/ano)");
    expect(block).toContain("Nicho: clinicas");
  });

  test("sorts the pain probability distribution by key with 2 decimals", () => {
    const block = dataBlock(makeEvaluation(), makeConfig());
    expect(block).toContain(
      "tipo de dor: dinheiro_direto (confiança 0.70) | distribuição: " +
        "backoffice=0.25, dinheiro_direto=0.50, reputacao=0.25",
    );
  });

  test("adds the city only when configured and falls back for the sector", () => {
    const evaluation = makeEvaluation();
    evaluation.sector = "";
    const withCity = dataBlock(evaluation, makeConfig({ city: "Sorocaba" }));
    expect(withCity).toContain("Nicho: clinicas | Cidade/região: Sorocaba");
    expect(withCity).toContain("(setor: não informado)");
    expect(dataBlock(evaluation, makeConfig())).not.toContain("Cidade/região");
  });
});

describe("prompts", () => {
  test("document structure is the ten mandated sections", () => {
    expect(DOC_SECTIONS).toHaveLength(10);
    for (const title of DOC_SECTIONS) {
      expect(DOC_SYSTEM_PROMPT).toContain(title);
    }
    expect(DOC_LITERALS).toEqual(["Tier", "SWOT", "Business Model Canvas", "Porter", "Próximos passos"]);
  });
});

describe("generation calls", () => {
  test("generateBrief trims the reply and sends the measured ticket", async () => {
    const llm = new StubLlm("  brief texto  \n");
    const brief = await generateBrief(llm, makeConfig());
    expect(brief).toBe("brief texto");
    expect(llm.calls[0]?.system).toBe(BRIEF_SYSTEM_PROMPT);
    expect(llm.calls[0]?.user).toBe(
      "Nicho: clinicas\n" + "Cidade ou região alvo: não informada\n" + "Ticket mensal considerado: R$ 300\n",
    );
  });

  test("generateIdeas parses a fenced JSON array", async () => {
    const payload = JSON.stringify(
      Array.from({ length: 6 }, (_, i) => ({
        nome: `Ideia ${i + 1}`,
        setor: "clinicas",
        descricao: `descricao ${i + 1}`,
      })),
    );
    const llm = new StubLlm("Aqui estao:\n```json\n" + payload + "\n```\n");
    const ideas = await generateIdeas(llm, makeConfig(), "brief de teste", 6);
    expect(ideas).toHaveLength(6);
    expect(ideas[0]?.name).toBe("Ideia 1");
    expect(ideas[5]?.description).toBe("descricao 6");
    expect(llm.calls[0]?.system).toBe(IDEAS_SYSTEM_PROMPT);
    expect(llm.calls[0]?.user).toBe(
      "Nicho: clinicas\n" +
        "Cidade ou região alvo: não informada\n" +
        "Ticket mensal considerado: R$ 300\n\n" +
        "Brief de mercado:\nbrief de teste\n\n" +
        "Gere exatamente 6 ideias em JSON. Retorne apenas o array.",
    );
  });

  test("generateIdeas rejects a JSON payload that is not an array", async () => {
    const llm = new StubLlm('{"nome": "so um objeto"}');
    await expect(generateIdeas(llm, makeConfig(), "brief", 3)).rejects.toThrow(ValidationError);
  });

  test("generateDocument wraps the measured data block", async () => {
    const llm = new StubLlm("  # documento  ");
    const doc = await generateDocument(llm, makeEvaluation(), makeConfig(), "brief ctx");
    expect(doc).toBe("# documento");
    expect(llm.calls[0]?.system).toBe(DOC_SYSTEM_PROMPT);
    const user = llm.calls[0]?.user ?? "";
    expect(user.startsWith("DADOS MEDIDOS\n")).toBe(true);
    expect(user).toContain("\nFIM DOS DADOS\n\nBrief de contexto do nicho:\nbrief ctx\n\n");
    expect(user.endsWith("Escreva o documento desta ideia seguindo a estrutura obrigatoria.")).toBe(true);
  });
});
