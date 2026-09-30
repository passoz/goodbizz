/**
 * Persistência da configuração de provedores: uma linha só (`id = 1`) com o JSON do remendo.
 * Sem SQL cru — Drizzle, como o resto do acesso a dados.
 */
import { eq } from "drizzle-orm";

import type { Db } from "./db.ts";
import { settings } from "./schema.ts";
import type { SettingsRepository } from "../domain/ports.ts";
import type { ProviderSettings, ProviderSettingsPatch } from "../domain/types.ts";

const SINGLETON = 1;

/** Só campos com string não vazia sobrevivem; o resto volta a herdar o ambiente. */
function sanitize(patch: ProviderSettingsPatch, base: ProviderSettings): ProviderSettings {
  const next: ProviderSettings = { ...base };
  for (const [key, value] of Object.entries(patch) as Array<
    [keyof ProviderSettings, string | null | undefined]
  >) {
    if (value === null || value === undefined || value.trim().length === 0) {
      delete next[key];
      continue;
    }
    next[key] = value.trim();
  }
  return next;
}

export class SqliteSettingsRepository implements SettingsRepository {
  constructor(private readonly db: Db) {}

  async get(): Promise<ProviderSettings> {
    const row = this.db.select().from(settings).where(eq(settings.id, SINGLETON)).get();
    if (!row) return {};
    try {
      const parsed: unknown = JSON.parse(row.data);
      return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as ProviderSettings)
        : {};
    } catch {
      return {};
    }
  }

  async patch(patch: ProviderSettingsPatch): Promise<ProviderSettings> {
    const next = sanitize(patch, await this.get());
    const data = JSON.stringify(next);
    this.db
      .insert(settings)
      .values({ id: SINGLETON, data })
      .onConflictDoUpdate({ target: settings.id, set: { data } })
      .run();
    return next;
  }
}
