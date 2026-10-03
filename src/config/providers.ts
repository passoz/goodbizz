/**
 * Configuração efetiva dos provedores de IA: o **perfil ativo** do catálogo salvo em `/settings`
 * sobrepõe o ambiente; sem perfil ativo, cada campo herda a variável de ambiente correspondente.
 *
 * O catálogo é nomeado pelo operador (`ProviderProfile`), então a página não fala de URL e modelo
 * soltos: ela lista nomes e deixa escolher, editar ou excluir.
 */
import type { Env } from "./env.ts";
import type { ProviderKind, ProviderProfile, ProviderSettings } from "../domain/types.ts";

export interface ProviderConfig {
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  deciderUrl: string;
  deciderApiKey: string;
  deciderModel: string;
}

/** Perfil ativo de um tipo, ou `null` quando a vez é do ambiente. */
export function activeProfile(settings: ProviderSettings, kind: ProviderKind): ProviderProfile | null {
  const id = kind === "llm" ? settings.activeLlm : settings.activeDecider;
  if (typeof id !== "string" || id.length === 0) return null;
  return (settings.profiles ?? []).find((profile) => profile.id === id && profile.kind === kind) ?? null;
}

/** Valor efetivo de cada campo (perfil ativo sobrepõe o ambiente). */
export function effectiveProviders(env: Env, settings: ProviderSettings): ProviderConfig {
  const llm = activeProfile(settings, "llm");
  const decider = activeProfile(settings, "decider");
  return {
    llmBaseUrl: llm?.url ?? env.LLM_API_URL,
    llmApiKey: llm?.apiKey ?? env.LLM_API_KEY,
    llmModel: llm?.model ?? env.LLM_API_MODEL,
    deciderUrl: decider?.url ?? env.DECISION_API_URL,
    deciderApiKey: decider?.apiKey ?? env.DECISION_API_KEY,
    deciderModel: decider?.model ?? env.DECISION_API_MODEL,
  };
}

/**
 * Impressão estável da configuração efetiva de provedores. Entra nas chaves do cache de respostas:
 * trocar de perfil ativo (ou editar URL/modelo/chave) muda a impressão, e as respostas gravadas
 * pelo provedor anterior deixam de ser servidas — estudar de novo com o provedor novo gera de
 * verdade no provedor novo.
 */
export function cacheFingerprint(cfg: ProviderConfig): string {
  return [
    cfg.llmBaseUrl,
    cfg.llmModel,
    cfg.llmApiKey,
    cfg.deciderUrl,
    cfg.deciderModel,
    cfg.deciderApiKey,
  ].join("|");
}

/**
 * Rótulos curtos e sem segredo do que roda de verdade agora (perfil ativo sobre o ambiente),
 * por função. A página os calcula a cada leitura: mudar o ativo em /settings vale no /new sem
 * reiniciar o serviço.
 */
export function providerLabels(env: Env, settings: ProviderSettings): { llm: string; decider: string } {
  const mockLlm = env.GOODBIZZ_MOCK || env.GOODBIZZ_MOCK_LLM;
  const mockDecider = env.GOODBIZZ_MOCK || env.GOODBIZZ_MOCK_DECIDER;
  const llm = activeProfile(settings, "llm");
  const decider = activeProfile(settings, "decider");
  return {
    llm: mockLlm
      ? "texto simulado"
      : `texto real (${(llm?.model || env.LLM_API_MODEL).trim() || "não definido"})`,
    decider: mockDecider
      ? "números simulados"
      : `numeros reais (${(decider?.model || env.DECISION_API_MODEL).trim() || "não definido"})`,
  };
}

/** `sk-1234567890abcd` -> `sk-…abcd`; vazio continua vazio (a UI mostra "não definido"). */
export function maskSecret(value: string): string {
  const clean = value.trim();
  if (clean.length === 0) return "";
  if (clean.length <= 8) return "•".repeat(clean.length);
  return `${clean.slice(0, 3)}…${clean.slice(-4)}`;
}

/** Provedor como a UI e a API podem mostrar: nome, tipo, URL, modelo e a chave **mascarada**. */
export interface ProviderProfileView {
  id: string;
  name: string;
  kind: ProviderKind;
  url: string;
  model: string;
  apiKey: string;
  hasKey: boolean;
}

/** Catálogo visível, sem nunca devolver a chave em claro. */
export function profileViews(settings: ProviderSettings): ProviderProfileView[] {
  return (settings.profiles ?? []).map((profile) => ({
    id: profile.id,
    name: profile.name,
    kind: profile.kind,
    url: profile.url,
    model: profile.model,
    apiKey: maskSecret(profile.apiKey),
    hasKey: profile.apiKey.trim().length > 0,
  }));
}

/** O que o ambiente oferece quando nenhum perfil está ativo — a primeira opção de cada lista. */
export interface ProviderDefaultView {
  url: string;
  model: string;
  hasKey: boolean;
}

export function envProviderDefaults(env: Env): { llm: ProviderDefaultView; decider: ProviderDefaultView } {
  return {
    llm: {
      url: env.LLM_API_URL,
      model: env.LLM_API_MODEL,
      hasKey: env.LLM_API_KEY.trim().length > 0,
    },
    decider: {
      url: env.DECISION_API_URL,
      model: env.DECISION_API_MODEL,
      hasKey: env.DECISION_API_KEY.trim().length > 0,
    },
  };
}
