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
  const { sessionSecret, production = false } = options;

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

    // Mesma origem por um sinal que o navegador controla: `Origin` exato quando presente, depois
    // `Referer` sob `${origin}/` e, por fim, `Sec-Fetch-Site: same-origin`. O ultimo cobre os
    // navegadores que omitem `Origin` no POST de mesma origem e o `Referrer-Policy: no-referrer`
    // que o `secureHeaders()` manda — sem ele, um formulario legitimo batia em 403.
    const own = new URL(c.req.url).origin;
    const origin = c.req.header("Origin");
    const referer = c.req.header("Referer");
    const sameOrigin =
      origin !== undefined
        ? origin === own
        : referer !== undefined
          ? referer.startsWith(`${own}/`)
          : c.req.header("Sec-Fetch-Site") === "same-origin";
    if (!sameOrigin) {
      return c.json({ error: "CSRF_ORIGIN_INVALID" }, 403);
    }

    // Comparacao em tempo constante: tamanho antes, como o runtime exige.
    const expected = await getSignedCookie(c, sessionSecret, CSRF_COOKIE);
    const provided = c.req.header(CSRF_HEADER) ?? (await formToken(c));
    const expectedBytes = typeof expected === "string" ? new TextEncoder().encode(expected) : null;
    const providedBytes = provided === null ? null : new TextEncoder().encode(provided);
    if (
      expectedBytes === null ||
      providedBytes === null ||
      expectedBytes.length !== providedBytes.length ||
      !crypto.timingSafeEqual(expectedBytes, providedBytes)
    ) {
      return c.json({ error: "CSRF_TOKEN_INVALID" }, 403);
    }
    await next();
    return undefined;
  };

  return { issueCsrfToken, requireCsrf };
}
