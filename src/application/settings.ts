/**
 * Configuracao de provedores em memoria, com o banco como fonte de verdade.
 *
 * Os clientes de IA resolvem a configuracao a cada chamada e precisam de leitura **sincrona**
 * (nao da para await dentro do `resolve()`), entao o catalogo fica em cache aqui e e recarregado
 * no boot e a cada gravacao.
 */
import { randomUUID } from "node:crypto";

import { ValidationError, NotFoundError } from "../domain/errors.ts";
import type { SettingsRepository } from "../domain/ports.ts";
import type { ProviderKind, ProviderProfile, ProviderSettings } from "../domain/types.ts";

const EMPTY: ProviderSettings = { profiles: [], activeLlm: null, activeDecider: null };

/** Dados de um provedor vindos da borda; o id e gerado pelo servidor. */
export interface ProviderProfileInput {
  name: string;
  kind: ProviderKind;
  url: string;
  model: string;
  apiKey?: string;
}

function clean(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function requires(label: string, value: string): void {
  if (value.length === 0) throw new ValidationError(`${label} é obrigatório`);
}

/** Valida e normaliza o que a borda mandou: sem nome, URL ou modelo nao ha provedor utilizavel. */
function validate(input: ProviderProfileInput | Partial<ProviderProfileInput>): void {
  if (input.name !== undefined) requires("o nome do provedor", clean(input.name));
  if (input.kind !== undefined && input.kind !== "llm" && input.kind !== "decider") {
    throw new ValidationError("tipo de provedor inválido");
  }
  if (input.url !== undefined) requires("a URL do provedor", clean(input.url));
  if (input.model !== undefined) requires("o modelo", clean(input.model));
}

export class ProviderSettingsStore {
  private cache: ProviderSettings = { ...EMPTY };

  constructor(private readonly repo: SettingsRepository) {}

  /** Carrega do banco (boot). Falha de leitura deixa o catalogo vazio = tudo do ambiente. */
  async load(): Promise<ProviderSettings> {
    this.cache = await this.repo.get();
    return this.current();
  }

  /** Copia do estado atual; o chamador nunca mexe no cache por engano. */
  current(): ProviderSettings {
    return {
      profiles: this.cache.profiles?.map((profile) => ({ ...profile })) ?? [],
      activeLlm: this.cache.activeLlm ?? null,
      activeDecider: this.cache.activeDecider ?? null,
    };
  }

  private async persist(next: ProviderSettings): Promise<ProviderSettings> {
    this.cache = await this.repo.save(next);
    return this.current();
  }

  /** Cria um provedor e o deixa ativo para o tipo dele (quem acabou de configurar quer usar). */
  async create(input: ProviderProfileInput): Promise<ProviderSettings> {
    validate(input);
    const profile: ProviderProfile = {
      id: randomUUID(),
      name: clean(input.name),
      kind: input.kind,
      url: clean(input.url),
      model: clean(input.model),
      apiKey: clean(input.apiKey),
    };
    const state = this.current();
    state.profiles?.push(profile);
    if (profile.kind === "llm") state.activeLlm = profile.id;
    else state.activeDecider = profile.id;
    return this.persist(state);
  }

  /**
   * Edita um provedor. Campo ausente nao mexe; chave vazia mantem a que ja estava (a UI nunca
   * devolve a chave em claro, entao "vazio" significa "nao trocar" e nao "apagar").
   */
  async update(id: string, input: Partial<ProviderProfileInput>): Promise<ProviderSettings> {
    validate(input);
    const state = this.current();
    const profile = state.profiles?.find((candidate) => candidate.id === id);
    if (profile === undefined) throw new NotFoundError(`provedor ${id} nao encontrado`);
    if (input.name !== undefined) profile.name = clean(input.name);
    if (input.url !== undefined) profile.url = clean(input.url);
    if (input.model !== undefined) profile.model = clean(input.model);
    const apiKey = clean(input.apiKey);
    if (apiKey.length > 0) profile.apiKey = apiKey;
    return this.persist(state);
  }

  /** Remove o provedor e limpa o ativo quando era ele. */
  async remove(id: string): Promise<ProviderSettings> {
    const state = this.current();
    const profile = state.profiles?.find((candidate) => candidate.id === id);
    if (profile === undefined) throw new NotFoundError(`provedor ${id} nao encontrado`);
    state.profiles = (state.profiles ?? []).filter((candidate) => candidate.id !== id);
    if (state.activeLlm === id) state.activeLlm = null;
    if (state.activeDecider === id) state.activeDecider = null;
    return this.persist(state);
  }

  /** `null` volta a herdar o ambiente para aquele tipo. */
  async setActive(kind: ProviderKind, id: string | null): Promise<ProviderSettings> {
    const state = this.current();
    if (id !== null) {
      const profile = state.profiles?.find((candidate) => candidate.id === id && candidate.kind === kind);
      if (profile === undefined) throw new NotFoundError(`provedor ${id} nao encontrado para ${kind}`);
    }
    if (kind === "llm") state.activeLlm = id;
    else state.activeDecider = id;
    return this.persist(state);
  }
}
