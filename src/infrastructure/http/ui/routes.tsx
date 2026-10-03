/**
 * Sub-app da interface web. Renderiza lista, formulario e detalhe a partir do StudyService e
 * posta na API publica da mesma origem (o proprio navegador usa `/api/studies`).
 *
 * A UI nao importa a API: le tudo pelo `StudyService`; o formulario sem JS cai em
 * `POST /ui/studies`, que tambem passa pelo StudyService.
 */
import { Hono } from "hono";
import { jsxRenderer } from "hono/jsx-renderer";

import { resolveStudyConfig } from "../../../config/runtime.ts";
import { loadEnv } from "../../../config/env.ts";
import { envProviderDefaults, profileViews } from "../../../config/providers.ts";
import { folderName } from "../../../application/reports.ts";
import { mdToHtml } from "../../../application/render.ts";
import { MAX_IDEAS_PER_STUDY, type StudyService } from "../../../application/study-service.ts";
import { ConflictError, NotFoundError, ValidationError } from "../../../domain/errors.ts";
import type { StudyRecord } from "../../../domain/types.ts";
import { Layout, Term } from "./layout.tsx";
import { HelpPage, SettingsPage, StudiesList, StudyDetail, StudyForm } from "./pages.tsx";
import { createCsrf, type UiEnv } from "./security.ts";

export interface UiDeps {
  service: StudyService;
  sessionSecret: string;
  production: boolean;
  /** Como este servico esta configurado, em texto curto e sem segredo; refeito a cada pagina. */
  providers?: () => { llm: string; decider: string };
  /** Diagnostico das recusas de CSRF (sinais do cliente e presenca do token). */
  logger?: { warn(message: string, meta?: Record<string, unknown>): void };
}

const ABOUT_ROWS: Array<{ method: string; path: string; description: string }> = [
  { method: "GET", path: "/api/config", description: "provedores configurados (booleanos)" },
  { method: "POST", path: "/api/studies", description: "cria um estudo a partir de JSON" },
  { method: "GET", path: "/api/studies", description: "lista os estudos" },
  { method: "GET", path: "/api/studies/:id", description: "detalhe de um estudo" },
  { method: "PATCH", path: "/api/studies/:id", description: "renomeia um estudo" },
  { method: "POST", path: "/api/studies/:id/run", description: "executa o pipeline de um estudo" },
  { method: "DELETE", path: "/api/studies/:id", description: "exclui um estudo" },
  { method: "GET", path: "/api/studies/:id/artifacts", description: "lista os artefatos" },
  { method: "GET", path: "/api/studies/:id/artifacts/*", description: "conteúdo de um artefato" },
  { method: "POST", path: "/api/diagnose", description: "diagnostica as sondas de dor" },
  { method: "POST", path: "/api/recalibrate", description: "recalibra os limiares" },
  { method: "GET", path: "/api/settings", description: "catálogo de provedores nomeados e o ativo por tipo" },
  { method: "POST", path: "/api/settings/providers", description: "cria um provedor nomeado" },
  { method: "PATCH", path: "/api/settings/providers/:id", description: "edita um provedor" },
  { method: "DELETE", path: "/api/settings/providers/:id", description: "exclui um provedor" },
  { method: "PUT", path: "/api/settings/active", description: "escolhe o provedor ativo de um tipo" },
  { method: "POST", path: "/api/settings/test", description: "testa a configuração contra o provedor" },
  { method: "GET", path: "/healthz", description: "liveness" },
  { method: "GET", path: "/readyz", description: "readiness" },
];

