/**
 * Agrupamento por natureza da dor e resumo do estudo.
 *
 * Portado de `goodbizz/evaluation.py` (`group_by_pain` e `summary`).
 */
import { populationMean, roundTo } from "./pain-algorithm.ts";
import type { IdeaEvaluation, PainGroups, StudyMeans, StudySummary, Tier } from "../domain/types.ts";

/** Agrupa as ideias pela natureza da dor dominante medida para cada uma. */
export function groupByPain(data: IdeaEvaluation[]): PainGroups {
  const groups: PainGroups = { forte: [], mista: [], fraca: [] };

  for (const item of data) {
    const probs = item.indicators.painProbs;
    let dominant = item.indicators.pain;
    let best = 0;
    let seen = false;
    for (const [name, value] of Object.entries(probs)) {
      if (!seen || value > best) {
        best = value;
        dominant = name;
        seen = true;
      }
    }

    const strong = (probs["dinheiro_direto"] ?? 0) + (probs["reputacao"] ?? 0);
    const weak = (probs["backoffice"] ?? 0) + (probs["tecnologia"] ?? 0);

    if ((dominant === "dinheiro_direto" || dominant === "reputacao") && strong > weak) {
      groups.forte.push(item.name);
    } else if ((dominant === "backoffice" || dominant === "tecnologia") && weak > strong) {
      groups.fraca.push(item.name);
    } else {
      groups.mista.push(item.name);
    }
  }

  return groups;
}

/** Ordena por indice decrescente e resume medias, tiers, alvos e revisoes. */
export function summarizeStudy(data: IdeaEvaluation[]): StudySummary {
  const ordered = [...data].sort((left, right) => right.index - left.index);

  const means: StudyMeans = {
    fit: roundTo(populationMean(data.map((item) => item.indicators.fit)), 3),
    sale: roundTo(populationMean(data.map((item) => item.indicators.sale)), 3),
    disruption: roundTo(populationMean(data.map((item) => item.indicators.disruption)), 3),
    solo: roundTo(populationMean(data.map((item) => item.indicators.solo)), 3),
    wtp: roundTo(populationMean(data.map((item) => item.business.wtp)), 3),
    meta30: roundTo(populationMean(data.map((item) => item.business.meta30)), 3),
  };

  const tiers: Record<Tier, string[]> = { A: [], B: [], C: [] };
  for (const item of ordered) {
    tiers[item.tier].push(item.name);
  }

  return {
    ordered,
    painGroups: groupByPain(data),
    means,
    tiers,
    attack: ordered.filter((item) => item.algorithm.label === "FORTE").map((item) => item.name),
    review: ordered
      .filter((item) => item.algorithm.label === "INDETERMINADO" || item.algorithm.label === "INSTAVEL")
      .map((item) => item.name),
  };
}
