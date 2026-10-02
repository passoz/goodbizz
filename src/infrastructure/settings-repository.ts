/**
 * Persistencia da configuracao de provedores: uma linha so (`id = 1`) com o JSON do catalogo.
 * Sem SQL cru — Drizzle, como o resto do acesso a dados.
 *
 * O formato antigo (campos soltos `llmBaseUrl`, `llmModel`, `llmApiKey`, `decider*`) e migrado na
 * leitura para dois perfis "Padrao", para nenhuma configuracao do operador desaparecer.
 */
import { eq } from "drizzle-orm";

import type { Db } from "./db.ts";
import { settings } from "./schema.ts";
import type { SettingsRepository } from "../domain/ports.ts";
import type { ProviderProfile, ProviderSettings, ProviderKind } from "../domain/types.ts";

const SINGLETON = 1;

/** Ids estaveis dos perfis sintetizados a partir do formato antigo. */
const LEGACY_LLM_ID = "legacy-llm";
const LEGACY_DECIDER_ID = "legacy-decider";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asProfile(value: unknown): ProviderProfile | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const kind = raw.kind === "decider" ? "decider" : raw.kind === "llm" ? "llm" : null;
  const id = asString(raw.id).trim();
  const name = asString(raw.name).trim();
  if (kind === null || id.length === 0 || name.length === 0) return null;
  return {
    id,
    name,
    kind,
    url: asString(raw.url).trim(),
    model: asString(raw.model).trim(),
    apiKey: asString(raw.apiKey).trim(),
  };
}

/** Perfil legado, so quando havia alguma configuracao: vazio herdaria o ambiente e nao vira perfil. */
function legacyProfile(
  id: string,
  name: string,
  kind: ProviderKind,
  raw: Record<string, unknown>,
  keys: readonly [string, string, string],
): ProviderProfile | null {
  const [urlKey, modelKey, keyKey] = keys;
  const url = asString(raw[urlKey]).trim();
  const model = asString(raw[modelKey]).trim();
  const apiKey = asString(raw[keyKey]).trim();
  if (url.length === 0 && model.length === 0 && apiKey.length === 0) return null;
  return { id, name, kind, url, model, apiKey };
}

/** Formato antigo -> catalogo. Sem nada salvo, o resultado e um catalogo vazio (tudo do ambiente). */
export function migrateLegacySettings(raw: Record<string, unknown>): ProviderSettings {
  const llm = legacyProfile(LEGACY_LLM_ID, "Padrão", "llm", raw, ["llmBaseUrl", "llmModel", "llmApiKey"]);
  const decider = legacyProfile(LEGACY_DECIDER_ID, "Padrão", "decider", raw, [
    "deciderUrl",
    "deciderModel",
    "deciderApiKey",
  ]);
  const profiles = [llm, decider].filter((profile): profile is ProviderProfile => profile !== null);
  return {
    profiles,
    activeLlm: llm === null ? null : llm.id,
    activeDecider: decider === null ? null : decider.id,
  };
}

/** Le um estado ja no formato novo, ignorando lixo. */
function readSettings(raw: Record<string, unknown>): ProviderSettings {
  if (!Array.isArray(raw.profiles)) return migrateLegacySettings(raw);
  const profiles = raw.profiles
    .map((value) => asProfile(value))
    .filter((profile): profile is ProviderProfile => profile !== null);
  const active = (value: unknown, kind: ProviderKind): string | null => {
    const id = asString(value).trim();
    const profile = profiles.find((candidate) => candidate.id === id && candidate.kind === kind);
    return profile === undefined ? null : profile.id;
  };
  return {
    profiles,
    activeLlm: active(raw.activeLlm, "llm"),
    activeDecider: active(raw.activeDecider, "decider"),
  };
}

/** Normaliza antes de gravar: ids unicos, nomes preenchidos e ativos apontando para perfil do tipo. */
export function normalizeSettings(value: ProviderSettings): ProviderSettings {
  const seen = new Set<string>();
  const profiles: ProviderProfile[] = [];
  for (const candidate of value.profiles ?? []) {
    const profile = asProfile(candidate);
    if (profile === null || seen.has(profile.id)) continue;
    seen.add(profile.id);
    profiles.push(profile);
  }
  const pick = (id: string | null | undefined, kind: ProviderKind): string | null => {
    const found = profiles.find((profile) => profile.id === id && profile.kind === kind);
    return found === undefined ? null : found.id;
  };
  return {
    profiles,
    activeLlm: pick(value.activeLlm, "llm"),
    activeDecider: pick(value.activeDecider, "decider"),
  };
}

export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: Db) {}

  async get(): Promise<ProviderSettings> {
    const row = this.db.select().from(settings).where(eq(settings.id, SINGLETON)).get();
    if (!row) return { profiles: [], activeLlm: null, activeDecider: null };
    try {
      const parsed: unknown = JSON.parse(row.data);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return { profiles: [], activeLlm: null, activeDecider: null };
      }
      return readSettings(parsed as Record<string, unknown>);
    } catch {
      return { profiles: [], activeLlm: null, activeDecider: null };
    }
  }

  async save(value: ProviderSettings): Promise<ProviderSettings> {
    const next = normalizeSettings(value);
    const data = JSON.stringify(next);
    this.db
      .insert(settings)
      .values({ id: SINGLETON, data })
      .onConflictDoUpdate({ target: settings.id, set: { data } })
      .run();
    return next;
  }
}
