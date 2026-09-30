/**
 * Domain types. Pure data and enums — no framework, no I/O.
 *
 * The artifact-facing field names mirror the Python baseline so that the files written to disk
 * (markdown, csv, dados.json) keep the same key scheme and remain consumable by `recalibrate`.
 */

export interface Idea {
  name: string;
  sector: string;
  description: string;
}

export type StrongProbe = "dinheiro" | "reputacao";
export type InternalProbe = "processo" | "tecnologia";
export type ProbeKey = StrongProbe | InternalProbe;
export type PainLabel = "FORTE" | "FRACA" | "INDETERMINADO" | "INSTAVEL";
export type Tier = "A" | "B" | "C";
export type ScoreKey = "fit" | "venda" | "disrupcao" | "preco";
export type ChoiceKey = "dinheiro_direto" | "reputacao" | "backoffice";
export type PainMethod = "choice" | "noul";

/** Question envelope sent to a System One decider. */
export type Question =
  | { type: "noul"; instructions: string }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "choice"; instructions: string; criteria: Record<string, string> };

export type QuestionSet = Record<string, Question>;
export type DeciderAnswer = Record<string, unknown>;
export type DeciderAnswers = Record<string, DeciderAnswer>;

export interface PainResult {
  label: PainLabel;
  painScore: number;
  internalScore: number;
  margin: number;
  deviation: number;
  escalate: boolean;
  reason: string;
  /** Mean per probe across paraphrases. */
  detail: Record<string, number>;
  /** Raw probability per paraphrase, then per probe. */
  byParaphrase: Record<string, Record<string, number>>;
}

export interface Indicators {
  fit: number;
  fitConf: number;
  sale: number;
  saleConf: number;
  disruption: number;
  disruptionConf: number;
  pain: string;
  painProbs: Record<string, number>;
  painConf: number;
  solo: number;
}

export interface BusinessBlock {
  wtp: number;
  meta30: number;
  price: number;
  priceConf: number;
}

export interface PainBlock {
  label: string;
  painScore: number;
  internalScore: number;
  margin: number;
  deviation: number;
  probes: Record<string, number>;
  byParaphrase: Record<string, Record<string, number>>;
}

export interface IdeaEvaluation {
  name: string;
  sector: string;
  description: string;
  indicators: Indicators;
  business: BusinessBlock;
  algorithm: PainBlock;
  index: number;
  tier: Tier;
}

/**
 * Avaliacao com a identidade da ideia dentro do estudo.
 *
 * `id` fica aqui, e nao em `IdeaEvaluation`, porque a forma do baseline (`dados.json` e
 * `payload_json`) e lida e escrita por ferramentas Python que casam por chave (CON-006).
 * Acrescentar `id` a essa forma quebraria `evaluationFromJson`, que nao tem como
 * reconstruir um id que nunca foi serializado. Como subtipo, toda leitura so do baseline
 * continua aceitando `IdeaEvaluation`, e o `id` aparece so onde a ideia tem identidade.
 */
export interface StudyIdea extends IdeaEvaluation {
  id: string;
}

export interface PainGroups {
  forte: string[];
  mista: string[];
  fraca: string[];
}

export interface StudyMeans {
  fit: number;
  sale: number;
  disruption: number;
  solo: number;
  wtp: number;
  meta30: number;
}

export interface StudySummary {
  ordered: StudyIdea[];
  painGroups: PainGroups;
  means: StudyMeans;
  tiers: Record<Tier, string[]>;
  attack: string[];
  review: string[];
}

export interface StudyConfig {
  niche: string;
  city: string;
  monthlyTicket: number;
  numIdeas: number;
  outputDir: string;
  ideasFile: string;
  evaluateOnly: boolean;
  painMethod: PainMethod;
  mock: boolean;
  mockLlm: boolean;
  mockDecider: boolean;
  pdf: boolean;
  paraphrases: number;
  concurrency: number;
  timeout: number;
  llmBaseUrl: string;
  llmModel: string;
  llmKey: string;
  deciderUrl: string;
  deciderModel: string;
  deciderKey: string;
}

export type StudyState = "pending" | "running" | "done" | "failed";

export interface StudyProgress {
  state: StudyState;
  step: string;
  error: string | null;
}

/**
 * Configuração de provedores definida em runtime (aba `/settings`).
 * Campo ausente (ou string vazia) = herda o ambiente; por isso a precedência é sempre
 * `settings ?? env`.
 */
export interface ProviderSettings {
  llmBaseUrl?: string;
  llmApiKey?: string;
  llmModel?: string;
  deciderUrl?: string;
  deciderApiKey?: string;
  deciderModel?: string;
}

/** Remendo de configuração: `null` limpa o campo e volta a herdar o ambiente. */
export type ProviderSettingsPatch = { [K in keyof ProviderSettings]?: string | null };

/** Consumo acumulado de um provedor. Tokens só quando o provedor informa. */
export interface ProviderUsage {
  calls: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

/** Consumo de um estudo: LLM (texto) + decisor (System One). */
export interface StudyUsage {
  llm: ProviderUsage;
  decider: ProviderUsage;
}

export interface StudyRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  niche: string;
  city: string;
  monthlyTicket: number;
  numIdeas: number;
  painMethod: PainMethod;
  mock: boolean;
  artifactDir: string;
  brief: string;
  progress: StudyProgress;
  evaluations: StudyIdea[];
  summary: StudySummary | null;
  /** Consumo medido no pipeline; `null` em estudos gerados antes desta versão. */
  usage: StudyUsage | null;
}

export interface StudyListItem {
  id: string;
  createdAt: string;
  niche: string;
  city: string;
  monthlyTicket: number;
  state: StudyState;
  step: string;
  ideaCount: number;
  topIdea: string | null;
  topIndex: number | null;
  usage: StudyUsage | null;
}
