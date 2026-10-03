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
  /**
   * Momento em que a ideia foi gerada e avaliada (ISO). Opcional porque ideias anteriores à
   * coluna `generated_at` não têm data; a UI omite o rótulo quando falta.
   */
  generatedAt?: string;
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
  /** Título exibido do estudo (normalizado, no máximo 50 caracteres digitados). */
  niche: string;
  /** Contexto do estudo, concatenado ao título antes de toda chamada a provedor. Vazio = não informado. */
  description: string;
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
  /**
   * Semente do cache de respostas: o id do estudo. Vazio na CLI de tiro único.
   *
   * É ela que separa dois estudos de mesmo título — criar, excluir e recriar devolve conteúdo
   * novo — e que preserva a retomada, porque o id sobrevive à reexecução e só morre na exclusão.
   */
  cacheSeed: string;
  /**
   * Impressão dos provedores efetivos no momento da execucao (URL/modelo/chave ativos de cada
   * funcao). Entra nas chaves do cache de respostas: trocar de provedor muda a chave, e a
   * resposta gravada pelo provedor anterior nunca e servida para o novo.
   */
  providerFingerprint: string;
}

export type StudyState = "pending" | "running" | "done" | "failed";

export interface StudyProgress {
  state: StudyState;
  step: string;
  error: string | null;
}

/**
 * Provedor de IA: texto (LLM) ou decisao (System One).
 */
export type ProviderKind = "llm" | "decider";

/**
 * Provedor nomeado pelo operador. O `name` e o que aparece na lista; `url`, `model` e `apiKey` sao
 * como falar com ele. O `apiKey` nunca sai do servidor em claro.
 */
export interface ProviderProfile {
  id: string;
  name: string;
  kind: ProviderKind;
  /** Base do provedor (LLM: `.../v1`; decisor: a que o cliente normaliza para `/systemone`). */
  url: string;
  model: string;
  /** Chave da API; vazia quando o provedor nao exige. */
  apiKey: string;
}

/**
 * Configuracao de provedores: catalogo nomeado e qual perfil esta ativo por funcao. Sem perfil
 * ativo, os campos voltam a herdar o ambiente — a pagina `/settings` mostra esse padrao como a
 * primeira opcao de cada lista.
 */
export interface ProviderSettings {
  profiles?: ProviderProfile[];
  activeLlm?: string | null;
  activeDecider?: string | null;
}

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
  /** Contexto informado na criação; entra no prompt ao lado do título, nunca no título. */
  description: string;
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
