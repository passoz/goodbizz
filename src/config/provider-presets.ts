/**
 * Configurações prontas de provedores conhecidos: preenchem nome, URL e modelo, e o operador
 * informa só a chave. O "adicionar provedor" sem preset continua aceitando qualquer URL.
 *
 * `catalogUrl` existe para o decisor: o "Testar" lista modelos em `{url}/models`, mas o endpoint
 * System One não expõe catálogo. Quando informado, é de lá que a lista vem.
 */
import type { ProviderKind } from "../domain/types.ts";

export interface ProviderPreset {
  id: string;
  kind: ProviderKind;
  name: string;
  url: string;
  model: string;
  /** Base de `GET {base}/models` quando não é a própria URL (ex.: decisor System One). */
  catalogUrl?: string;
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "opencode-go",
    kind: "llm",
    name: "OpenCode Go",
    url: "https://opencode.ai/inference/go/openai/v1",
    model: "deepseek-v4.1-flash",
  },
  {
    id: "openai",
    kind: "llm",
    name: "OpenAI",
    url: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  {
    id: "anthropic",
    kind: "llm",
    name: "Anthropic",
    url: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-5",
  },
  {
    id: "openrouter",
    kind: "llm",
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o-mini",
  },
  {
    id: "typesafe-jev",
    kind: "decider",
    name: "TypeSafe (Jev)",
    url: "https://api.typesafe.ai/v1",
    model: "jev-latest",
    catalogUrl: "https://api.typesafe.ai/v1",
  },
  {
    id: "opencode-go-jev",
    kind: "decider",
    name: "OpenCode Go (Jev)",
    url: "https://opencode.ai/inference/go/systemone/v1/systemone",
    model: "jev-1.14",
    catalogUrl: "https://opencode.ai/inference/go/openai/v1",
  },
  {
    id: "bing",
    kind: "search",
    name: "Bing (sem chave)",
    url: "https://www.bing.com",
    model: "",
  },
  {
    id: "tavily",
    kind: "search",
    name: "Tavily",
    url: "https://api.tavily.com",
    model: "",
  },
];
