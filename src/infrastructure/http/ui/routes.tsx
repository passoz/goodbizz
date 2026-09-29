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
import type { StudyService } from "../../../application/study-service.ts";
import { NotFoundError } from "../../../domain/errors.ts";
import type { StudyRecord } from "../../../domain/types.ts";
import { Layout, Term } from "./layout.tsx";
import { StudiesList, StudyDetail, StudyForm } from "./pages.tsx";
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
  { method: "POST", path: "/api/studies/:id/run", description: "executa o pipeline de um estudo" },
  { method: "GET", path: "/api/studies/:id/artifacts", description: "lista os artefatos" },
  { method: "GET", path: "/api/studies/:id/artifacts/*", description: "conteudo de um artefato" },
  { method: "POST", path: "/api/diagnose", description: "diagnostica as sondas de dor" },
  { method: "POST", path: "/api/recalibrate", description: "recalibra os limiares" },
  { method: "GET", path: "/healthz", description: "liveness" },
  { method: "GET", path: "/readyz", description: "readiness" },
];

/** Primeiro README de ideia gravado no estudo (`01-.../README.md`), lido como plano. */
async function readPlan(service: StudyService, id: string, artifacts: string[]): Promise<string | null> {
  const planPath = artifacts.find((path) => path !== "README.md" && path.endsWith("/README.md"));
  if (planPath === undefined) return null;
  try {
    return await service.readArtifact(id, planPath);
  } catch {
    return null;
  }
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
    return c.render(<StudiesList studies={studies} />, { title: "goodbizz — estudos" });
  });

  ui.get("/new", (c) =>
    c.render(
      <StudyForm
        token={c.get("csrfToken")}
        defaults={{ monthlyTicket: 300, numIdeas: 8 }}
        providers={deps.providers}
      />,
      { title: "goodbizz — novo estudo" },
    ),
  );

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
    const plan = await readPlan(deps.service, id, artifacts);
    return c.render(<StudyDetail study={study} artifacts={artifacts} plan={plan} />, {
      title: `goodbizz — ${study.niche}`,
    });
  });

  ui.post("/ui/studies", requireCsrf, async (c) => {
    const body = await c.req.parseBody();
    const niche = typeof body["niche"] === "string" ? body["niche"].trim() : "";
    if (!niche) {
      return c.json({ error: "VALIDATION_FAILED", message: "o nicho e obrigatorio" }, 422);
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
          Esta interface le e escreve os mesmos estudos da API publica, na mesma origem. O formulario usa o
          endpoint de criacao; o restante fica disponivel para scripts e integracao.
        </p>
        <p class="sub">
          A <Term of="CSRF">CSRF</Term> nao existe na API (ela tem autenticacao propria, se houver). A
          interface sim: toda rota que muda estado exige mesma origem e token assinado.
        </p>
        <div class="table-wrap">
          <table id="endpoints">
            <thead>
              <tr>
                <th>Metodo</th>
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
      { title: "goodbizz — sobre a API" },
    ),
  );

  // `UiEnv` so existe dentro da interface (token CSRF tipado); o root monta o sub-app como
  // um `Hono` comum, entao a variavel de ambiente e apagada na fronteira de composicao.
  return ui as unknown as Hono;
}
