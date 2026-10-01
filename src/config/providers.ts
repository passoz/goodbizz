/**
 * Configuração efetiva dos provedores de IA: **ambiente** com sobreposição do que estiver salvo em
 * runtime na aba `/settings`. O código não decide por conta própria — cada campo ausente na
 * configuração salva simplesmente herda a variável de ambiente correspondente.
 */
import type { Env } from "./env.ts";
import type { ProviderSettings } from "../domain/types.ts";

export interface ProviderConfig {
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  deciderUrl: string;
  deciderApiKey: string;
  deciderModel: string;
}

export type ProviderSource = "settings" | "env" | "vazio";

/** Campos do contrato, na ordem em que a UI mostra. */
export const PROVIDER_FIELDS: Array<{
  key: keyof ProviderConfig;
  settingKey: keyof ProviderSettings;
  envKey: keyof Env;
  label: string;
  secret: boolean;
}> = [
  { key: "llmBaseUrl", settingKey: "llmBaseUrl", envKey: "LLM_API_URL", label: "URL do LLM", secret: false },
  { key: "llmModel", settingKey: "llmModel", envKey: "LLM_API_MODEL", label: "Modelo do LLM", secret: false },
  { key: "llmApiKey", settingKey: "llmApiKey", envKey: "LLM_API_KEY", label: "Chave do LLM", secret: true },
  {
    key: "deciderUrl",
    settingKey: "deciderUrl",
    envKey: "DECISION_API_URL",
    label: "URL do decisor",
    secret: false,
  },
  {
    key: "deciderModel",
    settingKey: "deciderModel",
    envKey: "DECISION_API_MODEL",
    label: "Modelo do decisor",
    secret: false,
  },
  {
    key: "deciderApiKey",
    settingKey: "deciderApiKey",
    envKey: "DECISION_API_KEY",
    label: "Chave do decisor",
    secret: true,
  },
];

/**
 * Agrupamento exibido na página de configurações: cada provedor tem o seu bloco, com legenda que
 * nomeia o provedor e explica a função dos campos. Juntos, os `keys` dos grupos cobrem todos os
 * `PROVIDER_FIELDS` — a página não pode esconder um campo por esquecimento.
 */
export interface ProviderGroup {
  id: string;
  /** Legenda do bloco: nomeia o provedor, não o campo. */
  title: string;
  description: string;
  keys: Array<keyof ProviderConfig>;
}

export const PROVIDER_GROUPS: ProviderGroup[] = [
  {
    id: "llm",
    title: "Provedor de texto (LLM)",
    description:
      "Escreve o brief e os planos de cada ideia. Todo número do texto passa pelo guardrail da medição.",
    keys: ["llmBaseUrl", "llmModel", "llmApiKey"],
  },
  {
    id: "decider",
    title: "Provedor de decisão (System One)",
    description:
      "Responde as probabilidades que viram índice de ação, tier e natureza da dor. Não escreve prosa.",
    keys: ["deciderUrl", "deciderModel", "deciderApiKey"],
  },
];

function usesSetting(value: string | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Valor efetivo de cada campo (settings sobrepõem o ambiente). */
export function effectiveProviders(env: Env, settings: ProviderSettings): ProviderConfig {
  const pick = (settingValue: string | undefined, envValue: string): string =>
    usesSetting(settingValue) ? settingValue.trim() : envValue;
  return {
    llmBaseUrl: pick(settings.llmBaseUrl, env.LLM_API_URL),
    llmApiKey: pick(settings.llmApiKey, env.LLM_API_KEY),
    llmModel: pick(settings.llmModel, env.LLM_API_MODEL),
    deciderUrl: pick(settings.deciderUrl, env.DECISION_API_URL),
    deciderApiKey: pick(settings.deciderApiKey, env.DECISION_API_KEY),
    deciderModel: pick(settings.deciderModel, env.DECISION_API_MODEL),
  };
}

/** De onde veio cada campo efetivo — a UI mostra isso em cada linha. */
export function providerSources(
  env: Env,
  settings: ProviderSettings,
): Record<keyof ProviderConfig, ProviderSource> {
  const out = {} as Record<keyof ProviderConfig, ProviderSource>;
  for (const field of PROVIDER_FIELDS) {
    const fromSettings = usesSetting(settings[field.settingKey]);
    const envValue = env[field.envKey];
    out[field.key] = fromSettings
      ? "settings"
      : typeof envValue === "string" && envValue.length > 0
        ? "env"
        : "vazio";
  }
  return out;
}

/** `sk-1234567890abcd` -> `sk-…abcd`; vazio continua vazio (a UI mostra "não definido"). */
export function maskSecret(value: string): string {
  const clean = value.trim();
  if (clean.length === 0) return "";
  if (clean.length <= 8) return "•".repeat(clean.length);
  return `${clean.slice(0, 3)}…${clean.slice(-4)}`;
}

/** Linha da tabela de configuração exibida na UI e na API (chave sempre mascarada). */
export interface ProviderSettingRow {
  key: keyof ProviderConfig;
  label: string;
  secret: boolean;
  source: ProviderSource;
  /** Valor efetivo (mascarado quando for segredo). */
  value: string;
}

/** Visão da configuração efetiva: valor, origem e máscara — nunca devolve a chave em claro. */
export function providerSettingsView(env: Env, settings: ProviderSettings): ProviderSettingRow[] {
  const effective = effectiveProviders(env, settings);
  const sources = providerSources(env, settings);
  return PROVIDER_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    secret: field.secret,
    source: sources[field.key],
    value: field.secret ? maskSecret(effective[field.key]) : effective[field.key],
  }));
}
