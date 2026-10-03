import { describe, expect, test } from "bun:test";
import {
  actionIndex,
  businessQuestions,
  evaluateIdea,
  extractConfidence,
  extractScore,
  indicatorQuestions,
  tierOf,
} from "../src/application/evaluate.ts";
import { groupByPain, summarizeStudy } from "../src/application/summary.ts";
import { PAIN_OPTIONS } from "../src/application/pain-choice.ts";
import type { DeciderClient } from "../src/domain/ports.ts";
import type { DeciderAnswers, Idea, StudyConfig } from "../src/domain/types.ts";

interface IdeaProfile {
  fit: number;
  sale: number;
  disruption: number;
  solo: number;
  wtp: number;
  meta30: number;
  price: number;
  choice: Record<string, number>;
  probes: Record<string, number>;
}

/** Decisor de teste: responde indicadores, negocio e escolha forcada de forma fixa. */
function evaluationDecider(profile: IdeaProfile): DeciderClient {
  return {
    ask: async (_state, questions) => {
      const answers: DeciderAnswers = {};
      if ("fit" in questions) {
        answers["fit"] = { score: profile.fit, confidence: 0.8 };
        answers["venda"] = { score: profile.sale, confidence: 0.7 };
        answers["disrupcao"] = { score: profile.disruption, confidence: 0.6 };
        answers["dor"] = { choice: "dinheiro_direto", probabilities: profile.choice };
        answers["solo"] = { noul: profile.solo };
      } else if ("wtp" in questions) {
        answers["wtp"] = { noul: profile.wtp };
        answers["meta30"] = { noul: profile.meta30 };
        answers["preco"] = { score: profile.price, confidence: 0.5 };
      } else {
        answers["dor"] = { probabilities: profile.choice };
      }
      return answers;
    },
    queryProbes: async (_state, probes) => {
      const out: Record<string, number> = {};
      for (const id of Object.keys(probes)) out[id] = profile.probes[id] ?? 0.5;
      return out;
    },
  };
}

function studyConfig(painMethod: StudyConfig["painMethod"] = "choice"): StudyConfig {
  return {
    niche: "pousadas de ate 20 quartos",
    description: "",
    cacheSeed: "",
    providerFingerprint: "",
    city: "Gramado",
    monthlyTicket: 300,
    numIdeas: 2,
    outputDir: "estudo",
    ideasFile: "",
    evaluateOnly: false,
    painMethod,
    mock: true,
    mockLlm: true,
    mockDecider: true,
    pdf: false,
    paraphrases: 3,
    concurrency: 1,
    timeout: 60,
    llmBaseUrl: "",
    llmModel: "",
    llmKey: "",
    deciderUrl: "",
    deciderModel: "",
    deciderKey: "",
  };
}

const strongProfile: IdeaProfile = {
  fit: 2,
  sale: 2,
  disruption: 1,
  solo: 0.5,
  wtp: 0.4,
  meta30: 0.3,
  price: 1,
  choice: { dinheiro_direto: 0.8, reputacao: 0.1, backoffice: 0.1 },
  probes: { p_dinheiro: 0.85, p_reputacao: 0.4, p_processo: 0.1, p_tecnologia: 0.05 },
};

const weakProfile: IdeaProfile = {
  fit: 1,
  sale: 1,
  disruption: 1,
  solo: 0.5,
  wtp: 0.4,
  meta30: 0.3,
  price: 1,
  choice: { dinheiro_direto: 0.1, reputacao: 0.1, backoffice: 0.8 },
  probes: { p_dinheiro: 0.2, p_reputacao: 0.15, p_processo: 0.7, p_tecnologia: 0.3 },
};

const strongIdea: Idea = {
  name: "Forte",
  sector: "hospedagem",
  description: "Agenda que evita venda perdida.",
};
const weakIdea: Idea = {
  name: "Fraca",
  sector: "hospedagem",
  description: "Planilha interna de organizacao.",
};

describe("extratores e indices", () => {
  test("calcula indice de acao e tier", () => {
    expect(actionIndex(1.8, 2.0)).toBe(1.9);
    expect(tierOf(1.84)).toBe("A");
    expect(tierOf(1.6)).toBe("B");
    expect(tierOf(1.59)).toBe("C");
  });

  test("le score e confiança de varias formas", () => {
    expect(extractScore({ score: 2 })).toBe(2);
    expect(extractScore(1.5)).toBe(1.5);
    expect(extractScore({ nota: "1" })).toBe(1);
    expect(extractScore(undefined)).toBe(0);
    expect(extractConfidence({ confidence: 0.7 })).toBe(0.7);
    expect(extractConfidence({})).toBe(0);
  });

  test("monta as perguntas com os enunciados do baseline", () => {
    const indicators = indicatorQuestions();
    expect(Object.keys(indicators)).toEqual(["fit", "venda", "disrupcao", "dor", "solo"]);
    expect(indicators["fit"]).toMatchObject({ type: "score" });
    expect(indicators["dor"]).toMatchObject({ type: "choice", criteria: PAIN_OPTIONS });

    const business = businessQuestions(300);
    expect(Object.keys(business)).toEqual(["wtp", "meta30", "preco"]);
    expect(business["wtp"]).toMatchObject({
      type: "noul",
      instructions:
        "O dono deste negócio pagaria R$ 300 por mês por esta solução, considerando o valor " +
        "percebido por ele?",
    });
  });
});

