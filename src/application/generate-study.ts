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
import { stripAccents } from "./normalize.ts";
import type { Logger, LlmClient, DeciderClient, ArtifactFile } from "../domain/ports.ts";
import type { Idea, IdeaEvaluation, StudyConfig, StudySummary } from "../domain/types.ts";

export interface ArtifactBundle {
  files: ArtifactFile[];
  folders: Record<string, string>;
  documents: Record<string, string>;
}

export interface GenerateStudyResult {
  brief: string;
  ideas: Idea[];
  evaluations: IdeaEvaluation[];
  summary: StudySummary;
  folders: Record<string, string>;
  documents: Record<string, string>;
  files: ArtifactFile[];
  issues: string[];
  cacheHits: number;
  cacheCount: number;
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

export async function generateStudy(cfg: StudyConfig, deps: GenerateStudyDeps): Promise<GenerateStudyResult> {
  const { llm, decider, cache } = deps;
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
  progress(`[1/6] brief de contexto (${brief.length} caracteres)`);

  let ideas: Idea[];
  if (cfg.ideasFile) {
    ideas = loadIdeas(cfg.ideasFile);
    progress(`[2/6] ${ideas.length} ideias carregadas de ${cfg.ideasFile}`);
  } else {
    const ideasKey = cacheKeyFor("ideias", cfg.niche, cfg.city, String(cfg.numIdeas));
    const cached = await cache.get<Idea[]>(ideasKey);
    if (cached === null) {
      ideas = await generateIdeas(llm, cfg, brief, cfg.numIdeas);
      await cache.put(ideasKey, ideas);
    } else {
      ideas = cached;
    }
    progress(`[2/6] ${ideas.length} ideias geradas`);
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
    const cached = await cache.get<IdeaEvaluation>(key);
    if (cached !== null) return cached;
    const evaluated = await evaluateIdea(idea, decider, cfg);
    await cache.put(key, evaluated);
    return evaluated;
  });

  for (const evaluation of [...evaluations].sort((a, b) => b.index - a.index)) {
    progress(
      `[3/6] ${evaluation.name.slice(0, 38).padEnd(38)} indice ${evaluation.index.toFixed(3)} ` +
        `(0 a 2; maior e melhor) tier ${evaluation.tier} (A >= 1.84) dor ${evaluation.algorithm.label} ` +
        `(escore ${evaluation.algorithm.painScore.toFixed(2)}; FORTE >= 0.65)`,
    );
  }

  const summary = summarizeStudy(evaluations);
  const folders: Record<string, string> = {};
  summary.ordered.forEach((evaluation, position) => {
    folders[evaluation.name] = folderName(position + 1, evaluation.name);
  });

  if (cfg.evaluateOnly) {
    progress("[4/6] modo --so-avaliar: parou depois da avaliacao");
    return {
      brief,
      ideas,
      evaluations,
      summary,
      folders: {},
      documents: {},
      files: [],
      issues: [],
      cacheHits: cache.hits,
      cacheCount: await cache.count(),
    };
  }

  progress(
    `[4/6] grupos de dor: forte=${summary.painGroups.forte.length} ` +
      `mista=${summary.painGroups.mista.length} fraca=${summary.painGroups.fraca.length}`,
  );

  const byName = new Map(evaluations.map((evaluation) => [evaluation.name, evaluation]));
  const issues: string[] = [];
  const documents: Record<string, string> = {};

  const written = await mapLimit(summary.ordered, cfg.concurrency, async (ordered) => {
    const evaluation = byName.get(ordered.name) as IdeaEvaluation;
    const key = cacheKeyFor("doc", cfg.niche, String(cfg.monthlyTicket), ordered.name, String(ordered.index));
    let text = await cache.get<string>(key);
    if (text === null) {
      text = await generateDocument(llm, evaluation, cfg, brief);
      await cache.put(key, text);
    }
    text = `${stripAccents(text.replace(/\r\n/g, "\n").trim())}\n`;
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
    progress(`[5/6] ${folder.padEnd(34)} ${Math.floor(text.length / 1024)} KB  ${status}`);
    if (findings.length > 0) issues.push(`${folder}: ${findings.join("; ")}`);
    return { name: ordered.name, folder, text };
  });

  for (const item of written) documents[item.name] = item.text;

  const produced = buildArtifactFiles(cfg, brief, summary, evaluations, folders, documents);
  // Passo 6/6 do baseline: normalizar acentos em TODO markdown do estudo. Sem isto, o texto vindo do
  // LLM (brief, indice, tabelao) escaparia da convencao sem acento, que so era aplicada no documento
  // de cada ideia. O json/csv ficam como estao, igual ao baseline.
  const files = produced.map((file) =>
    file.path.endsWith(".md") && typeof file.content === "string"
      ? { ...file, content: stripAccents(file.content) }
      : file,
  );
  progress(`[6/6] ${files.length} artefatos preparados`);

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
    progress(`[6/6] html do estudo compilado (${Math.floor(html.length / 1024)} caracteres)`);
  }

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
  };
  deps.logger.info("study pipeline finished", {
    niche: cfg.niche,
    evaluations: evaluations.length,
    issues: issues.length,
    cacheHits: result.cacheHits,
  });
  return result;
}
