/**
 * Sub-app da interface web. Renderiza lista, formulario e detalhe a partir do StudyService e
 * posta na API publica da mesma origem (o proprio navegador usa `/api/studies`).
 *
 * A UI nao importa a API: le tudo pelo `StudyService`; o formulario sem JS cai em
 * `POST /ui/studies`, que tambem passa pelo StudyService.
 */
import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { jsxRenderer } from "hono/jsx-renderer";

import { resolveStudyConfig } from "../../../config/runtime.ts";
import { loadEnv } from "../../../config/env.ts";
import { PROVIDER_FIELDS, providerSettingsView } from "../../../config/providers.ts";
import { folderName } from "../../../application/reports.ts";
import { mdToHtml } from "../../../application/render.ts";
import type { StudyService } from "../../../application/study-service.ts";
import { NotFoundError, ValidationError } from "../../../domain/errors.ts";
import type { ProviderSettingsPatch, StudyRecord } from "../../../domain/types.ts";
import { Layout, Term } from "./layout.tsx";
import { HelpPage, SettingsPage, StudiesList, StudyDetail, StudyForm } from "./pages.tsx";
import { createCsrf, type UiEnv } from "./security.ts";

export interface UiDeps {
  service: StudyService;
  sessionSecret: string;
  production: boolean;
  /** Como este servico esta configurado, em texto curto e sem segredo. */
  providers?: { llm: string; decider: string };
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
  { method: "GET", path: "/api/settings", description: "configuração dos provedores (origem e máscara)" },
  { method: "PATCH", path: "/api/settings", description: "sobrepõe ou limpa campos dos provedores" },
  { method: "GET", path: "/healthz", description: "liveness" },
  { method: "GET", path: "/readyz", description: "readiness" },
];

/**
 * Monta o remendo a partir do formulario sem JS: campo preenchido define, "limpar" manda `null`
 * (volta a herdar o ambiente) e campo vazio fica de fora. Qualquer campo fora do contrato invalida o
 * formulario inteiro, para o corpo nao introduzir chaves que o servico nao conhece.
 */
function settingsPatch(body: Record<string, unknown>): ProviderSettingsPatch | null {
  const allowed: Record<string, true> = { _csrf: true };
  for (const field of PROVIDER_FIELDS) {
    allowed[field.key] = true;
    allowed[`clear_${field.key}`] = true;
  }
  for (const key of Object.keys(body)) {
    if (allowed[key] !== true) return null;
  }
  const patch: ProviderSettingsPatch = {};
  for (const field of PROVIDER_FIELDS) {
    if (body[`clear_${field.key}`] !== undefined) {
      patch[field.settingKey] = null;
      continue;
    }
    const raw = body[field.key];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value.length > 0) patch[field.settingKey] = value;
  }
  return patch;
}

export function buildUiApp(deps: UiDeps): Hono {
  const ui = new Hono<UiEnv>();
  const { issueCsrfToken, requireCsrf } = createCsrf({
    sessionSecret: deps.sessionSecret,
    production: deps.production,
  });

  ui.use(csrf());
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
        providers={deps.providers}
      />,
      { title: "GoodBizz — novo estudo" },
    ),
  );

  ui.get("/como-ler", (c) => c.render(<HelpPage />, { title: "GoodBizz — como ler" }));

  /** Configuracao dos provedores: mostra o valor efetivo, a origem de cada campo e o formulario. */
  ui.get("/settings", async (c) => {
    const settings = await deps.service.providerSettings();
    return c.render(
      <SettingsPage rows={providerSettingsView(loadEnv(), settings)} token={c.get("csrfToken")} />,
      {
        title: "GoodBizz — configurações",
      },
    );
  });

  /**
   * Salvar sem JS: monta o remendo a partir do formulario (mesma origem + CSRF) e volta para a
   * pagina. Com JS o `PATCH /api/settings` assume; a rota existe para o caminho sem script.
   */
  ui.post("/ui/settings", requireCsrf, async (c) => {
    const patch = settingsPatch(await c.req.parseBody());
    if (patch === null) {
      return c.json({ error: "VALIDATION_FAILED", message: "campo desconhecido no formulário" }, 422);
    }
    await deps.service.updateProviderSettings(patch);
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
    const city = typeof body["city"] === "string" ? body["city"].trim() : "";
    const ticket = Number(body["monthlyTicket"]);
    const ideas = Number(body["numIdeas"]);
    const cfg = resolveStudyConfig({
      niche,
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