describe("evaluateIdea", () => {
  test("avalia indicadores, dor por escolha, indice e tier", async () => {
    const evaluation = await evaluateIdea(strongIdea, evaluationDecider(strongProfile), studyConfig());

    expect(evaluation.name).toBe("Forte");
    expect(evaluation.sector).toBe("hospedagem");
    expect(evaluation.index).toBe(2);
    expect(evaluation.tier).toBe("A");
    expect(evaluation.indicators).toEqual({
      fit: 2,
      fitConf: 0.8,
      sale: 2,
      saleConf: 0.7,
      disruption: 1,
      disruptionConf: 0.6,
      pain: "dinheiro_direto",
      painProbs: { dinheiro_direto: 0.8, reputacao: 0.1, backoffice: 0.1 },
      painConf: 0,
      solo: 0.5,
    });
    expect(evaluation.business).toEqual({ wtp: 0.4, meta30: 0.3, price: 1, priceConf: 0.5 });
    expect(evaluation.algorithm.label).toBe("FORTE");
    expect(evaluation.algorithm.painScore).toBe(0.8);
    expect(evaluation.algorithm.internalScore).toBe(0.1);
    expect(evaluation.algorithm.deviation).toBe(0);
    expect(evaluation.algorithm.probes).toEqual({
      dinheiro: 0.8,
      reputacao: 0.1,
      processo: 0.1,
      tecnologia: 0,
    });
  });

  test("usa as sondas do algoritmo quando o metodo e noul", async () => {
    const evaluation = await evaluateIdea(strongIdea, evaluationDecider(strongProfile), studyConfig("noul"));

    expect(evaluation.algorithm.label).toBe("FORTE");
    expect(evaluation.algorithm.painScore).toBe(0.85);
    expect(evaluation.algorithm.probes).toEqual({
      dinheiro: 0.85,
      reputacao: 0.4,
      processo: 0.1,
      tecnologia: 0.05,
    });
    expect(Object.keys(evaluation.algorithm.byParaphrase)).toEqual(["v1", "v2", "v3"]);
  });

  test("a ideia sai com a data de geracao", async () => {
    const before = Date.now();
    const evaluation = await evaluateIdea(strongIdea, evaluationDecider(strongProfile), studyConfig());

    // ISO exigido pela coluna `generated_at`; a UI formata e o plano assina o rodape com ela.
    expect(typeof evaluation.generatedAt).toBe("string");
    const parsed = Date.parse(evaluation.generatedAt ?? "");
    expect(Number.isNaN(parsed)).toBe(false);
    expect(parsed).toBeGreaterThanOrEqual(before - 60_000);
  });
});

describe("summary", () => {
  test("agrupa por dor dominante", async () => {
    const strong = await evaluateIdea(strongIdea, evaluationDecider(strongProfile), studyConfig());
    const weak = await evaluateIdea(weakIdea, evaluationDecider(weakProfile), studyConfig());

    expect(groupByPain([strong, weak])).toEqual({
      forte: ["Forte"],
      mista: [],
      fraca: ["Fraca"],
    });
  });

  test("ordena, agrega medias e separa tiers, alvos e revisoes", async () => {
    const strong = await evaluateIdea(strongIdea, evaluationDecider(strongProfile), studyConfig());
    const weak = await evaluateIdea(weakIdea, evaluationDecider(weakProfile), studyConfig());
    const summary = summarizeStudy([weak, strong]);

    expect(strong.tier).toBe("A");
    expect(weak.tier).toBe("C");
    expect(summary.ordered.map((item) => item.name)).toEqual(["Forte", "Fraca"]);
    expect(summary.painGroups).toEqual({ forte: ["Forte"], mista: [], fraca: ["Fraca"] });
    expect(summary.means).toEqual({
      fit: 1.5,
      sale: 1.5,
      disruption: 1,
      solo: 0.5,
      wtp: 0.4,
      meta30: 0.3,
    });
    expect(summary.tiers).toEqual({ A: ["Forte"], B: [], C: ["Fraca"] });
    expect(summary.attack).toEqual(["Forte"]);
    expect(summary.review).toEqual([]);
  });
});
