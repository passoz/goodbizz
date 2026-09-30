/**
 * Study pipeline: brief -> ideas -> decider evaluation -> pain -> documents -> reports -> PDF.
 *
 * Ported from `generate_study.py::execute`. Numbers are always produced by code; the LLM only
 * writes prose around the measured data block and is checked against it afterwards.
 */
import { buildArtifactFiles } from "./artifacts.ts";
import { cacheKeyFor } from "./cache.ts";
import type { StudyCache } from "./cache.ts";
import { loadIdeas } from "./dados.ts";
import { evaluateIdea } from "./evaluate.ts";
import { generateBrief, generateDocument, generateIdeas } from "./generation.ts";
import { DOC_LITERALS } from "./prompts.ts";
import { fullHtml, mdToHtml } from "./render.ts";
import { folderName } from "./reports.ts";
import { summarizeStudy } from "./summary.ts";
import { checkDocument } from "./verification.ts";
import type { Logger, LlmClient, DeciderClient, ArtifactFile } from "../domain/ports.ts";
import type {
  Idea,
  StudyIdea,
  ProviderUsage,
  StudyConfig,
  StudySummary,
  StudyUsage,
} from "../domain/types.ts";

export interface ArtifactBundle {
  files: ArtifactFile[];
  folders: Record<string, string>;
  documents: Record<string, string>;
}

export interface GenerateStudyResult {
  brief: string;
  ideas: Idea[];
  evaluations: StudyIdea[];
  summary: StudySummary;
  folders: Record<string, string>;
  documents: Record<string, string>;
  files: ArtifactFile[];
  issues: string[];
  cacheHits: number;
  cacheCount: number;
  /** Consumo desta execução (diferença antes/depois nos clientes de longo prazo). */
  usage: StudyUsage;
}

export interface GenerateStudyDeps {
  llm: LlmClient;
  decider: DeciderClient;
  cache: StudyCache;
  logger: Logger;
  /** Called with the human-readable pipeline step (mirrors the CLI `[n/6]` log lines). */
  onProgress?: (step: string) => void;
}

/** Run `worker` over `items` with at most `limit` concurrent invocations. */
async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const size = Math.max(1, Math.floor(limit));
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(size, items.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index] as T;
      results[index] = await worker(item);
    }
  });
  await Promise.all(runners);
  return results;
}

/** Read an ideas JSON file (object wrapper, object list or string list). */
export { loadIdeas as loadIdeasFile } from "./dados.ts";

