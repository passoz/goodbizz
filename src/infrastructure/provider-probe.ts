/**
 * Teste de um provedor ("testar" na tela de configuracoes): fala com o provedor com a
 * configuracao digitada e devolve um veredito legivel.
 *
 * LLM: `GET {base}/models` valida URL e credencial sem gastar token; se o provedor nao expoe esse
 * caminho (404/405), cai num chat/completions de 1 token, que e o caminho que a geracao usa.
 * Decisor: uma pergunta `noul` minima, porque o contrato System One so tem `POST`.
 */
import { scrub } from "../config/redact.ts";
import { extractAnswers, normalizeDeciderUrl } from "./decider.ts";
import type { ProviderKind } from "../domain/types.ts";

export interface ProviderProbeInput {
  kind: ProviderKind;
  url: string;
  model: string;
  apiKey: string;
}

export interface ProviderProbeResult {
  ok: boolean;
  /** Status HTTP quando houve resposta; `null` quando nem chegou a falar com o provedor. */
  status: number | null;
  detail: string;
  /** Ids dos modelos quando o provedor os expoe (`GET {base}/models`); a UI vira dropdown. */
  models?: string[];
}

const DEFAULT_TIMEOUT_MS = 10_000;

function baseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** Texto do provedor, cortado e sem segredo: e o que o operador le na tela. */
async function readDetail(response: Response): Promise<string> {
  let raw = "";
  try {
    raw = (await response.text()).slice(0, 400);
  } catch {
    raw = "";
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) return response.statusText || "sem corpo";
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      const error = (parsed as Record<string, unknown>)["error"];
      if (typeof error === "string") return scrub(error).slice(0, 200);
      if (error !== null && typeof error === "object" && !Array.isArray(error)) {
        const message = (error as Record<string, unknown>)["message"];
        if (typeof message === "string") return scrub(message).slice(0, 200);
      }
      const message = (parsed as Record<string, unknown>)["message"];
      if (typeof message === "string") return scrub(message).slice(0, 200);
    }
  } catch {
    // corpo nao-JSON (HTML de gateway): devolve o texto cru, ja recortado.
  }
  return scrub(trimmed).slice(0, 200);
}

/** URL inalcancavel, DNS, TLS ou timeout: `status` fica nulo e o motivo vem do runtime. */
function unreachable(error: unknown): ProviderProbeResult {
  const detail = error instanceof Error ? error.message : String(error);
  return { ok: false, status: null, detail: `não foi possível falar com o provedor: ${scrub(detail)}` };
}

/** Resposta de credencial recusada, que e o erro mais comum ao digitar a chave. */
function authHint(status: number, detail: string): string {
  return `a chave foi recusada (HTTP ${status}): ${detail}`;
}

/** Extrai os ids de `{"data":[{...}]}` do catálogo OpenAI-compatível; nada utilizavel vira null. */
function parseModelIds(body: unknown): string[] | null {
  if (body === null || typeof body !== "object" || Array.isArray(body)) return null;
  const data = (body as Record<string, unknown>)["data"];
  if (!Array.isArray(data)) return null;
  return data
    .map((entry) =>
      entry !== null && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)["id"]
        : undefined,
    )
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);
}

/**
 * Catalogo de modelos do gateway, quando ele expoe `GET {base}/models` (o System One puro nao tem
 * GET). Best-effort: qualquer falha aqui e so "sem lista", nunca muda o veredito do teste.
 */
async function tryModelCatalog(base: string, key: string, timeoutMs: number): Promise<string[] | null> {
  const headers: Record<string, string> = { "User-Agent": "goodbizz/2.0" };
  if (key.length > 0) headers["Authorization"] = `Bearer ${key}`;
  try {
    const response = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return null;
    const ids = parseModelIds(await response.json());
    return ids === null || ids.length === 0 ? null : ids;
  } catch {
    return null;
  }
}

