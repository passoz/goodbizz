/**
 * Relatorios deterministas: índice, tabelão markdown e tabelão csv.
 * Sem chamadas de LLM: apenas números já medidos pelo decisor.
 *
 * Os textos e o alinhamento das colunas são copiados do baseline Python — não altere.
 */
import type { IdeaEvaluation, StudyConfig, StudySummary } from "../domain/types.ts";

/** Normaliza um nome para pasta: NFD, sem acentos, minusculo, `-` no lugar do resto. */
export function slug(name: string): string {
  const normalized = name
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
  const cleaned = normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "idea";
}

/** Pasta de uma ideia: `01-nome-slug`. */
export function folderName(rank: number, name: string): string {
  return `${String(rank).padStart(2, "0")}-${slug(name)}`;
}

/** Aviso de escopo repetido no topo de todo relatório. */
export function scopeNotice(cfg: StudyConfig): string {
  const location = cfg.city ? `${cfg.niche} em ${cfg.city}` : cfg.niche;
  return (
    "> **Escopo e método:** este material foi gerado pelo goodbizz a partir do " +
    `nicho **${location}**. Os indicadores vêm de um decisor (System One) e o texto, de um ` +
    `LLM. O ticket assumido é de R$ ${cfg.monthlyTicket}/mês e a meta de clientes é de 10 a ` +
    "15 em 24 meses. **Confira os números de mercado antes de usar isto com cliente:** " +
    "premissas marcadas `[INFERENCE]` são estimativa, não dado pesquisado.\n"
  );
}

const PAIN_GROUP_LABELS: Record<string, string> = {
  forte: "Dor forte (dinheiro direto ou reputação)",
  mista: "Dor mista",
  fraca: "Dor fraca (backoffice ou tecnologia)",
};

/** README.md raiz: ranking, médias, grupos de dor e avisos. */
export function indexMarkdown(
  cfg: StudyConfig,
  brief: string,
  summary: StudySummary,
  folderByName: Record<string, string>,
): string {
  const lines = [
    `# Estudo de nicho: ${cfg.niche}`,
    "",
    scopeNotice(cfg),
    "",
    "## Como ler",
    "",
    "1. `00-brief.md` — leitura de mercado que orientou a geração das ideias.",
    "2. `00-tabelão.md` — todos os indicadores das ideias em uma tabela.",
    "3. Uma pasta por ideia, cada uma com o plano completo.",
    "",
    "## Ranking",
    "",
    "Ordenado pelo Índice de Ação (média de fit e facilidade de venda).",
    "`WTP` = probabilidade de o dono pagar o ticket mensal assumido.",
    "",
    "| # | Ideia | Setor | Índice | Tier | WTP | Dor verificada |",
    "|---|---|---|---|---|---|---|",
  ];
  summary.ordered.forEach((idea, position) => {
    const rank = position + 1;
    const folder = folderByName[idea.name] ?? folderName(rank, idea.name);
    lines.push(
      `| ${String(rank).padStart(2, "0")} | [${idea.name}](./${folder}/) | ${idea.sector || "-"} | ` +
        `**${pythonFloat(idea.index)}** | ${idea.tier} | ${fixed(idea.business.wtp, 2)} | ` +
        `${idea.algorithm.label} |`,
    );
  });

  const means = summary.means;
  const tiers = summary.tiers;
  lines.push(
    "",
    "## Médias e grupos",
    "",
    `- fit **${pythonFloat(means.fit)}** · venda **${pythonFloat(means.sale)}** · ` +
      `disrupção **${pythonFloat(means.disruption)}** · suporte solo **${pythonFloat(means.solo)}**`,
    `- pagaria o ticket mensal (media): **${pythonFloat(means.wtp)}**`,
    `- 30 clientes em 24 meses (media): **${pythonFloat(means.meta30)}**`,
    `- tiers — A: ${tiers.A.length} · B: ${tiers.B.length} · C: ${tiers.C.length}`,
    "",
    "**Agrupamento por natureza da dor** (o preditor mais forte):",
    "",
  );
  for (const key of ["forte", "mista", "fraca"] as const) {
    lines.push(`- ${PAIN_GROUP_LABELS[key]}: ${summary.painGroups[key].join(", ") || "nenhuma"}`);
  }
  lines.push(
    "",
    "## Avisos que valem para todas as ideias",
    "",
    `1. **O ticket de R$ ${cfg.monthlyTicket}/mês é teto, não piso.** A disposição a pagar ` +
      `medida ficou em ${pythonFloat(means.wtp)} na media.`,
    "2. **A meta de 30 clientes em 24 meses é otimista** " +
      `(${pythonFloat(means.meta30)} de probabilidade média). Planejar 10 a 15 clientes.`,
    "3. **TAM nacional não serve como argumento.** Vender com o mercado da região e com o " +
      "que um operador solo consegue atender.",
    "",
  );
  if (brief.trim()) {
    lines.push("## Brief de contexto", "", brief.trim(), "");
  }
  return lines.join("\n");
}