export function buildUiApp(deps: UiDeps): Hono {
  const ui = new Hono<UiEnv>();
  const { issueCsrfToken, requireCsrf } = createCsrf({
    sessionSecret: deps.sessionSecret,
    production: deps.production,
    logger: deps.logger,
  });

  // Sem `csrf()` do Hono: toda rota que muda estado passa por `requireCsrf`, que exige o token do
  // cookie (double-submit) e veta qualquer sinal de origem divergente. O middleware embutido olhava
  // so `Sec-Fetch-Site`/`Origin` de formularios, entao recusava POST de mesma origem de clientes que
  // omitem os dois — e, como `secureHeaders()` manda `Referrer-Policy: no-referrer`, o `Referer`
  // tambem nao chegava.
  ui.use(issueCsrfToken);
  ui.use(jsxRenderer(({ children, title }) => <Layout title={title}>{children}</Layout>));

  ui.get("/", async (c) => {
    const studies = await deps.service.list();
    return c.render(<StudiesList studies={studies} token={c.get("csrfToken")} />, {
      title: "GoodBizz — estudos",
    });
  });

  ui.get("/new", (c) =>
    c.render(
      <StudyForm
        token={c.get("csrfToken")}
        defaults={{ monthlyTicket: 300, numIdeas: 8 }}
        providers={deps.providers?.()}
      />,
      { title: "GoodBizz — novo estudo" },
    ),
  );

  ui.get("/como-ler", (c) => c.render(<HelpPage />, { title: "GoodBizz — como ler" }));

  /** Configuração dos provedores: catálogo nomeado, escolha do ativo por tipo e o modal de edição. */
  ui.get("/settings", async (c) => {
    const settings = await deps.service.providerSettings();
    return c.render(
      <SettingsPage
        view={{
          profiles: profileViews(settings),
          active: { llm: settings.activeLlm ?? null, decider: settings.activeDecider ?? null },
          defaults: envProviderDefaults(loadEnv()),
        }}
        token={c.get("csrfToken")}
      />,
      { title: "GoodBizz — configurações" },
    );
  });

  /**
   * Escolher o provedor ativo sem JavaScript: o `select` posta aqui (mesma origem + CSRF) e a
   * pagina volta. Com JS o proprio `select` dispara este submit. Criar/editar/excluir/testar
   * exigem script, como o modal do plano.
   */
  ui.post("/ui/settings/active", requireCsrf, async (c) => {
    const body = await c.req.parseBody();
    const kind = body["kind"] === "decider" ? "decider" : body["kind"] === "llm" ? "llm" : null;
    if (kind === null) {
      return c.json({ error: "VALIDATION_FAILED", message: "tipo de provedor inválido" }, 422);
    }
    const raw = typeof body["id"] === "string" ? body["id"].trim() : "";
    await deps.service.setActiveProvider(kind, raw.length === 0 ? null : raw);
    return c.redirect("/settings", 303);
  });

  /**
   * Plano de uma ideia em HTML (fragmento), para o modal da pagina do estudo.
   * Renderizado no servidor com o mesmo `mdToHtml` do HTML/PDF exportado: o navegador nao carrega
   * renderizador de markdown e o texto escapado pelo renderizador e o mesmo em todo lugar.
   */
  ui.get("/studies/:id/ideas/:position", async (c) => {
    const id = c.req.param("id");
    const position = Number(c.req.param("position"));
    if (!Number.isInteger(position) || position < 1) {
      return c.html('<p class="alert">posição inválida</p>', 400);
    }
    let study: StudyRecord;
    try {
      study = await deps.service.get(id);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return c.html('<p class="alert">estudo não encontrado</p>', 404);
      }
      throw error;
    }
    const ranked = study.summary
      ? study.summary.ordered
      : [...study.evaluations].sort((left, right) => right.index - left.index);
    const idea = ranked[position - 1];
    if (idea === undefined) {
      return c.html('<p class="alert">ideia não encontrada neste estudo</p>', 404);
    }
    let markdown: string;
    try {
      markdown = await deps.service.readArtifact(id, `${folderName(position, idea.name)}/README.md`);
    } catch {
      return c.html('<p class="alert">o plano desta ideia ainda não foi gravado</p>', 404);
    }
    return c.html(`<article class="plan-body">${mdToHtml(markdown)}</article>`);
  });

  ui.get("/studies/:id", async (c) => {
    const id = c.req.param("id");
    let study: StudyRecord;
    try {
      study = await deps.service.get(id);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return c.json({ error: error.code, message: error.message }, 404);
      }
      throw error;
    }
    const artifacts = await deps.service.artifactPaths(id);
    return c.render(<StudyDetail study={study} artifacts={artifacts} token={c.get("csrfToken")} />, {
      title: `GoodBizz — ${study.niche}`,
    });
  });

  ui.post("/ui/studies/:id/delete", requireCsrf, async (c) => {
    const id = c.req.param("id");
    try {
      await deps.service.delete(id);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return c.json({ error: error.code, message: error.message }, 404);
      }
      throw error;
    }
    return c.redirect("/", 303);
  });

  /**
   * Renomear sem JS: o form do cabecalho posta aqui (mesma origem + CSRF) e a pagina volta para o
   * estudo. Com JS o `PATCH /api/studies/:id` assume, mas a rota existe para o caminho sem script.
   */
  ui.post("/ui/studies/:id/rename", requireCsrf, async (c) => {
    const id = c.req.param("id");
    const body = await c.req.parseBody();
    const niche = typeof body["niche"] === "string" ? body["niche"].trim() : "";
    try {
      await deps.service.rename(id, niche);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return c.json({ error: error.code, message: error.message }, 404);
      }
      if (error instanceof ValidationError) {
        return c.json({ error: error.code, message: error.message }, 422);
      }
      throw error;
    }
    return c.redirect(`/studies/${id}`, 303);
  });

  /** Excluir uma ideia sem JS: remove pelo id e volta para a pagina do estudo. */
  ui.post("/ui/studies/:id/ideas/:ideaId/delete", requireCsrf, async (c) => {
    const id = c.req.param("id");
    try {
      await deps.service.removeIdea(id, c.req.param("ideaId"));
    } catch (error) {
      if (error instanceof NotFoundError) {
        return c.json({ error: error.code, message: error.message }, 404);
      }
      // `removeIdea` so conhece `NotFoundError` e `ConflictError`; um `ValidationError` aqui
      // seria branch morto escondendo um erro de verdade.
      if (error instanceof ConflictError) {
        return c.json({ error: error.code, message: error.message }, 409);
      }
      throw error;
    }
    return c.redirect(`/studies/${id}`, 303);
  });

  /**
   * Acrescentar ideias sem JS: valida o `count` aqui e deixa a geracao em background.
   *
   * A validacao fica na rota, e nao no `addIdeas`, porque o redirect tem de sair agora: o servico
   * so descobre o erro de teto depois de devolver a promessa, e aqui isso viraria resposta 303
   * seguida de nada. O servico segue sendo a autoridade e recheca.
   */
  ui.post("/ui/studies/:id/ideas", requireCsrf, async (c) => {
    const id = c.req.param("id");
    const body = await c.req.parseBody();
    const count = Number(body["count"]);
    const record = await deps.service.get(id);
    if (!Number.isInteger(count) || count < 1) {
      return c.json(
        { error: "VALIDATION_FAILED", message: "count precisa ser um numero inteiro de 1 ou mais" },
        422,
      );
    }
    if (record.evaluations.length + count > MAX_IDEAS_PER_STUDY) {
      return c.json(
        {
          error: "VALIDATION_FAILED",
          message: `o estudo tem ${record.evaluations.length} de ${MAX_IDEAS_PER_STUDY} ideias; ${count} novas passaria de ${MAX_IDEAS_PER_STUDY}`,
        },
        422,
      );
    }
    // Sem `await`: o redirect responde na hora e a adicao continua sozinha.
    void deps.service.addIdeas(id, count).catch(() => {});
    return c.redirect(`/studies/${id}`, 303);
  });

  /** Executar de novo sem JS: reinicia o pipeline (sem aguardar) e volta para a pagina do estudo. */
  ui.post("/ui/studies/:id/run", requireCsrf, async (c) => {
    const id = c.req.param("id");
    try {
      await deps.service.get(id);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return c.json({ error: error.code, message: error.message }, 404);
      }
      throw error;
    }
    deps.service.start(id);
    return c.redirect(`/studies/${id}`, 303);
  });

  ui.post("/ui/studies", requireCsrf, async (c) => {
    const body = await c.req.parseBody();
    const niche = typeof body["niche"] === "string" ? body["niche"].trim() : "";
    if (!niche) {
      return c.json({ error: "VALIDATION_FAILED", message: "o nicho é obrigatório" }, 422);
    }
    const description = typeof body["description"] === "string" ? body["description"].trim() : "";
    const city = typeof body["city"] === "string" ? body["city"].trim() : "";
    const ticket = Number(body["monthlyTicket"]);
    const ideas = Number(body["numIdeas"]);
    const cfg = resolveStudyConfig({
      niche,
      description,
      city,
      mock: body["mock"] !== undefined,
      monthlyTicket: Number.isFinite(ticket) && ticket > 0 ? Math.floor(ticket) : undefined,
      numIdeas: Number.isFinite(ideas) && ideas > 0 ? Math.floor(ideas) : undefined,
    });
    const record = await deps.service.create(cfg);
    deps.service.start(record.id);
    return c.redirect(`/studies/${record.id}`, 303);
  });

  ui.get("/about", (c) =>
    c.render(
      <section class="panel glass">
        <h2>Sobre a API</h2>
        <p class="lead">
          Esta interface lê e escreve os mesmos estudos da API pública, na mesma origem. O formulário usa o
          endpoint de criação; o restante fica disponível para scripts e integração.
        </p>
        <p class="sub">
          A <Term of="CSRF">CSRF</Term> não existe na API (ela tem autenticação própria, se houver). A
          interface sim: toda rota que muda estado exige mesma origem e token assinado.
        </p>
        <div class="table-wrap">
          <table id="endpoints">
            <thead>
              <tr>
                <th>Método</th>
                <th>Caminho</th>
                <th>O que faz</th>
              </tr>
            </thead>
            <tbody>
              {ABOUT_ROWS.map((row) => (
                <tr>
                  <td>
                    <span class="badge">{row.method}</span>
                  </td>
                  <td>
                    <code>{row.path}</code>
                  </td>
                  <td>{row.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>,
      { title: "GoodBizz — sobre a API" },
    ),
  );

  // `UiEnv` so existe dentro da interface (token CSRF tipado); o root monta o sub-app como
  // um `Hono` comum, entao a variavel de ambiente e apagada na fronteira de composicao.
  return ui as unknown as Hono;
}