async function probeLlm(input: ProviderProbeInput, timeoutMs: number): Promise<ProviderProbeResult> {
  const base = baseUrl(input.url);
  const key = input.apiKey.trim();
  const headers: Record<string, string> = { "User-Agent": "goodbizz/2.0" };
  if (key.length > 0) headers["Authorization"] = `Bearer ${key}`;
  let models: Response;
  try {
    models = await fetch(`${base}/models`, { headers, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    return unreachable(error);
  }
  if (models.ok) {
    let ids: string[] | null = null;
    try {
      ids = parseModelIds(await models.json());
    } catch {
      ids = null;
    }
    return {
      ok: true,
      status: models.status,
      detail:
        ids === null
          ? "o provedor respondeu ao catálogo de modelos"
          : `o provedor respondeu com ${ids.length} modelo(s)`,
      ...(ids === null || ids.length === 0 ? {} : { models: ids }),
    };
  }
  if (models.status === 401 || models.status === 403) {
    return { ok: false, status: models.status, detail: authHint(models.status, await readDetail(models)) };
  }
  if (models.status !== 404 && models.status !== 405) {
    return {
      ok: false,
      status: models.status,
      detail: `o provedor respondeu HTTP ${models.status}: ${await readDetail(models)}`,
    };
  }

  // Sem catálogo de modelos: testa o caminho que a geração realmente usa, com 1 token de saída.
  const chatHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "goodbizz/2.0",
  };
  if (key.length > 0) chatHeaders["Authorization"] = `Bearer ${key}`;
  const payload = JSON.stringify({
    model: input.model.trim(),
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 1,
    stream: false,
  });
  let chat: Response;
  try {
    chat = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: chatHeaders,
      body: payload,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return unreachable(error);
  }
  if (chat.ok) {
    return { ok: true, status: chat.status, detail: "o provedor respondeu a uma geração de 1 token" };
  }
  if (chat.status === 401 || chat.status === 403) {
    return { ok: false, status: chat.status, detail: authHint(chat.status, await readDetail(chat)) };
  }
  return {
    ok: false,
    status: chat.status,
    detail: `o provedor recusou a geração (HTTP ${chat.status}): ${await readDetail(chat)}`,
  };
}

async function probeDecider(input: ProviderProbeInput, timeoutMs: number): Promise<ProviderProbeResult> {
  const url = normalizeDeciderUrl(input.url);
  const key = input.apiKey.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "goodbizz/2.0",
  };
  if (key.length > 0) {
    headers["Authorization"] = `Bearer ${key}`;
    headers["x-api-key"] = key;
  }
  const model = input.model.trim();
  const body: Record<string, unknown> = {
    state: "ping",
    questions: { ping: { type: "noul", instructions: "Responda com sim." } },
  };
  if (model.length > 0) body["model"] = model;
  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    return unreachable(error);
  }
  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      status: response.status,
      detail: authHint(response.status, await readDetail(response)),
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      detail: `o decisor recusou o pedido (HTTP ${response.status}): ${await readDetail(response)}`,
    };
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (error) {
    return { ok: false, status: response.status, detail: `a resposta não é JSON: ${scrub(String(error))}` };
  }
  try {
    extractAnswers(parsed, { ping: { type: "noul", instructions: "Responda com sim." } });
  } catch (error) {
    return {
      ok: false,
      status: response.status,
      detail: `a resposta não segue o contrato System One: ${scrub(String(error))}`,
    };
  }
  // Gateway System One costuma expor modelos em `GET {base}/models` (o contrato so tem POST):
  // tenta o catalogo, e se houver, o "Testar" da tela vira dropdown tambem para o decisor.
  const catalog = await tryModelCatalog(baseUrl(input.url), key, timeoutMs);
  return {
    ok: true,
    status: response.status,
    detail: "o decisor respondeu à pergunta de teste",
    ...(catalog === null ? {} : { models: catalog }),
  };
}

/** Fala com o provedor e devolve o veredito; nunca lanca por falha de rede. */
export async function probeProvider(
  input: ProviderProbeInput,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ProviderProbeResult> {
  if (baseUrl(input.url).length === 0) {
    return { ok: false, status: null, detail: "informe a URL do provedor" };
  }
  return input.kind === "decider" ? probeDecider(input, timeoutMs) : probeLlm(input, timeoutMs);
}
