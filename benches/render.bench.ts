/**
 * Benchmark of the deterministic hot paths: markdown rendering and the numeric guardrail.
 * Run with `bun run bench`.
 */
import { Bench } from "tinybench";

import { mdToHtml } from "../src/application/render.ts";
import { checkDocument } from "../src/application/verification.ts";
import { indicatorsTableCsv } from "../src/application/reports.ts";
import type { IdeaEvaluation } from "../src/domain/types.ts";

function syntheticEvaluation(position: number): IdeaEvaluation {
  return {
    name: `Ideia ${position}`,
    sector: "automacao",
    description: "Le a mensagem, classifica a intencao e avisa quem decide.",
    indicators: {
      fit: 1.5,
      fitConf: 0.8,
      sale: 1.2,
      saleConf: 0.7,
      disruption: 1,
      disruptionConf: 0.6,
      pain: "dinheiro_direto",
      painProbs: { dinheiro_direto: 0.6, reputacao: 0.2, backoffice: 0.2 },
      painConf: 0.7,
      solo: 0.5,
    },
    business: { wtp: 0.4, meta30: 0.3, price: 1, priceConf: 0.6 },
    algorithm: {
      label: "FORTE",
      painScore: 0.6,
      internalScore: 0.2,
      margin: 0.4,
      deviation: 0.05,
      probes: { dinheiro: 0.6, reputacao: 0.2, processo: 0.2, tecnologia: 0 },
      byParaphrase: {},
    },
    index: 1.35,
    tier: "C",
  };
}

const evaluations = Array.from({ length: 24 }, (_, index) => syntheticEvaluation(index + 1));
const markdown = [
  "# Estudo",
  "",
  "| # | Ideia | Indice | Tier |",
  "|---|---|---|---|",
  ...evaluations.map(
    (evaluation, index) =>
      `| ${index + 1} | ${evaluation.name} | **${evaluation.index}** | ${evaluation.tier} |`,
  ),
  "",
  "- primeira",
  "- segunda",
  "",
  "> aviso",
  "",
  "```json",
  '{"a":1}',
  "```",
].join("\n");

const bench = new Bench({ time: 300 });

bench
  .add("render: mdToHtml (24 ideias)", () => {
    mdToHtml(markdown);
  })
  .add("reports: indicatorsTableCsv (24 ideias)", () => {
    indicatorsTableCsv(evaluations);
  })
  .add("verification: checkDocument (24 ideias)", () => {
    checkDocument(markdown, [1.35, 1.5, 1.2], ["Tier"]);
  });

await bench.run();
console.table(bench.table());
