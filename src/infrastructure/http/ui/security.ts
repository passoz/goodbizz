/**
 * CSRF da interface: esquema double-submit com cookie assinado.
 *
 * O token cru vai para `c.get("csrfToken")` (o formulario reflete em campo oculto) e a copia
 * assinada vai para o cookie. A checagem exige mesma origem e comparacao em tempo constante;
 * metodos seguros (GET/HEAD/OPTIONS) passam direto.
 *
 * O segredo e o modo vem do chamador (`buildUiApp` recebe ambos do ambiente validado), nunca de
 * uma leitura de ambiente escondida aqui: sem segredo injetado nao existe middleware.
 */
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import type { Context, MiddlewareHandler } from "hono";

export const CSRF_COOKIE = "csrf";
export const CSRF_FIELD = "_csrf";
export const CSRF_HEADER = "X-CSRF-Token";

export type UiEnv = { Variables: { csrfToken: string } };

export interface CsrfOptions {
  /** Signing key for the double-submit cookie (>= 32 chars, validated at startup). */
  sessionSecret: string;
  /** When true the cookie is marked `Secure` (TLS-only deployment). */
  production?: boolean;
  /** Diagnostico de recusa: sem os sinais do cliente, um 403 e impossivel de explicar depois. */
  logger?: { warn(message: string, meta?: Record<string, unknown>): void };
}

export interface CsrfMiddleware {
  issueCsrfToken: MiddlewareHandler<UiEnv>;
  requireCsrf: MiddlewareHandler<UiEnv>;
}

const SAFE_METHODS: Record<string, true> = { GET: true, HEAD: true, OPTIONS: true };

/** Token opaco de 32 bytes em hexadecimal. */
function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Token do campo de formulario, quando o corpo e de formulario. */
async function formToken(c: Context<UiEnv>): Promise<string | null> {
  try {
    const body = await c.req.parseBody();
    const value = body[CSRF_FIELD];
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/** Builds the double-submit middleware pair bound to one session secret. */
export function createCsrf(options: CsrfOptions): CsrfMiddleware {
  const { sessionSecret, production = false, logger } = options;

  const issueCsrfToken: MiddlewareHandler<UiEnv> = async (c, next) => {
    // Emit the cookie only when it does not exist yet: rotating the token on every response would
    // invalidate every form already open (second tab, back button) with a 403 on submit.
    let token = await getSignedCookie(c, sessionSecret, CSRF_COOKIE);
    if (typeof token !== "string" || token.length === 0) {
      token = randomToken();
      await setSignedCookie(c, CSRF_COOKIE, token, sessionSecret, {
        httpOnly: false,
        sameSite: "Lax",
        path: "/",
        secure: production,
      });
    }
    c.set("csrfToken", token);
    await next();
  };

  const requireCsrf: MiddlewareHandler<UiEnv> = async (c, next) => {
    if (SAFE_METHODS[c.req.method] === true) {
      await next();
      return;
    }

    // O token do double-submit e a defesa principal e vem primeiro: o cookie e `SameSite=Lax`,
    // entao um POST de outra origem nem chega com ele, e o valor assinado de 32 bytes nao e
    // adivinhavel nem legivel por outra origem. Comparacao em tempo constante (tamanho antes,
    // como o runtime exige).
    const expected = await getSignedCookie(c, sessionSecret, CSRF_COOKIE);
    const provided = c.req.header(CSRF_HEADER) ?? (await formToken(c));
    const expectedBytes = typeof expected === "string" ? new TextEncoder().encode(expected) : null;
    const providedBytes = provided === null ? null : new TextEncoder().encode(provided);
    const tokenOk =
      expectedBytes !== null &&
      providedBytes !== null &&
      expectedBytes.length === providedBytes.length &&
      crypto.timingSafeEqual(expectedBytes, providedBytes);
    if (!tokenOk) {
      // Sem segredo no log: so a presenca do cookie e do token, que e o que distingue "cliente sem
      // cookie" de "token divergente" quando o operador relata um 403.
      logger?.warn("csrf recusado: token ausente ou divergente", {
        path: c.req.path,
        hasCookie: expectedBytes !== null,
        hasToken: providedBytes !== null,
      });
      return c.json({ error: "CSRF_TOKEN_INVALID" }, 403);
    }

    // Os sinais de origem so VETAM quando apontam inequivocamente para outro site. `Origin: null`
    // (origem opaca: extensao, iframe sandbox, politica de privacidade) e `sec-fetch-site: none`
    // ou `same-site` nao decidem nada — quem decide ja foi o token, e um ataque cross-site com
    // `Origin: null` chega sem o cookie `SameSite=Lax` e morre no token acima.
    const own = new URL(c.req.url).origin;
    const origin = c.req.header("Origin");
    const secFetchSite = c.req.header("Sec-Fetch-Site");
    const crossSite =
      (origin !== undefined && origin !== "null" && origin !== own) || secFetchSite === "cross-site";
    if (crossSite) {
      logger?.warn("csrf recusado: sinal de origem divergente", {
        path: c.req.path,
        host: c.req.header("host"),
        origin,
        referer: c.req.header("Referer"),
        secFetchSite,
      });
      return c.json({ error: "CSRF_ORIGIN_INVALID" }, 403);
    }
    await next();
    return undefined;
  };

  return { issueCsrfToken, requireCsrf };
}
