/**
 * Configuração de provedores em memória, com o banco como fonte de verdade.
 *
 * Os clientes de IA resolvem a configuração a cada chamada e precisam de leitura **síncrona**
 * (não dá para await dentro do `resolve()`), então a linha do banco fica em cache aqui e é
 * recarregada no boot e a cada gravação.
 */
import type { SettingsRepository } from "../domain/ports.ts";
import type { ProviderSettings, ProviderSettingsPatch } from "../domain/types.ts";

export class ProviderSettingsStore {
  private cache: ProviderSettings = {};

  constructor(private readonly repo: SettingsRepository) {}

  /** Carrega do banco (boot). Falha de leitura deixa a configuração vazia = tudo do ambiente. */
  async load(): Promise<ProviderSettings> {
    this.cache = await this.repo.get();
    return this.cache;
  }

  /** O que está salvo em runtime (campos ausentes herdam o ambiente). */
  current(): ProviderSettings {
    return { ...this.cache };
  }

  /** Aplica o remendo, persiste e atualiza o cache. */
  async patch(patch: ProviderSettingsPatch): Promise<ProviderSettings> {
    this.cache = await this.repo.patch(patch);
    return this.current();
  }
}
