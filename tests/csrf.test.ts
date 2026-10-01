/**
 * CSRF da interface: double-submit assinado com exigencia de mesma origem.
 * Tudo offline: SQLite em memoria, mocks deterministicos e `app.request` (sem porta).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";

import { StudyCache } from "../src/application/cache.ts";
import { StudyService } from "../src/application/study-service.ts";
import { loadEnv } from "../src/config/env.ts";
import { createLogger } from "../src/config/runtime.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase, type DatabaseHandle } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { buildUiApp } from "../src/infrastructure/http/ui/routes.tsx";
import { CSRF_COOKIE, CSRF_HEADER } from "../src/infrastructure/http/ui/security.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";

const FORM = { "Content-Type": "application/x-www-form-urlencoded" } as const;

interface CsrfHarness {
  app: Hono;
  service: StudyService;
  close: () => void;
}

let harness: CsrfHarness;

beforeEach(() => {
  const db: DatabaseHandle = openMigratedDatabase(":memory:");
  const artifactsRoot = mkdtempSync(join(tmpdir(), "goodbizz-csrf-"));
  const service = new StudyService({
    repo: new SqliteStudyRepository(db.db),
    cache: new StudyCache(new SqliteCacheStore(db.db)),
    llm: new LlmMock(),
    decider: new DeciderMock(),
    logger: createLogger("error"),
    artifactsRoot,
  });
  harness = {
    app: buildUiApp({ service, sessionSecret: loadEnv().SESSION_SECRET, production: false }),
    service,
    close: () => db.sqlite.close(),
  };
});

afterEach(() => {
  harness.close();
});

/** Extrai o par cookie=<assinado> e o token cru do header `Set-Cookie` da primeira pagina. */
function firstToken(setCookie: string): { cookiePair: string; token: string } {
  const cookiePair = setCookie.split(";")[0] ?? "";
  const signed = decodeURIComponent(cookiePair.slice(`${CSRF_COOKIE}=`.length));
  return { cookiePair, token: signed.slice(0, signed.lastIndexOf(".")) };
}

async function pageCookieToken(): Promise<{ cookiePair: string; token: string; setCookie: string }> {
  const response = await harness.app.request("/");
  const setCookie = response.headers.get("set-cookie") ?? "";
  return { ...firstToken(setCookie), setCookie };
}

describe("protecao CSRF da interface", () => {
  test("rejeita POST sem origem e sem token", async () => {
    const response = await harness.app.request("/ui/studies", {
      method: "POST",
      headers: FORM,
      body: "niche=oficinas&mock=1",
    });
    expect(response.status).toBe(403);
  });

  test("rejeita POST com origem estrangeira", async () => {
    const { cookiePair, token } = await pageCookieToken();
    const response = await harness.app.request("/ui/studies", {
      method: "POST",
      headers: { ...FORM, Origin: "https://evil.example", Cookie: cookiePair, [CSRF_HEADER]: token },
      body: "niche=oficinas&mock=1",
    });
    expect(response.status).toBe(403);
  });

  test("aceita POST com cookie, header e mesma origem", async () => {
    const { cookiePair, token, setCookie } = await pageCookieToken();
    expect(setCookie).toContain(`${CSRF_COOKIE}=`);
    expect(setCookie).not.toContain("HttpOnly");
    expect(token.length).toBeGreaterThan(0);

    const response = await harness.app.request("/ui/studies", {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair, [CSRF_HEADER]: token },
      body: "niche=oficinas&mock=1&monthlyTicket=300&numIdeas=2",
    });

    expect(response.status).toBe(303);
    const studies = await harness.service.list();
    expect(studies).toHaveLength(1);
    expect(studies[0]?.niche).toBe("Oficinas");
    expect(response.headers.get("location")).toBe(`/studies/${studies[0]?.id}`);
  });

  test("aceita o token vindo do campo de formulario", async () => {
    const { cookiePair, token } = await pageCookieToken();
    const response = await harness.app.request("/ui/studies", {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body: `niche=padarias&mock=1&_csrf=${token}`,
    });
    expect(response.status).toBe(303);
    expect(await harness.service.list()).toHaveLength(1);
  });

  test("rejeita token que nao casa com o cookie assinado", async () => {
    const { cookiePair, token } = await pageCookieToken();
    const response = await harness.app.request("/ui/studies", {
      method: "POST",
      headers: {
        ...FORM,
        Origin: "http://localhost",
        Cookie: cookiePair,
        [CSRF_HEADER]: "0".repeat(token.length),
      },
      body: "niche=oficinas&mock=1",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "CSRF_TOKEN_INVALID" });
    expect(await harness.service.list()).toHaveLength(0);
  });

  test("mantem o mesmo token entre respostas (nao rotaciona a cada request)", async () => {
    // Regressao: rotacionar o token a cada resposta invalidava qualquer formulario ja aberto
    // (segunda aba, botao voltar) com 403 no envio. O cookie so e emitido quando nao existe.
    const first = await pageCookieToken();
    const second = await harness.app.request("/", { headers: { Cookie: first.cookiePair } });
    const third = await harness.app.request("/about", { headers: { Cookie: first.cookiePair } });

    expect(second.headers.get("set-cookie")).toBeNull();
    expect(third.headers.get("set-cookie")).toBeNull();

    const response = await harness.app.request("/ui/studies", {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: first.cookiePair },
      body: `niche=formulario antigo&mock=1&_csrf=${first.token}`,
    });
    expect(response.status).toBe(303);
    expect((await harness.service.list()).map((study) => study.niche)).toEqual(["Formulario Antigo"]);
  });

  test("nao duplica estado e etapa no cabecalho do detalhe", async () => {
    const { cookiePair, token } = await pageCookieToken();
    const created = await harness.app.request("/ui/studies", {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair, [CSRF_HEADER]: token },
      body: "niche=oficinas&mock=1&numIdeas=1",
    });
    const location = created.headers.get("location") ?? "";
    await harness.service.run(location.replace("/studies/", ""));

    const page = await harness.app.request(location, { headers: { Cookie: cookiePair } });
    const html = await page.text();
    const meta = html.match(/id="study-meta"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? "";
    expect(meta).toContain("concluído");
    // Regressao: o cabecalho repetia estado e etapa ("concluído · concluído").
    expect(meta.match(/concluído/gi)?.length).toBe(1);
  });
});
