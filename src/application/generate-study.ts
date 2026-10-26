/**
 * Study pipeline: research -> brief -> ideas -> decider evaluation -> pain -> documents -> reports -> PDF.
 *
 * Ported from `generate_study.py::execute`. Numbers are always produced by code; the LLM only
 * writes prose around the measured data block and is checked against it afterwards.
 */
import { buildArtifactFiles } from "./artifacts.ts";
import { scopedKey } from "./cache.ts";
import type { StudyCache } from "./cache.ts";
import { loadIdeas } from "./dados.ts";
import { evaluateIdea } from "./evaluate.ts";
import { generateBrief, generateDocument, generateIdeas, type IdeaValueBlock } from "./generation.ts";
import { DOC_LITERALS } from "./prompts.ts";
import { fullHtml, mdToHtml } from "./render.ts";
import { folderName, sourcesSection } from "./reports.ts";
import { evidenceHash, evidencesFor, mapLimit, researchIdeas, researchStudy } from "./research.ts";
import { requestPremises, type PremisesResult } from "./premises.ts";
import { calculateValue } from "./value.ts";
import { summarizeStudy } from "./summary.ts";
import { checkDocument, extractUnsourcedNumbers } from "./verification.ts";
import type { Logger, LlmClient, DeciderClient, ArtifactFile, SearchClient } from "../domain/ports.ts";
import type {
  Evidence,
  Idea,
  IdeaEvaluation,
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

export interface IdeaPremises {
  ideaName: string;
  premises: PremisesResult | null;
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
  /**
   * Premissas validadas de cada ideia (`null` quando as duas tentativas falham e a ideia
   * segue sem bloco de valor). É daqui que o bloco VALOR do documento sai.
   */
  premises: IdeaPremises[];
  /**
   * Evidências do estudo (`ideia` vazia) e de cada ideia, numeradas `E1..En` em sequência. Para
   * as de uma ideia: `evidences.filter((evidence) => evidence.ideia === nome)`.
   */
  evidences: Evidence[];
  cacheHits: number;
  cacheCount: number;
  /** Consumo desta execução (diferença antes/depois nos clientes de longo prazo). */
  usage: StudyUsage;
}

export interface GenerateStudyDeps {
  llm: LlmClient;
  decider: DeciderClient;
  /** Provedor de busca da fase de pesquisa (Tavily ou simulado). */
  search: SearchClient;
  cache: StudyCache;
  logger: Logger;
  /** Called with the human-readable pipeline step (mirrors the CLI `[n/7]` log lines). */
  onProgress?: (step: string) => void;
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

/**
 * Premissas de cada ideia, com cache próprio: a pesquisa nova refaz as premissas em vez de
 * servir as antigas. Fonte órfã vira `INFERENCE` com correção em `issues`; falha dupla nas
 * duas tentativas deixa a ideia sem bloco de valor (premissas `null`) com registro em `issues`.
 */
async function requestIdeaPremises(
  cfg: StudyConfig,
  ideas: readonly Idea[],
  evidences: readonly Evidence[],
  deps: GenerateStudyDeps,
  providerScope: string,
  issues: string[],
  progress: (step: string) => void,
): Promise<IdeaPremises[]> {
  const { llm, cache } = deps;
  const collected = await mapLimit(ideas, cfg.concurrency, async (idea) => {
    const own = evidencesFor(evidences, idea.name);
    const key = scopedKey(
      cfg.cacheSeed,
      "premissas",
      providerScope,
      cfg.niche,
      cfg.city,
      idea.name,
      idea.description,
      evidenceHash(own),
    );
    const cached = await cache.get<PremisesResult | null>(key);
    if (cached !== null) return { ideaName: idea.name, premises: cached };
    const { premises, corrections } = await requestPremises(llm, cfg, idea.name, idea.description, own);
    await cache.put(key, premises);
    for (const correction of corrections) issues.push(`${idea.name}: ${correction}`);
    if (premises === null)
      issues.push(`${idea.name}: premissas inválidas nas duas tentativas, segue sem bloco de valor`);
    return { ideaName: idea.name, premises };
  });
  progress(`[3/7] Declarei as premissas de ${collected.length} ideias com fonte em evidência ou INFERENCE`);
  return collected;
}

/**
 * Monta o bloco VALOR de uma ideia a partir das premissas validadas. Sem premissas (falha
 * dupla), devolve `undefined` e o documento sai sem a conta. O setup vem do estudo e entra
 * na chave de cache do documento, então trocar o setup invalida o documento gravado.
 */
export function valueBlockFor(
  premises: readonly IdeaPremises[],
  ideaName: string,
  monthlyTicket: number,
  setupFee = 1500,
): IdeaValueBlock | undefined {
  const found = premises.find((entry) => entry.ideaName === ideaName)?.premises;
  if (found === null || found === undefined) return undefined;
  return {
    premises: found.fatores,
    value: calculateValue({
      factors: found.fatores.map((factor) => factor.valor),
      recovery: found.recuperacao,
      setupFee,
      monthlyTicket,
    }),
    setupFee,
  };
}
/**
 * Anexa a conta do retorno a cada avaliação a partir das premissas validadas (FR-009).
 * Sem premissas (falha dupla), a ideia segue sem valor e os artefatos mostram as colunas
 * vazias. O `payload_json` gravado não muda (CON-006): o valor vive só no objeto em memória
 * e na chave aditiva `valor` do `dados.json`.
 */
function attachValue(
  evaluations: StudyIdea[],
  premises: readonly IdeaPremises[],
  monthlyTicket: number,
  setupFee: number,
): void {
  for (const evaluation of evaluations) {
    const block = valueBlockFor(premises, evaluation.name, monthlyTicket, setupFee);
    if (block === undefined) continue;
    evaluation.value = {
      premises: block.premises.map((premise) => ({ ...premise })),
      recovery: premises.find((entry) => entry.ideaName === evaluation.name)?.premises?.recuperacao ?? 0,
      loss: block.value.perdaMes,
      gain: block.value.ganhoMes,
      balance: block.value.saldoMes,
      paybackMonths: block.value.paybackMeses,
      return12m: block.value.retorno12m,
      setupFee: block.setupFee,
    };
  }
}

/**
 * Conjunto permitido do guardrail (QR-001): medidos, calculados, evidências, premissas,
 * ticket, setup, equivalentes anuais e as constantes do framework do plano (prazo de
 * implantação, meta de clientes e horizonte do retorno). Números do próprio enquadramento
 * não são "número inventado de mercado".
 */
function allowedNumbersFor(
  evaluation: IdeaEvaluation,
  monthlyTicket: number,
  setupFee: number,
  own: readonly Evidence[],
  value?: IdeaValueBlock,
): string[] {
  const allowed: string[] = [
    String(evaluation.index),
    String(evaluation.indicators.fit),
    String(evaluation.indicators.sale),
    String(evaluation.indicators.disruption),
    String(evaluation.indicators.solo),
    String(evaluation.algorithm.painScore),
    String(evaluation.business.wtp),
    String(monthlyTicket),
    String(setupFee),
    // Constantes do framework: implantação em 2 semanas, meta de 10 a 15 clientes em
    // 24 meses, retorno anual em 12 meses.
    "2",
    "10",
    "15",
    "24",
    "12",
  ];
  for (const evidence of own) {
    if (evidence.valor !== null) allowed.push(String(evidence.valor));
  }
  if (value !== undefined) {
    for (const premise of value.premises) allowed.push(String(premise.valor));
    allowed.push(
      String(value.value.perdaMes),
      String(value.value.ganhoMes),
      String(value.value.saldoMes),
      ...(value.value.paybackMeses === null ? [] : [String(value.value.paybackMeses)]),
      String(value.value.retorno12m),
      String(value.setupFee),
    );
  }
  allowed.push(String(monthlyTicket * 12), "90");
  return allowed;
}

/**
 * Gera o documento com regeração única por violação de guardrail (FR-007). A segunda chamada
 * só acontece quando `extractUnsourcedNumbers` acusa número sem fonte no documento que seria
 * gravado; exceção de provedor propaga sem retry. A segunda versão é gravada mesmo que ainda
 * viole, e cada número sem fonte restante entra em `issues` com o nome da ideia.
 */
async function generateDocumentWithRegen(
  llm: LlmClient,
  evaluation: IdeaEvaluation,
  cfg: StudyConfig,
  brief: string,
  own: readonly Evidence[],
  value: IdeaValueBlock | undefined,
  ideaName: string,
): Promise<{ text: string; violations: string[] }> {
  const setupFee = value?.setupFee ?? 1500;
  const allowed = allowedNumbersFor(evaluation, cfg.monthlyTicket, setupFee, own, value);
  const first = await generateDocument(llm, evaluation, cfg, brief, own, value);
  const violations = extractUnsourcedNumbers(first, allowed);
  if (violations.length === 0) return { text: first.trim(), violations: [] };
  const second = await generateDocument(llm, evaluation, cfg, brief, own, value);
  const remaining = extractUnsourcedNumbers(second, allowed);
  return {
    text: second.trim(),
    violations: remaining.map((violation) => `${ideaName}: número sem fonte: ${violation}`),
  };
}

/** O que a adição conhece do estudo: o brief já pago e as ideias que já existem. */
export interface GenerateAdditionInput {
  /** Brief já gravado. Reutilizado sem chamar o LLM: o estudo já o pagou. */
  brief: string;
  existing: readonly StudyIdea[];
  /** Evidências do estudo (ideias antigas inclusas): base da numeração e do prompt das novas. */
  evidences: readonly Evidence[];
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
  const usageBefore = { llm: llm.usage?.(), decider: decider.usage?.(), search: deps.search.usage?.() };
  const progress = deps.onProgress ?? (() => {});
  const brief = input.brief;
  const existing = [...input.existing];
  const existingNames = existing.map((idea) => idea.name);
  // Escopo do provedor em toda chave de cache: trocar de provedor nao serve a resposta antiga.
  const providerScope = cfg.providerFingerprint ?? "";
  progress(`[2/7] Reaproveitando o brief ja gravado (${brief.length} caracteres)`);

  // O `kind` diferente ja separa a adicao do estudo original; o `requestId` separa um pedido do outro.
  const ideasKey = scopedKey(
    cfg.cacheSeed,
    "ideias-adicao",
    providerScope,
    cfg.niche,
    cfg.city,
    String(count),
    requestId,
    ...existingNames,
  );
  let ideas = await cache.get<Idea[]>(ideasKey);
  if (ideas === null) {
    ideas = await generateIdeas(llm, cfg, brief, count, existingNames, input.evidences);
    await cache.put(ideasKey, ideas);
  }
  progress(`[3/7] ${ideas.length} ideias novas geradas sem repetir as ${existing.length} existentes`);

  // A adição pesquisa só as novas: as antigas já têm as delas em `input.evidences`, e o `known`
  // numera as novas em sequência (`E#` nunca se repete dentro do estudo).
  const researchDeps = { llm, search: deps.search, cache };
  const ideaResearch = await researchIdeas(cfg, ideas, input.evidences, researchDeps, providerScope);
  const evidences = [...input.evidences, ...ideaResearch.evidences];
  const researchIssues = [...ideaResearch.issues];
  progress(
    `[3/7] Pesquisei concorrente e preço de ${ideas.length} ideias novas: ` +
      `${ideaResearch.evidences.length} evidências próprias`,
  );
  const additionPremisesIssues: string[] = [];
  const additionPremises = await requestIdeaPremises(
    cfg,
    ideas,
    evidences,
    deps,
    providerScope,
    additionPremisesIssues,
    progress,
  );

  const newEvaluations = await mapLimit(ideas, cfg.concurrency, async (idea) => {
    // O `requestId` entra na chave: uma ideia que reapareça num pedido novo precisa de um id novo.
    // Reaproveitar a avaliacao em cache traria de volta o id ja gravado da ideia existente e o
    // indice unico (study_id, idea_id) derrubaria a gravacao.
    const key = scopedKey(
      cfg.cacheSeed,
      "aval-adicao",
      providerScope,
      cfg.niche,
      cfg.city,
      String(cfg.monthlyTicket),
      requestId,
      idea.name,
      idea.description,
      // O decisor vê as evidências da ideia: pesquisa nova refaz a avaliação em vez de servir a antiga.
      evidenceHash(evidencesFor(evidences, idea.name)),
    );
    const cached = await cache.get<StudyIdea>(key);
    if (cached !== null) return cached;
    const evaluated = await evaluateIdea(idea, decider, cfg, evidencesFor(evidences, idea.name));
    await cache.put(key, evaluated);
    return evaluated;
  });
  progress(`[4/7] Avaliei as ${newEvaluations.length} ideias novas com o decisor`);
  attachValue(newEvaluations, additionPremises, cfg.monthlyTicket, cfg.setupFee);

  const evaluations = [...existing, ...newEvaluations];
  const summary = summarizeStudy(evaluations);
  const folders: Record<string, string> = {};
  summary.ordered.forEach((evaluation, position) => {
    folders[evaluation.name] = folderName(position + 1, evaluation.name);
  });

  const usageNow = (): StudyUsage => ({
    llm: usageDelta(usageBefore.llm, llm.usage?.()),
    decider: usageDelta(usageBefore.decider, decider.usage?.()),
    search: usageDelta(usageBefore.search, deps.search.usage?.()),
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
      issues: [...researchIssues, ...additionPremisesIssues],
      premises: additionPremises,
      evidences,
      cacheHits: cache.hits,
      cacheCount: await cache.count(),
    };
  }

  const byId = new Map(newEvaluations.map((evaluation) => [evaluation.id, evaluation]));
  const issues: string[] = [...researchIssues];
  const documents: Record<string, string> = {};

  // Só as novas ideias ganham documento: reescrever as antigas custaria o mesmo token de novo.
  const written = await mapLimit(newEvaluations, cfg.concurrency, async (evaluation) => {
    const own = evidencesFor(evidences, evaluation.name);
    const key = scopedKey(
      cfg.cacheSeed,
      "doc",
      providerScope,
      cfg.niche,
      String(cfg.monthlyTicket),
      String(cfg.setupFee),
      evaluation.name,
      String(evaluation.index),
      evidenceHash(own),
    );
    let text = await cache.get<string>(key);
    let regenViolations: string[] = [];
    if (text === null) {
      const generated = await generateDocumentWithRegen(
        llm,
        evaluation,
        cfg,
        brief,
        own,
        valueBlockFor(additionPremises, evaluation.name, cfg.monthlyTicket, cfg.setupFee),
        evaluation.name,
      );
      text = generated.text;
      regenViolations = generated.violations;
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
    const orphans = sourcesSection(text, evidences).orphans;
    if (orphans.length > 0) issues.push(`${folder}: citação de evidência inexistente: ${orphans.join(", ")}`);
    progress(`[6/7] Escrevendo o plano de "${folder}" (${Math.floor(text.length / 1024)} KB)`);
    if (findings.length > 0) issues.push(`${folder}: ${findings.join("; ")}`);
    return { name: evaluation.name, folder, text, regenViolations };
  });
  void byId;
  for (const item of written) documents[item.name] = item.text;
  for (const item of written) issues.push(...item.regenViolations);

  // Os agregados descrevem o ranking inteiro; os `NN-slug/README.md` sao só das ideias novas, e as
  // pastas antigas continuam no disco com o documento que ja tinham. O filtro casa pela pasta e nao
  // pelo slug: `documents` e indexado por nome, e o caminho da pasta e `NN-slug`.
  const newFolders = new Set(newEvaluations.map((idea) => folders[idea.name]));
  const files = buildArtifactFiles(cfg, brief, summary, evaluations, folders, documents, evidences).filter(
    (file) => !file.path.includes("/") || newFolders.has(file.path.split("/")[0] as string),
  );
  progress(`[7/7] Montando os artefatos do estudo (${files.length} arquivos)`);

  return {
    brief,
    ideas,
    evaluations,
    summary,
    folders,
    documents,
    files,
    issues: [...issues, ...additionPremisesIssues],
    premises: additionPremises,
    evidences,
    cacheHits: cache.hits,
    cacheCount: await cache.count(),
    usage: usageNow(),
  };
}

export async function generateStudy(cfg: StudyConfig, deps: GenerateStudyDeps): Promise<GenerateStudyResult> {
  const { llm, decider, cache } = deps;
  const usageBefore = { llm: llm.usage?.(), decider: decider.usage?.(), search: deps.search.usage?.() };
  const progress = deps.onProgress ?? (() => {});
  const providerScope = cfg.providerFingerprint ?? "";
  deps.logger.debug("study pipeline starting", {
    niche: cfg.niche,
    ideas: cfg.numIdeas,
    mockLlm: cfg.mockLlm,
    mockDecider: cfg.mockDecider,
  });

  const researchDeps = { llm, search: deps.search, cache };
  const research = await researchStudy(cfg, researchDeps, providerScope);
  const studyEvidences = research.evidences;
  progress(
    `[1/7] Pesquisando a web: ${research.queries.length} buscas e ${studyEvidences.length} evidências ` +
      "com trecho literal e URL",
  );
  // As evidências entram na chave: pesquisa nova (ou provedor de busca novo) escreve brief novo.
  const evidenceScope = evidenceHash(studyEvidences);

  const briefKey = scopedKey(cfg.cacheSeed, "brief", providerScope, cfg.niche, cfg.city, evidenceScope);
  let brief = await cache.get<string>(briefKey);
  if (brief === null) {
    brief = await generateBrief(llm, cfg, studyEvidences);
    await cache.put(briefKey, brief);
  }
  progress(`[2/7] Lendo o nicho e escrevendo o brief de mercado (${brief.length} caracteres)`);

  let ideas: Idea[];
  if (cfg.ideasFile) {
    ideas = loadIdeas(cfg.ideasFile);
    progress(`[3/7] ${ideas.length} ideias carregadas do arquivo ${cfg.ideasFile}`);
  } else {
    const ideasKey = scopedKey(
      cfg.cacheSeed,
      "ideias",
      providerScope,
      cfg.niche,
      cfg.city,
      String(cfg.numIdeas),
      evidenceScope,
    );
    const cached = await cache.get<Idea[]>(ideasKey);
    if (cached === null) {
      ideas = await generateIdeas(llm, cfg, brief, cfg.numIdeas, [], studyEvidences);
      await cache.put(ideasKey, ideas);
    } else {
      ideas = cached;
    }
    progress(`[3/7] ${ideas.length} ideias de produto geradas para o nicho`);
  }

  const ideaResearch = await researchIdeas(cfg, ideas, studyEvidences, researchDeps, providerScope);
  const evidences = [...studyEvidences, ...ideaResearch.evidences];
  const researchIssues = [...research.issues, ...ideaResearch.issues];
  progress(
    `[3/7] Pesquisei concorrente e preço de ${ideas.length} ideias: ` +
      `${ideaResearch.evidences.length} evidências próprias`,
  );
  const premisesIssues: string[] = [];
  const premises = await requestIdeaPremises(
    cfg,
    ideas,
    evidences,
    deps,
    providerScope,
    premisesIssues,
    progress,
  );

  const evaluations = await mapLimit(ideas, cfg.concurrency, async (idea) => {
    const key = scopedKey(
      cfg.cacheSeed,
      "aval",
      providerScope,
      cfg.niche,
      cfg.city,
      String(cfg.monthlyTicket),
      idea.name,
      idea.description,
      // O decisor vê as evidências da ideia: pesquisa nova refaz a avaliação em vez de servir a antiga.
      evidenceHash(evidencesFor(evidences, idea.name)),
    );
    const cached = await cache.get<StudyIdea>(key);
    if (cached !== null) return cached;
    const evaluated = await evaluateIdea(idea, decider, cfg, evidencesFor(evidences, idea.name));
    await cache.put(key, evaluated);
    return evaluated;
  });

  for (const evaluation of [...evaluations].sort((a, b) => b.index - a.index)) {
    progress(
      `[4/7] Avaliei "${evaluation.name.slice(0, 38)}" com o decisor: índice ${evaluation.index.toFixed(3)} ` +
        `de 2 (maior é melhor), tier ${evaluation.tier}, dor ${evaluation.algorithm.label} ` +
        `(escore ${evaluation.algorithm.painScore.toFixed(2)}; forte a partir de 0.65)`,
    );
  }

  attachValue(evaluations, premises, cfg.monthlyTicket, cfg.setupFee);

  const summary = summarizeStudy(evaluations);
  const folders: Record<string, string> = {};
  summary.ordered.forEach((evaluation, position) => {
    folders[evaluation.name] = folderName(position + 1, evaluation.name);
  });

  const usageNow = (): StudyUsage => ({
    llm: usageDelta(usageBefore.llm, llm.usage?.()),
    decider: usageDelta(usageBefore.decider, decider.usage?.()),
    search: usageDelta(usageBefore.search, deps.search.usage?.()),
  });

  if (cfg.evaluateOnly) {
    progress("[5/7] Modo --so-avaliar: o estudo parou depois de medir as ideias, sem escrever os documentos");
    return {
      brief,
      ideas,
      evaluations,
      summary,
      usage: usageNow(),
      folders: {},
      documents: {},
      files: [],
      issues: [...researchIssues, ...premisesIssues],
      premises,
      evidences,
      cacheHits: cache.hits,
      cacheCount: await cache.count(),
    };
  }

  progress(
    `[5/7] Natureza da dor medida: ${summary.painGroups.forte.length} com dor forte ` +
      `(dinheiro ou imagem), ${summary.painGroups.mista.length} mista, ${summary.painGroups.fraca.length} fraca ` +
      `(só trabalho manual)`,
  );

  const byName = new Map(evaluations.map((evaluation) => [evaluation.name, evaluation]));
  const issues: string[] = [...researchIssues, ...premisesIssues];
  const documents: Record<string, string> = {};

  const written = await mapLimit(summary.ordered, cfg.concurrency, async (ordered) => {
    const evaluation = byName.get(ordered.name) as StudyIdea;
    const own = evidencesFor(evidences, ordered.name);
    const key = scopedKey(
      cfg.cacheSeed,
      "doc",
      providerScope,
      cfg.niche,
      String(cfg.monthlyTicket),
      String(cfg.setupFee),
      ordered.name,
      String(ordered.index),
      evidenceHash(own),
    );
    let text = await cache.get<string>(key);
    let regenViolations: string[] = [];
    if (text === null) {
      const generated = await generateDocumentWithRegen(
        llm,
        evaluation,
        cfg,
        brief,
        own,
        valueBlockFor(premises, evaluation.name, cfg.monthlyTicket, cfg.setupFee),
        evaluation.name,
      );
      text = generated.text;
      regenViolations = generated.violations;
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
    const orphans = sourcesSection(text, evidences).orphans;
    if (orphans.length > 0) issues.push(`${folder}: citação de evidência inexistente: ${orphans.join(", ")}`);
    const status = findings.length === 0 ? "ok" : `ATENCAO: ${findings.join("; ")}`;
    progress(`[6/7] Escrevendo o plano de "${folder}" (${Math.floor(text.length / 1024)} KB) — ${status}`);
    if (findings.length > 0) issues.push(`${folder}: ${findings.join("; ")}`);
    return { name: ordered.name, folder, text, regenViolations };
  });

  for (const item of written) documents[item.name] = item.text;
  for (const item of written) issues.push(...item.regenViolations);

  const produced = buildArtifactFiles(cfg, brief, summary, evaluations, folders, documents, evidences);
  // O markdown vai como o LLM escreveu, em português acentuado: a normalização que removia
  // diacríticos (convenção do baseline Python) foi revogada.
  const files = produced;
  progress(`[7/7] Montando os artefatos do estudo (índice, tabelão, CSV e JSON): ${files.length} arquivos`);

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
    progress(`[7/7] Gerando o HTML do estudo completo (${Math.floor(html.length / 1024)} KB)`);
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
    premises,
    evidences,
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