const ZERO_USAGE: ProviderUsage = { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

/** Diferença de consumo entre dois snapshots do mesmo cliente (os clientes vivem no processo todo). */
function usageDelta(before: ProviderUsage | undefined, after: ProviderUsage | undefined): ProviderUsage {
  const start = before ?? ZERO_USAGE;
  const end = after ?? ZERO_USAGE;
  return {
    calls: Math.max(0, end.calls - start.calls),
    inputTokens: Math.max(0, end.inputTokens - start.inputTokens),
    cachedInputTokens: Math.max(0, end.cachedInputTokens - start.cachedInputTokens),
    outputTokens: Math.max(0, end.outputTokens - start.outputTokens),
  };
}

/** O que a adição conhece do estudo: o brief já pago e as ideias que já existem. */
export interface GenerateAdditionInput {
  /** Brief já gravado. Reutilizado sem chamar o LLM: o estudo já o pagou. */
  brief: string;
  existing: readonly StudyIdea[];
}

/**
 * Gera `count` ideias novas para um estudo existente, sem reavaliar nem reescrever o que já está lá.
 *
 * Três garantias: o brief não é regerado, as ideias existentes não passam pelo decisor nem pelo
 * gerador de documento (o operador não paga duas vezes pela mesma análise), e a chave de cache leva
 * o `requestId` para que um segundo pedido não sirva as ideias do primeiro.
 */
export async function generateAddition(
  cfg: StudyConfig,
  input: GenerateAdditionInput,
  count: number,
  requestId: string,
  deps: GenerateStudyDeps,
): Promise<GenerateStudyResult> {
  const { llm, decider, cache } = deps;
  const usageBefore = { llm: llm.usage?.(), decider: decider.usage?.() };
  const progress = deps.onProgress ?? (() => {});
  const brief = input.brief;
  const existing = [...input.existing];
  const existingNames = existing.map((idea) => idea.name);
  progress(`[1/6] Reaproveitando o brief ja gravado (${brief.length} caracteres)`);

  // O `kind` diferente ja separa a adicao do estudo original; o `requestId` separa um pedido do outro.
  const ideasKey = cacheKeyFor(
    "ideias-adicao",
    cfg.niche,
    cfg.city,
    String(count),
    requestId,
    ...existingNames,
  );
  let ideas = await cache.get<Idea[]>(ideasKey);
  if (ideas === null) {
    ideas = await generateIdeas(llm, cfg, brief, count, existingNames);
    await cache.put(ideasKey, ideas);
  }
  progress(`[2/6] ${ideas.length} ideias novas geradas sem repetir as ${existing.length} existentes`);

  const newEvaluations = await mapLimit(ideas, cfg.concurrency, async (idea) => {
    // O `requestId` entra na chave: uma ideia que reapareça num pedido novo precisa de um id novo.
    // Reaproveitar a avaliacao em cache traria de volta o id ja gravado da ideia existente e o
    // indice unico (study_id, idea_id) derrubaria a gravacao.
    const key = cacheKeyFor(
      "aval-adicao",
      cfg.niche,
      cfg.city,
      String(cfg.monthlyTicket),
      requestId,
      idea.name,
      idea.description,
    );
    const cached = await cache.get<StudyIdea>(key);
    if (cached !== null) return cached;
    const evaluated = await evaluateIdea(idea, decider, cfg);
    await cache.put(key, evaluated);
    return evaluated;
  });
  progress(`[3/6] Avaliei as ${newEvaluations.length} ideias novas com o decisor`);

  const evaluations = [...existing, ...newEvaluations];
  const summary = summarizeStudy(evaluations);
  const folders: Record<string, string> = {};
  summary.ordered.forEach((evaluation, position) => {
    folders[evaluation.name] = folderName(position + 1, evaluation.name);
  });

  const usageNow = (): StudyUsage => ({
    llm: usageDelta(usageBefore.llm, llm.usage?.()),
    decider: usageDelta(usageBefore.decider, decider.usage?.()),
  });

  if (cfg.evaluateOnly) {
    return {
      brief,
      ideas,
      evaluations,
      summary,
      usage: usageNow(),
      folders: {},
      documents: {},
      files: [],
      issues: [],
      cacheHits: cache.hits,
      cacheCount: await cache.count(),
    };
  }

  const byId = new Map(newEvaluations.map((evaluation) => [evaluation.id, evaluation]));
  const issues: string[] = [];
  const documents: Record<string, string> = {};

  // Só as novas ideias ganham documento: reescrever as antigas custaria o mesmo token de novo.
  const written = await mapLimit(newEvaluations, cfg.concurrency, async (evaluation) => {
    const key = cacheKeyFor(
      "doc",
      cfg.niche,
      String(cfg.monthlyTicket),
      evaluation.name,
      String(evaluation.index),
    );
    let text = await cache.get<string>(key);
    if (text === null) {
      text = await generateDocument(llm, evaluation, cfg, brief);
      await cache.put(key, text);
    }
    text = `${text.replace(/\r\n/g, "\n").trim()}\n`;
    const findings = checkDocument(
      text,
      [
        evaluation.index,
        evaluation.indicators.fit,
        evaluation.indicators.sale,
        evaluation.indicators.disruption,
        evaluation.indicators.solo,
        evaluation.algorithm.painScore,
        evaluation.business.wtp,
        cfg.monthlyTicket,
      ],
      DOC_LITERALS,
    );
    const folder = folders[evaluation.name] as string;
    progress(`[5/6] Escrevendo o plano de "${folder}" (${Math.floor(text.length / 1024)} KB)`);
    if (findings.length > 0) issues.push(`${folder}: ${findings.join("; ")}`);
    return { name: evaluation.name, folder, text };
  });
  void byId;
  for (const item of written) documents[item.name] = item.text;

  // Os agregados descrevem o ranking inteiro; os `NN-slug/README.md` sao só das ideias novas, e as
  // pastas antigas continuam no disco com o documento que ja tinham. O filtro casa pela pasta e nao
  // pelo slug: `documents` e indexado por nome, e o caminho da pasta e `NN-slug`.
  const newFolders = new Set(newEvaluations.map((idea) => folders[idea.name]));
  const files = buildArtifactFiles(cfg, brief, summary, evaluations, folders, documents).filter(
    (file) => !file.path.includes("/") || newFolders.has(file.path.split("/")[0] as string),
  );
  progress(`[6/6] Montando os artefatos do estudo (${files.length} arquivos)`);

  return {
    brief,
    ideas,
    evaluations,
    summary,
    folders,
    documents,
    files,
    issues,
    cacheHits: cache.hits,
    cacheCount: await cache.count(),
    usage: usageNow(),
  };
}

export async function generateStudy(cfg: StudyConfig, deps: GenerateStudyDeps): Promise<GenerateStudyResult> {
  const { llm, decider, cache } = deps;
  const usageBefore = { llm: llm.usage?.(), decider: decider.usage?.() };
  const progress = deps.onProgress ?? (() => {});
  deps.logger.debug("study pipeline starting", {
    niche: cfg.niche,
    ideas: cfg.numIdeas,
    mockLlm: cfg.mockLlm,
    mockDecider: cfg.mockDecider,
  });

  const briefKey = cacheKeyFor("brief", cfg.niche, cfg.city);
  let brief = await cache.get<string>(briefKey);
  if (brief === null) {
    brief = await generateBrief(llm, cfg);
    await cache.put(briefKey, brief);
  }
  progress(`[1/6] Lendo o nicho e escrevendo o brief de mercado (${brief.length} caracteres)`);

  let ideas: Idea[];
  if (cfg.ideasFile) {
    ideas = loadIdeas(cfg.ideasFile);
    progress(`[2/6] ${ideas.length} ideias carregadas do arquivo ${cfg.ideasFile}`);
  } else {
    const ideasKey = cacheKeyFor("ideias", cfg.niche, cfg.city, String(cfg.numIdeas));
    const cached = await cache.get<Idea[]>(ideasKey);
    if (cached === null) {
      ideas = await generateIdeas(llm, cfg, brief, cfg.numIdeas);
      await cache.put(ideasKey, ideas);
    } else {
      ideas = cached;
    }
    progress(`[2/6] ${ideas.length} ideias de produto geradas para o nicho`);
  }

  const evaluations = await mapLimit(ideas, cfg.concurrency, async (idea) => {
    const key = cacheKeyFor(
      "aval",
      cfg.niche,
      cfg.city,
      String(cfg.monthlyTicket),
      idea.name,
      idea.description,
    );
    const cached = await cache.get<StudyIdea>(key);
    if (cached !== null) return cached;
    const evaluated = await evaluateIdea(idea, decider, cfg);
    await cache.put(key, evaluated);
    return evaluated;
  });

  for (const evaluation of [...evaluations].sort((a, b) => b.index - a.index)) {
    progress(
      `[3/6] Avaliei "${evaluation.name.slice(0, 38)}" com o decisor: índice ${evaluation.index.toFixed(3)} ` +
        `de 2 (maior é melhor), tier ${evaluation.tier}, dor ${evaluation.algorithm.label} ` +
        `(escore ${evaluation.algorithm.painScore.toFixed(2)}; forte a partir de 0.65)`,
    );
  }

  const summary = summarizeStudy(evaluations);
  const folders: Record<string, string> = {};
  summary.ordered.forEach((evaluation, position) => {
    folders[evaluation.name] = folderName(position + 1, evaluation.name);
  });

  const usageNow = (): StudyUsage => ({
    llm: usageDelta(usageBefore.llm, llm.usage?.()),
    decider: usageDelta(usageBefore.decider, decider.usage?.()),
  });

  if (cfg.evaluateOnly) {
    progress("[4/6] Modo --so-avaliar: o estudo parou depois de medir as ideias, sem escrever os documentos");
    return {
      brief,
      ideas,
      evaluations,
      summary,
      usage: usageNow(),
      folders: {},
      documents: {},
      files: [],
      issues: [],
      cacheHits: cache.hits,
      cacheCount: await cache.count(),
    };
  }

  progress(
    `[4/6] Natureza da dor medida: ${summary.painGroups.forte.length} com dor forte ` +
      `(dinheiro ou imagem), ${summary.painGroups.mista.length} mista, ${summary.painGroups.fraca.length} fraca ` +
      `(só trabalho manual)`,
  );

  const byName = new Map(evaluations.map((evaluation) => [evaluation.name, evaluation]));
  const issues: string[] = [];
  const documents: Record<string, string> = {};

  const written = await mapLimit(summary.ordered, cfg.concurrency, async (ordered) => {
    const evaluation = byName.get(ordered.name) as StudyIdea;
    const key = cacheKeyFor("doc", cfg.niche, String(cfg.monthlyTicket), ordered.name, String(ordered.index));
    let text = await cache.get<string>(key);
    if (text === null) {
      text = await generateDocument(llm, evaluation, cfg, brief);
      await cache.put(key, text);
    }
    text = `${text.replace(/\r\n/g, "\n").trim()}\n`;
    const indicators = evaluation.indicators;
    const numbers = [
      evaluation.index,
      indicators.fit,
      indicators.sale,
      indicators.disruption,
      indicators.solo,
      evaluation.algorithm.painScore,
      evaluation.business.wtp,
      cfg.monthlyTicket,
    ];
    const findings = checkDocument(text, numbers, DOC_LITERALS);
    const folder = folders[ordered.name] as string;
    const status = findings.length === 0 ? "ok" : `ATENCAO: ${findings.join("; ")}`;
    progress(`[5/6] Escrevendo o plano de "${folder}" (${Math.floor(text.length / 1024)} KB) — ${status}`);
    if (findings.length > 0) issues.push(`${folder}: ${findings.join("; ")}`);
    return { name: ordered.name, folder, text };
  });

  for (const item of written) documents[item.name] = item.text;

  const produced = buildArtifactFiles(cfg, brief, summary, evaluations, folders, documents);
  // O markdown vai como o LLM escreveu, em português acentuado: a normalização que removia
  // diacríticos (convenção do baseline Python) foi revogada.
  const files = produced;
  progress(`[6/6] Montando os artefatos do estudo (índice, tabelão, CSV e JSON): ${files.length} arquivos`);

  if (cfg.pdf) {
    const html = fullHtml(
      `Estudo de nicho — ${cfg.niche}`,
      [
        ...["README.md", "00-brief.md", "00-tabelao.md"].map((path) =>
          files.find((file) => file.path === path),
        ),
        ...summary.ordered.map((evaluation, position) =>
          files.find((file) => file.path === `${folderName(position + 1, evaluation.name)}/README.md`),
        ),
      ]
        .filter((file): file is ArtifactFile => file !== undefined && typeof file.content === "string")
        .map((file) => mdToHtml(file.content as string))
        .join('\n<hr style="page-break-after: always">\n'),
    );
    files.push({ path: "estudo-completo.html", content: html });
    progress(`[6/6] Gerando o HTML do estudo completo (${Math.floor(html.length / 1024)} KB)`);
  }

  const usage: StudyUsage = usageNow();
  const result = {
    brief,
    ideas,
    evaluations,
    summary,
    folders,
    documents,
    files,
    issues,
    cacheHits: cache.hits,
    cacheCount: await cache.count(),
    usage,
  };
  deps.logger.info("study pipeline finished", {
    niche: cfg.niche,
    evaluations: evaluations.length,
    issues: issues.length,
    cacheHits: result.cacheHits,
  });
  return result;
}
