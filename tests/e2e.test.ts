/**
 * E2E com o servico de pe sobre um socket real (nao `app.request`): sobe o app composto
 * (API + UI + health), mantem cookie e token entre requisicoes como um navegador faria e
 * percorre a jornada do operador pelo caminho sem JavaScript dos formularios.
 *
 * Cobre o que o teste in-process nao pega: middleware de CSRF do framework, montagem dos
 * sub-apps, `secureHeaders()` e o cookie assinado atravessando requisicoes.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Server } from "bun";
import { z } from "zod";

import { buildService, type ServiceBundle } from "../src/index.ts";
import { loadEnv } from "../src/config/env.ts";
import { CSRF_COOKIE } from "../src/infrastructure/http/ui/security.ts";

const FORM = { "Content-Type": "application/x-www-form-urlencoded" } as const;

/** Corpo da API de estudos, validado na borda em vez de afirmado por cast. */
const StudyJson = z.object({
  id: z.string(),
  state: z.string(),
  evaluations: z.array(z.object({ id: z.string() })),
});

const ErrorJson = z.object({ error: z.string() });

const StudyListJson = z.object({ studies: z.array(z.object({ id: z.string() })) });

describe("e2e: jornada do operador pelo HTTP real", () => {
  let server: Server<undefined>;
  let bundle: ServiceBundle;
  let base: string;

  beforeAll(async () => {
    bundle = await buildService({
      ...loadEnv(),
      DATABASE_URL: join(mkdtempSync(join(tmpdir(), "goodbizz-e2e-db-")), "app.db"),
      GOODBIZZ_STUDIES_DIR: mkdtempSync(join(tmpdir(), "goodbizz-e2e-estudos-")),
      GOODBIZZ_MOCK: true,
      GOODBIZZ_MOCK_LLM: true,
      GOODBIZZ_MOCK_DECIDER: true,
      LOG_LEVEL: "error",
    });
    server = Bun.serve({ port: 0, fetch: bundle.app.fetch });
    base = `http://127.0.0.1:${server.port}`;
  });

  afterAll(async () => {
    await server.stop(true);
    bundle.handle.sqlite.close();
  });

  /** Cookie e token como o navegador guarda: copia assinada no cookie, valor cru no campo oculto. */
  async function csrf(): Promise<{ cookiePair: string; token: string }> {
    const response = await fetch(`${base}/`);
    const setCookie = response.headers.get("set-cookie") ?? "";
    const cookiePair = setCookie.split(";")[0] ?? "";
    const signed = decodeURIComponent(cookiePair.slice(`${CSRF_COOKIE}=`.length));
    return { cookiePair, token: signed.slice(0, signed.lastIndexOf(".")) };
  }

  function postForm(path: string, headers: Record<string, string>, fields: Record<string, string>) {
    return fetch(`${base}${path}`, {
      method: "POST",
      redirect: "manual",
      headers: { ...FORM, ...headers },
      body: new URLSearchParams(fields).toString(),
    });
  }

  async function readStudy(id: string) {
    return StudyJson.parse(await (await fetch(`${base}/api/studies/${id}`)).json());
  }

  /**
   * A adicao de ideias roda em background e a rota responde antes: o estado persistido e o unico
   * sinal observavel deste job, entao a espera e por polling. Excecao consciente a "sem timers em
   * teste": e um teste de integracao do proprio job, com limite curto e erro alto se falhar.
   */
  async function waitFor(
    id: string,
    predicate: (study: z.infer<typeof StudyJson>) => boolean,
  ): Promise<z.infer<typeof StudyJson>> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const study = await readStudy(id);
      if (study.state === "failed") throw new Error(`o estudo ${id} terminou em falha`);
      if (predicate(study)) return study;
      await Bun.sleep(25);
    }
    throw new Error(`o estudo ${id} nao chegou ao estado esperado`);
  }

  test("cria pelo formulario sem JavaScript e volta para a pagina do estudo", async () => {
    const { cookiePair, token } = await csrf();
    const created = await postForm(
      "/ui/studies",
      { Cookie: cookiePair, Origin: base },
      { niche: "clinicas", numIdeas: "2", mock: "on", _csrf: token },
    );
    expect(created.status).toBe(303);
    const location = created.headers.get("location") ?? "";
    expect(location).toMatch(/^\/studies\//);
    const study = await readStudy(location.slice("/studies/".length));
    expect(study.id).toBe(location.slice("/studies/".length));
    // O estudo existe e esta num estado valido de execucao (o run comeca no proprio POST).
    expect(["pending", "running", "done"]).toContain(study.state);
  });

  test("executa, adiciona ideia pelo formulario, exclui a ideia e exclui o estudo", async () => {
    const { cookiePair, token } = await csrf();

    // Criacao e execucao pela API: `run` so responde depois do pipeline, entao nao ha corrida.
    const created = await fetch(`${base}/api/studies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ niche: "clinicas de bairro", numIdeas: 2, mock: true }),
    });
    expect(created.status).toBe(201);
    const id = StudyJson.parse(await created.json()).id;
    expect((await fetch(`${base}/api/studies/${id}/run`, { method: "POST" })).status).toBe(200);
    const done = await readStudy(id);
    expect(done.state).toBe("done");
    expect(done.evaluations).toHaveLength(2);

    // A pagina do estudo renderiza o ranking com um botao de excluir por id.
    const detail = await fetch(`${base}/studies/${id}`);
    expect(detail.status).toBe(200);
    expect(await detail.text()).toContain("data-idea-delete=");

    // Adicionar pelo formulario SO com `Sec-Fetch-Site`, sem `Origin` nem `Referer`: este e o
    // caminho que o middleware de CSRF do framework recusava e que virava 500 antes do fix.
    const add = await postForm(
      `/ui/studies/${id}/ideas`,
      { Cookie: cookiePair, "Sec-Fetch-Site": "same-origin" },
      { count: "1", _csrf: token },
    );
    expect(add.status).toBe(303);
    const afterAdd = await waitFor(id, (study) => study.evaluations.length === 3);
    expect(afterAdd.evaluations).toHaveLength(3);

    // Excluir a ideia pela API (o dialogo usa a mesma rota) e conferir que ela saiu.
    const target = afterAdd.evaluations[0]!.id;
    const removed = await fetch(`${base}/api/studies/${id}/ideas/${target}`, { method: "DELETE" });
    expect(removed.status).toBe(204);
    const afterRemove = await waitFor(id, (study) => study.evaluations.length === 2);
    expect(afterRemove.evaluations.map((idea) => idea.id)).not.toContain(target);

    // Excluir o estudo pelo formulario sem JavaScript.
    const deleted = await postForm(
      `/ui/studies/${id}/delete`,
      { Cookie: cookiePair, Origin: base },
      { _csrf: token },
    );
    expect(deleted.status).toBe(303);
    expect((await fetch(`${base}/api/studies/${id}`)).status).toBe(404);
  });

  test("formulario sem sinal de mesma origem passa com o token, e nunca 500", async () => {
    // Reproduz o cliente do operador: nenhum `Origin`, `Referer` ou `Sec-Fetch-Site`. O token do
    // double-submit e a defesa, e a resposta e o redirect do formulario — nunca 403 nem 500.
    const { cookiePair, token } = await csrf();
    const response = await postForm(
      "/ui/studies",
      { Cookie: cookiePair },
      { niche: "clinicas", numIdeas: "1", mock: "on", _csrf: token },
    );
    expect(response.status).toBe(303);
  });

  test("formulario sem sinal de mesma origem e sem token responde 403 de token", async () => {
    const { cookiePair } = await csrf();
    const response = await postForm(
      "/ui/studies",
      { Cookie: cookiePair },
      { niche: "clinicas", numIdeas: "1", mock: "on" },
    );
    expect(response.status).toBe(403);
    expect(ErrorJson.parse(await response.json()).error).toBe("CSRF_TOKEN_INVALID");
  });

  test("formulario sem token responde 403 e nao cria estudo", async () => {
    const { cookiePair } = await csrf();
    const list = async () =>
      StudyListJson.parse(await (await fetch(`${base}/api/studies`)).json()).studies.length;
    const before = await list();
    const response = await postForm(
      "/ui/studies",
      { Cookie: cookiePair, Origin: base },
      { niche: "clinicas" },
    );
    expect(response.status).toBe(403);
    expect(await list()).toBe(before);
  });
});
