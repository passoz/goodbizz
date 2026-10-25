/**
 * Casos da seção Fontes (FR-007): citação agrupada `[E1, E3]` conta como duas, e o índice e o aviso
 * de escopo apontam para `00-evidencias.md`.
 */
import { describe, expect, test } from "bun:test";

import { buildArtifactFiles } from "../src/application/artifacts.ts";
import { summarizeStudy } from "../src/application/summary.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import type { Evidence, StudyIdea } from "../src/domain/types.ts";

function evidence(id: string, url: string): Evidence {
  return { id, tipo: "preco", afirmacao: `afirmação ${id}`, trecho: `trecho ${id}`, url, valor: null, unidade: "", ideia: "" };
}

const IDEA: StudyIdea = {
  id: "idea-1",
  name: "Alerta de estoque",
  sector: "estoque",
  description: "Avisa quando acaba.",
  indicators: {
    fit: 1.5, fitConf: 0.8, sale: 1.4, saleConf: 0.7, disruption: 1, disruptionConf: 0.6,
    pain: "dinheiro_direto", painProbs: { dinheiro_direto: 0.7 }, painConf: 0.7, solo: 0.6,
  },
  business: { wtp: 0.5, meta30: 0.4, price: 1.2, priceConf: 0.6 },
  algorithm: { label: "FORTE", painScore: 0.7, internalScore: 0.3, margin: 0.4, deviation: 0.05, probes: {}, byParaphrase: {} },
  index: 1.45,
  tier: "C",
};

describe("seção Fontes em casos de borda", () => {
  test("FR-007: citação agrupada [E1, E3] lista as duas evidências", () => {
    const cfg = resolveStudyConfig({ niche: "deposito", mock: true });
    const files = buildArtifactFiles(
      cfg,
      "brief",
      summarizeStudy([IDEA]),
      [IDEA],
      { [IDEA.name]: "01-alerta-de-estoque" },
      { [IDEA.name]: "# Plano\n\nPreço e concorrente [E1, E3].\n" },
      [evidence("E1", "https://a.test"), evidence("E2", "https://b.test"), evidence("E3", "https://c.test")],
    );
    const readme = String(files.find((file) => file.path === "01-alerta-de-estoque/README.md")?.content);
    const fontes = readme.slice(readme.lastIndexOf("## Fontes"));
    expect(fontes).toContain("https://a.test");
    expect(fontes).toContain("https://c.test");
    expect(fontes).not.toContain("https://b.test");
  });

  test("FR-007: o índice e o aviso de escopo apontam para 00-evidencias.md", () => {
    const cfg = resolveStudyConfig({ niche: "deposito", mock: true });
    const files = buildArtifactFiles(
      cfg,
      "brief",
      summarizeStudy([IDEA]),
      [IDEA],
      { [IDEA.name]: "01-alerta-de-estoque" },
      { [IDEA.name]: "# Plano\n" },
      [],
    );
    const index = String(files.find((file) => file.path === "README.md")?.content);
    const brief = String(files.find((file) => file.path === "00-brief.md")?.content);
    expect(index).toContain("`00-evidencias.md`");
    expect(brief).toContain("[E#]");
  });
});
