/**
 * Indicadores, agregação, tiers e avaliação de uma ideia.
 *
 * Portado de `goodbizz/evaluation.py`: as perguntas, os níveis e os extratores são idênticos
 * ao baseline para que o decisor veja exatamente os mesmos enunciados.
 */
import { studyContext } from "../config/runtime.ts";
import { MIN_PARAPHRASES, PAIN_PROBES } from "../domain/pain.ts";
import { extractProbability } from "../infrastructure/decider.ts";
import { evaluatePain, roundTo } from "./pain-algorithm.ts";
import { PAIN_OPTIONS, measurePainChoice, painResultFromChoice } from "./pain-choice.ts";
import type { DeciderClient } from "../domain/ports.ts";
import type {
  BusinessBlock,
  Idea,
  IdeaEvaluation,
  Indicators,
  PainBlock,
  PainResult,
  QuestionSet,
  StudyConfig,
  Tier,
} from "../domain/types.ts";

interface IndicatorLevels {
  fit: string[];
  venda: string[];
  disrupcao: string[];
  preco: string[];
}

const LEVELS: IndicatorLevels & Record<string, string[]> = {
  fit: [
    "Ruim: exige escala corporativa ou processos maduros.",
    "Média: útil, mas o dono precisa mudar muito sua rotina para usar.",
    "Excelente: resolve um problema caótico da operação diária sem exigir mudança de hábitos.",
  ],
  venda: [
    "Alta: o benefício é invisível a curto prazo; difícil de explicar.",
    "Média: o benefício é claro, mas requer provar valor antes de fechar.",
    "Baixa (venda fácil): ataca perda de dinheiro direto ou reputação imediata.",
  ],
  disrupcao: [
    "Nada disruptivo: é o que todo mundo já faz, apenas automatizado.",
    "Moderadamente novo: muda um processo interno, mas o cliente final não percebe.",
    "Muito disruptivo: muda o modelo de operação ou cria fonte de receita que não existia.",
  ],
  preco: [
    "Preço acima do valor percebido.",
    "Preço compatível com o valor percebido.",
    "Preço abaixo do valor percebido, com folga para cobrar mais.",
  ],
};

/** Niveis de resposta aceitos pelas perguntas de score. */
export const INDICATOR_LEVELS: Record<string, string[]> = LEVELS;

export function indicatorQuestions(): QuestionSet {
  return {
    fit: {
      type: "score",
      instructions:
        "Qual a aderência desta ideia para este mercado, onde o dono " + "atende no balcão e não tem tempo?",
      criteria: LEVELS.fit,
    },
    venda: {
      type: "score",
      instructions: "Quão difícil é vender isso para este dono por uma assinatura mensal barata?",
      criteria: LEVELS.venda,
    },
    disrupcao: {
      type: "score",
      instructions: "Quão disruptiva é esta ideia para o setor, na prática?",
      criteria: LEVELS.disrupcao,
    },
    dor: {
      type: "choice",
      instructions: "Que tipo de dor esta ideia resolve?",
      criteria: { ...PAIN_OPTIONS },
    },
    solo: {
      type: "noul",
      instructions: "E viavel um consultor solo manter isso para 30 clientes sem enlouquecer com suporte?",
    },
  };
}

export function businessQuestions(monthlyTicket: number): QuestionSet {
  return {
    wtp: {
      type: "noul",
      instructions:
        `O dono deste negócio pagaria R$ ${monthlyTicket} por mês por esta ` +
        "solução, considerando o valor percebido por ele?",
    },
    meta30: {
      type: "noul",
      instructions:
        "É realista um consultor solo conseguir 30 clientes pagantes com esta solução em " +
        "24 meses, começando nesta região?",
    },
    preco: {
      type: "score",
      instructions: `R$ ${monthlyTicket} por mês é caro, justo ou barato pelo retorno que ele terá?`,
      criteria: LEVELS.preco,
    },
  };
}

/** Converte um valor desconhecido em número, como o `float()` tolerante do baseline. */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function extractScore(answer: unknown): number {
  if (typeof answer === "number") return answer;
  if (answer && typeof answer === "object" && !Array.isArray(answer)) {
    const record = answer as Record<string, unknown>;
    for (const key of ["score", "value", "level", "nota", "posicao"]) {
      const parsed = toNumber(record[key]);
      if (parsed !== null) return parsed;
    }
  }
  return 0;
}

export function extractConfidence(answer: unknown): number {
  if (typeof answer === "number") return answer;
  if (answer && typeof answer === "object" && !Array.isArray(answer)) {
    const record = answer as Record<string, unknown>;
    for (const key of ["confidence", "conf", "confianca"]) {
      const parsed = toNumber(record[key]);
      if (parsed !== null) return parsed;
    }
  }
  return 0;
}