/** Tabela markdown com todos os indicadores, ordenada pelo índice decrescente. */
export function indicatorsTableMarkdown(cfg: StudyConfig, data: IdeaEvaluation[]): string {
  const lines = [
    `# Tabelao de indicadores — ${cfg.niche}`,
    "",
    scopeNotice(cfg),
    "",
    "| # | Ideia | Setor | Fit | c | Venda | c | Disrupcao | c | Dor | Solo | Índice | " +
      "Tier | Algo | Algo dor | Interna | Margem | Desvio | WTP | 30/24m | Preço |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  [...data]
    .sort((a, b) => b.index - a.index)
    .forEach((idea, position) => {
      const i = idea.indicators;
      const g = idea.business;
      const a = idea.algorithm;
      lines.push(
        `| ${String(position + 1).padStart(2, "0")} | ${idea.name} | ${idea.sector || "-"} | ` +
          `${fixed(i.fit, 2)} | ${fixed(i.fitConf, 2)} | ${fixed(i.sale, 2)} | ` +
          `${fixed(i.saleConf, 2)} | ${fixed(i.disruption, 2)} | ${fixed(i.disruptionConf, 2)} | ` +
          `${i.pain} | ${fixed(i.solo, 2)} | **${pythonFloat(idea.index)}** | ${idea.tier} | ` +
          `${a.label} | ${fixed(a.painScore, 2)} | ${fixed(a.internalScore, 2)} | ` +
          `${signed(a.margin, 2)} | ${fixed(a.deviation, 3)} | ${fixed(g.wtp, 2)} | ` +
          `${fixed(g.meta30, 2)} | ${fixed(g.price, 2)} |`,
      );
    });
  lines.push(
    "",
    "`c` = confiança (0 a 1). Confianca baixa significa que o modelo viu ambiguidade " +
      "real na ideia, não que o valor esteja errado.",
    "",
  );
  return lines.join("\n");
}

const CSV_HEADERS = [
  "ideia",
  "setor",
  "indice",
  "tier",
  "fit",
  "fit_conf",
  "venda",
  "venda_conf",
  "disrupcao",
  "disrupcao_conf",
  "dor",
  "dor_conf",
  "solo",
  "algo",
  "algo_dor",
  "algo_interna",
  "algo_margem",
  "algo_desvio",
  "wtp",
  "meta30",
  "preco",
  "preco_conf",
];

/** Mesma tabela em CSV, com cabeçalho fixo lido pelo recalibrate. */
export function indicatorsTableCsv(data: IdeaEvaluation[]): string {
  const rows: string[] = [CSV_HEADERS.join(",")];
  for (const idea of [...data].sort((a, b) => b.index - a.index)) {
    const i = idea.indicators;
    const g = idea.business;
    const a = idea.algorithm;
    rows.push(
      [
        `"${idea.name}"`,
        `"${idea.sector}"`,
        fixed(idea.index, 3),
        idea.tier,
        fixed(i.fit, 2),
        fixed(i.fitConf, 2),
        fixed(i.sale, 2),
        fixed(i.saleConf, 2),
        fixed(i.disruption, 2),
        fixed(i.disruptionConf, 2),
        `"${i.pain}"`,
        fixed(i.painConf, 2),
        fixed(i.solo, 2),
        a.label,
        fixed(a.painScore, 3),
        fixed(a.internalScore, 3),
        signed(a.margin, 3),
        fixed(a.deviation, 3),
        fixed(g.wtp, 2),
        fixed(g.meta30, 2),
        fixed(g.price, 2),
        fixed(g.priceConf, 2),
      ].join(","),
    );
  }
  return `${rows.join("\n")}\n`;
}

/**
 * Reproduz `str(float)` do Python: inteiros ganham `.0` final (1 -> "1.0").
 * Os valores formatados aqui são médias/índices pequenos, então não há notação científica.
 */
function pythonFloat(value: number): string {
  if (Object.is(value, -0)) return "-0.0";
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

const FLOAT_VIEW = new DataView(new ArrayBuffer(8));

/** Arredonda a/b para o inteiro mais próximo, empate para o par (como o Python). */
function roundHalfEven(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const doubledRest = (numerator % denominator) * 2n;
  if (doubledRest > denominator) return quotient + 1n;
  if (doubledRest < denominator) return quotient;
  return quotient % 2n === 0n ? quotient : quotient + 1n;
}

/**
 * Formata com N casas decimais como `f"{x:.Nf}"` do Python: o arredondamento usa o valor
 * binario exato com empate para o par (0.125 -> "0.12"), diferente do `toFixed` do JS.
 */
function fixed(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return String(value);
  const sign = value < 0 || Object.is(value, -0) ? "-" : "";
  FLOAT_VIEW.setFloat64(0, Math.abs(value));
  const bits = FLOAT_VIEW.getBigUint64(0);
  const exponentBits = Number(bits >> 52n);
  let mantissa = bits & 0x000fffffffffffffn;
  if (exponentBits !== 0) mantissa |= 0x0010000000000000n;
  const exponent = (exponentBits === 0 ? 1 : exponentBits) - 1075;
  let numerator = mantissa * 10n ** BigInt(decimals);
  let denominator = 1n;
  if (exponent >= 0) numerator <<= BigInt(exponent);
  else denominator = 1n << BigInt(-exponent);
  const digits = roundHalfEven(numerator, denominator)
    .toString()
    .padStart(decimals + 1, "0");
  const cut = digits.length - decimals;
  const fraction = decimals > 0 ? `.${digits.slice(cut)}` : "";
  return `${sign}${digits.slice(0, cut)}${fraction}`;
}

/** Igual a `f"{x:+.Nf}"`: sempre leva sinal. */
function signed(value: number, decimals: number): string {
  const text = fixed(value, decimals);
  return text.startsWith("-") || text.startsWith("+") ? text : `+${text}`;
}