export function actionIndex(fit: number, sale: number): number {
  return roundTo((fit + sale) / 2, 3);
}

export function tierOf(index: number): Tier {
  if (index >= 1.84) return "A";
  if (index >= 1.6) return "B";
  return "C";
}

/** Falsidade no sentido do Python: resposta vazia conta como ausente. */
function hasAnswer(answer: unknown): boolean {
  if (!answer) return false;
  if (typeof answer === "object") return Object.keys(answer).length > 0;
  return true;
}

/** Avalia todos os indicadores de UMA ideia e devolve o bloco completo de dados. */
export async function evaluateIdea(
  idea: Idea,
  decider: DeciderClient,
  cfg: StudyConfig,
): Promise<IdeaEvaluation> {
  const context = studyContext(cfg);
  const state = `${context}\nIdeia: ${idea.name} — ${idea.description}`;

  const indicatorAnswers = await decider.ask(state, indicatorQuestions());
  const businessAnswers = await decider.ask(
    `${state}\nPreço proposto: R$ ${cfg.monthlyTicket} por mês.`,
    businessQuestions(cfg.monthlyTicket),
  );

  let pain: PainResult;
  if (cfg.painMethod === "choice") {
    pain = painResultFromChoice(await measurePainChoice(decider, state));
  } else {
    const variants = Object.keys(PAIN_PROBES).slice(0, Math.max(MIN_PARAPHRASES, cfg.paraphrases));
    pain = await evaluatePain(idea.description, decider, context, variants);
  }

  const fit = extractScore(indicatorAnswers["fit"] ?? {});
  const sale = extractScore(indicatorAnswers["venda"] ?? {});
  const index = actionIndex(fit, sale);

  const painAnswer = indicatorAnswers["dor"] ?? {};
  let painChoice = "";
  let painProbs: Record<string, number> = {};
  if (painAnswer && typeof painAnswer === "object" && !Array.isArray(painAnswer)) {
    const record = painAnswer as Record<string, unknown>;
    if (typeof record["choice"] === "string") painChoice = record["choice"];
    for (const key of ["probabilities", "probs"]) {
      const candidate = record[key];
      if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
        const entries = Object.entries(candidate);
        if (entries.length > 0) {
          painProbs = Object.fromEntries(entries.map(([name, value]) => [name, Number(value)]));
          break;
        }
      }
    }
    if (Object.keys(painProbs).length === 0 && painChoice) painProbs = { [painChoice]: 1 };
  } else if (painAnswer) {
    painChoice = String(painAnswer);
    painProbs = { [painChoice]: 1 };
  }

  const soloAnswer = indicatorAnswers["solo"];
  const wtpAnswer = businessAnswers["wtp"];
  const meta30Answer = businessAnswers["meta30"];

  const indicators: Indicators = {
    fit,
    fitConf: extractConfidence(indicatorAnswers["fit"]),
    sale,
    saleConf: extractConfidence(indicatorAnswers["venda"]),
    disruption: extractScore(indicatorAnswers["disrupcao"]),
    disruptionConf: extractConfidence(indicatorAnswers["disrupcao"]),
    pain: painChoice,
    painProbs,
    painConf: extractConfidence(painAnswer),
    solo: hasAnswer(soloAnswer) ? extractProbability(soloAnswer) : 0,
  };

  const business: BusinessBlock = {
    wtp: hasAnswer(wtpAnswer) ? extractProbability(wtpAnswer) : 0,
    meta30: hasAnswer(meta30Answer) ? extractProbability(meta30Answer) : 0,
    price: extractScore(businessAnswers["preco"]),
    priceConf: extractConfidence(businessAnswers["preco"]),
  };

  const algorithm: PainBlock = {
    label: pain.label,
    painScore: roundTo(pain.painScore, 3),
    internalScore: roundTo(pain.internalScore, 3),
    margin: roundTo(pain.margin, 3),
    deviation: roundTo(pain.deviation, 3),
    probes: Object.fromEntries(
      Object.entries(pain.detail).map(([probe, value]) => [probe, roundTo(value, 4)]),
    ),
    byParaphrase: Object.fromEntries(
      Object.entries(pain.byParaphrase).map(([variant, row]) => [
        variant,
        Object.fromEntries(Object.entries(row).map(([probe, value]) => [probe, roundTo(value, 4)])),
      ]),
    ),
  };

  return {
    name: idea.name,
    sector: idea.sector,
    description: idea.description,
    indicators,
    business,
    algorithm,
    index,
    tier: tierOf(index),
  };
}
