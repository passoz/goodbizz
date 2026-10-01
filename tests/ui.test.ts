/**
 * Interface web: lista, formulario, detalhe e a pagina sobre a API.
 * Tudo offline: SQLite em memoria, mocks deterministicos e `app.request` (sem porta).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";

import { StudyCache } from "../src/application/cache.ts";
import { ProviderSettingsStore } from "../src/application/settings.ts";
import { StudyService } from "../src/application/study-service.ts";
import { loadEnv, resetEnv } from "../src/config/env.ts";
import { createLogger, resolveStudyConfig } from "../src/config/runtime.ts";
import type { StudyIdea, StudyState, StudySummary } from "../src/domain/types.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase, type DatabaseHandle } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { buildUiApp } from "../src/infrastructure/http/ui/routes.tsx";
import { CSRF_COOKIE } from "../src/infrastructure/http/ui/security.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { SqliteSettingsRepository } from "../src/infrastructure/settings-repository.ts";

interface UiHarness {
  app: Hono;
  service: StudyService;
  repo: SqliteStudyRepository;
  settings: ProviderSettingsStore;
  artifactsRoot: string;
  close: () => void;
}

function makeUiHarness(): UiHarness {
  const db: DatabaseHandle = openMigratedDatabase(":memory:");
  const repo = new SqliteStudyRepository(db.db);
  const artifactsRoot = mkdtempSync(join(tmpdir(), "goodbizz-ui-"));
  const settings = new ProviderSettingsStore(new SqliteSettingsRepository(db.db));
  const service = new StudyService({
    repo,
    cache: new StudyCache(new SqliteCacheStore(db.db)),
    llm: new LlmMock(),
    decider: new DeciderMock(),
    logger: createLogger("error"),
    artifactsRoot,
    settings,
  });
  const app = buildUiApp({ service, sessionSecret: loadEnv().SESSION_SECRET, production: false });
  return { app, service, repo, settings, artifactsRoot, close: () => db.sqlite.close() };
}

let harness: UiHarness;

const FORM = { "Content-Type": "application/x-www-form-urlencoded" } as const;

/** Extrai o par cookie=<assinado> e o token cru do header `Set-Cookie` da pagina inicial. */
async function csrfToken(): Promise<{ cookiePair: string; token: string }> {
  const response = await harness.app.request("/");
  const cookiePair = (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
  const signed = decodeURIComponent(cookiePair.slice(`${CSRF_COOKIE}=`.length));
  return { cookiePair, token: signed.slice(0, signed.lastIndexOf(".")) };
}

/** Ideia de exemplo com todos os indicadores preenchidos. */
function makeEvaluation(): StudyIdea {
  return {
    id: "id-triagem",
    name: "Triagem de WhatsApp",
    sector: "atendimento",
    description: "separa duvida simples de intencao real",
    indicators: {
      fit: 0.8,
      fitConf: 0.7,
      sale: 0.6,
      saleConf: 0.7,
      disruption: 0.5,
      disruptionConf: 0.6,
      pain: "FORTE",
      painProbs: { forte: 0.8 },
      painConf: 0.8,
      solo: 0.4,
    },
    business: { wtp: 0.7, meta30: 0.5, price: 300, priceConf: 0.6 },
    algorithm: {
      label: "FORTE",
      painScore: 0.9,
      internalScore: 0.2,
      margin: 0.7,
      deviation: 0.1,
      probes: { dinheiro: 0.9 },
      byParaphrase: {},
    },
    index: 0.72,
    tier: "A",
  };
}

function makeSummary(evaluation: StudyIdea): StudySummary {
  return {
    ordered: [evaluation],
    painGroups: { forte: [evaluation.name], mista: [], fraca: [] },
    means: { fit: 0.8, sale: 0.6, disruption: 0.5, solo: 0.4, wtp: 0.7, meta30: 0.5 },
    tiers: { A: [evaluation.name], B: [], C: [] },
    attack: [],
    review: [],
  };
}

beforeEach(() => {
  harness = makeUiHarness();
});

afterEach(() => {
  harness.close();
});

/**
 * Ambiente deterministico para a pagina de configuracoes: duas origens (`env`) e duas ausencias
 * (`vazio`), deixando os outros campos livres para a sobreposicao salva em cada teste.
 */
const PROVIDER_ENV: Record<string, string> = {
  LLM_API_URL: "https://api.llm.test/v1",
  LLM_API_KEY: "sk-env-chave-secreta-1234",
  LLM_API_MODEL: "modelo-do-ambiente",
  DECISION_API_URL: "",
  DECISION_API_KEY: "",
  DECISION_API_MODEL: "systemone-do-ambiente",
};

const savedEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const [key, value] of Object.entries(PROVIDER_ENV)) {
    savedEnv[key] = Bun.env[key];
    Bun.env[key] = value;
  }
  resetEnv();
});

afterAll(() => {
  for (const key of Object.keys(PROVIDER_ENV)) {
    if (savedEnv[key] === undefined) delete Bun.env[key];
    else Bun.env[key] = savedEnv[key];
  }
  resetEnv();
});

/** Fatia o HTML de uma linha da tabela de configuracao (`data-setting="<key>"` ate a proxima). */
function settingRow(body: string, key: string): string {
  const marker = `data-setting="${key}"`;
  const start = body.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = body.indexOf(`class="field" data-setting="`, start + marker.length);
  return next === -1 ? body.slice(start) : body.slice(start, next);
}

describe("paginas da interface", () => {
  test("a pagina inicial mostra o estado vazio com uma acao clara", async () => {
    const response = await harness.app.request("/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const body = await response.text();
    expect(body).toContain("Nenhum estudo ainda");
    expect(body).toContain('href="/new"');
    expect(body).not.toContain('id="study-form"');
  });

  test("o formulario de novo estudo vive em pagina propria", async () => {
    const response = await harness.app.request("/new");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('id="study-form"');
    expect(body).toContain('name="_csrf"');
    expect(body).toContain('name="niche"');
    // O título tem limite anunciado e a descrição de contexto entra no mesmo formulário.
    expect(body).toContain('maxlength="50"');
    expect(body).toContain('name="description"');
    expect(body).toContain('maxlength="300"');
    expect(body).toContain('form.elements["description"].value');
    expect(body).toContain('name="mock"');
    expect(body).toContain("Voltar para os estudos");
  });

  test("o formulario declara quais provedores estao ativos neste servico", async () => {
    const app = buildUiApp({
      service: harness.service,
      sessionSecret: loadEnv().SESSION_SECRET,
      production: false,
      providers: { llm: "texto real (deepseek-flash)", decider: "numeros simulados" },
    });
    const body = await (await app.request("/new")).text();
    expect(body).toContain('id="providers"');
    expect(body).toContain("texto real (deepseek-flash)");
    expect(body).toContain("numeros simulados");
    // Nenhuma chave ou URL pode aparecer na pagina.
    expect(body).not.toContain("sk-");
    expect(body).not.toContain("vps.");
  });

  test("a lista abre o estudo pelo cartao inteiro, nao por um id minusculo", async () => {
    const study = await harness.service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));

    const body = await (await harness.app.request("/")).text();

    expect(body).toContain(study.id.slice(0, 8));
    expect(body).toContain(`href="/studies/${study.id}"`);
    // O título é a forma normalizada: capitalizado por palavra.
    expect(body).toContain("Oficinas");
    expect(body).not.toContain("Nenhum estudo ainda");
    // O titulo carrega o link esticado e a acao fica visivel no cartao.
    expect(body).toContain('class="stretch"');
    expect(body).toContain("Abrir estudo");
  });

  test("estudo desconhecido responde 404 com corpo JSON", async () => {
    const response = await harness.app.request("/studies/nao-existe");
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      error: "NOT_FOUND",
      message: "study nao-existe not found",
    });
  });

  test("a pagina de detalhe mostra ranking, medias, grupos, artefatos e o progresso ao vivo", async () => {
    const study = await harness.service.create(
      resolveStudyConfig({ niche: "padarias", city: "recife", mock: true }),
    );
    const evaluation = makeEvaluation();
    const summary = makeSummary(evaluation);
    await harness.repo.saveEvaluations(study.id, [evaluation], summary);
    const planDir = join(harness.artifactsRoot, study.id, "01-triagem-de-whatsapp");
    mkdirSync(planDir, { recursive: true });
    writeFileSync(join(planDir, "README.md"), "# Plano\nconteudo do plano");

    const response = await harness.app.request(`/studies/${study.id}`);
    expect(response.status).toBe(200);
    const body = await response.text();

    expect(body).toContain("Padarias");
    expect(body).toContain("recife");
    expect(body).toContain("Triagem de WhatsApp");
    expect(body).toContain("0.720");
    expect(body).toContain("FORTE");
    expect(body).toContain("pagaria o ticket");
    const meansStart = body.indexOf('id="means"');
    const means = body.slice(meansStart, body.indexOf("</ul>", meansStart));
    expect(means).toContain("0.70");
    for (const label of [
      "fit",
      "venda",
      "disrupção",
      "suporte solo",
      "pagaria o ticket",
      "30 clientes em 24 meses",
    ]) {
      expect(means).toContain(label);
    }
    // Todo dado apresentado carrega o seu helper de leitura.
    expect(means.match(/class="hint"/g)?.length).toBe(6);
    expect(means).toContain("maior é melhor");
    expect(body).toContain("forte: Triagem de WhatsApp");
    // Os markdown ficam disponiveis para download direto na lista de artefatos.
    expect(body).toContain(
      `href="/api/studies/${study.id}/artifacts/01-triagem-de-whatsapp/README.md" download`,
    );
    // O plano nao e mais renderizado dentro da pagina: o arquivo basta.
    expect(body).not.toContain('id="plan"');
    expect(body).not.toContain("conteudo do plano");
    // O zip e uma acao do cabecalho: aparece antes da lista de arquivos.
    expect(body).toContain(`href="/api/studies/${study.id}/artifacts.zip"`);
    expect(body).toContain("Baixar .zip");
    expect(body.indexOf("artifacts.zip")).toBeLessThan(body.indexOf('id="artefatos"'));
    // Estudo em fila/execucao mostra o painel de progresso com regiao viva.
    expect(body).toContain('id="progress-panel"');
    expect(body).toContain('aria-live="polite"');
    expect(body).toContain('id="progress-steps"');
    expect(body).toContain('id="progress-elapsed"');
    // A legenda saiu do detalhe para a pagina /como-ler.
    expect(body).not.toContain("Indicadores, limiares e escala");
    // Tema claro/escuro: os tres estados e o guarda aplicado antes do primeiro paint.
    expect(body).toContain('data-theme-set="auto"');
    expect(body).toContain('data-theme-set="light"');
    expect(body).toContain('data-theme-set="dark"');
    expect(body).toContain("goodbizz-theme");
    // Cada ideia do ranking abre o plano num modal (o href continua sendo o artefato cru).
    expect(body).toContain('id="idea-modal"');
    expect(body).toContain(`data-idea-open="/studies/${study.id}/ideas/1"`);
    expect(body).toContain(`href="/api/studies/${study.id}/artifacts/01-triagem-de-whatsapp/README.md"`);
  });

  test("a rota da ideia devolve o plano em HTML interpretado e escapado", async () => {
    const study = await harness.service.create(
      resolveStudyConfig({ niche: "padarias", city: "recife", mock: true }),
    );
    const evaluation = makeEvaluation();
    await harness.repo.saveEvaluations(study.id, [evaluation], makeSummary(evaluation));

    const planDir = join(harness.artifactsRoot, study.id, "01-triagem-de-whatsapp");
    mkdirSync(planDir, { recursive: true });
    writeFileSync(
      join(planDir, "README.md"),
      [
        "# Plano da ideia",
        "",
        "**negrito** e `codigo`.",
        "",
        "| metrica | valor |",
        "| --- | --- |",
        "| fit | 0.87 |",
        "",
        "> aviso de escopo",
        "",
        "- primeiro item",
        "",
        "<script>alert(1)</script>",
      ].join("\n"),
    );

    const response = await harness.app.request(`/studies/${study.id}/ideas/1`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const body = await response.text();

    // Markdown interpretado, nao texto cru.
    expect(body).toContain("<h1>Plano da ideia</h1>");
    expect(body).toContain("<strong>negrito</strong>");
    expect(body).toContain("<code>codigo</code>");
    expect(body).toContain("<table>");
    expect(body).toContain("<th>metrica</th>");
    expect(body).toContain("<blockquote>");
    expect(body).toContain("<li>primeiro item</li>");
    expect(body).not.toContain("# Plano da ideia");
    expect(body).not.toContain("| metrica | valor |");
    // O texto do modelo e dado, nunca markup: o HTML e escapado pelo renderizador.
    expect(body).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(body).not.toContain("<script>alert(1)");

    expect((await harness.app.request(`/studies/${study.id}/ideas/9`)).status).toBe(404);
    expect((await harness.app.request("/studies/nao-existe/ideas/1")).status).toBe(404);
    expect((await harness.app.request("/studies/nao-existe/ideas/0")).status).toBe(400);
  });

  test("a pagina como ler reune a legenda e a escala", async () => {
    const response = await harness.app.request("/como-ler");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Como ler estes números");
    expect(body).toContain("Indicadores, limiares e escala");
    expect(body).toContain("Tier A a partir de 1.84");
    expect(body).toContain('class="scale"');
  });

  test("a pagina sobre a API descreve os endpoints publicos", async () => {
    const response = await harness.app.request("/about");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Sobre a API");
    expect(body).toContain("/api/studies");
    expect(body).toContain("/healthz");
  });

  test("a lista e o detalhe oferecem a exclusao com token CSRF", async () => {
    const study = await harness.service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));

    const list = await (await harness.app.request("/")).text();
    expect(list).toContain(`action="/ui/studies/${study.id}/delete"`);
    expect(list).toContain('name="_csrf"');
    expect(list).toContain('id="delete-modal"');

    const detail = await (await harness.app.request(`/studies/${study.id}`)).text();
    expect(detail).toContain(`action="/ui/studies/${study.id}/delete"`);
    expect(detail).toContain('name="_csrf"');
    expect(detail).toContain('id="delete-modal"');
  });

  test("o dialogo de exclusao separa a pergunta do aviso de falha", async () => {
    const study = await harness.service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));

    for (const body of [
      await (await harness.app.request("/")).text(),
      await (await harness.app.request(`/studies/${study.id}`)).text(),
    ]) {
      // A falha nao pode sobrescrever a pergunta: o aviso vive num paragrafo proprio, vazio no
      // HTML servido, com o mesmo papel de alerta usado nos outros erros da pagina.
      expect(body).toMatch(/<p id="delete-error"[^>]*role="alert"[^>]*><\/p>/);
      expect(body).toContain('id="delete-modal-text"');
    }
  });

  test("a exclusao recusa POST sem token CSRF", async () => {
    const study = await harness.service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    const response = await harness.app.request(`/ui/studies/${study.id}/delete`, {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost" },
      body: "",
    });
    expect(response.status).toBe(403);
    expect(await harness.service.list()).toHaveLength(1);
  });

  test("a exclusao com token apaga o estudo e redireciona para a lista", async () => {
    const study = await harness.service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    const { cookiePair, token } = await csrfToken();
    const response = await harness.app.request(`/ui/studies/${study.id}/delete`, {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body: `_csrf=${token}`,
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/");
    expect(await harness.service.list()).toHaveLength(0);
    expect(await (await harness.app.request("/")).text()).not.toContain("oficinas");
  });
});

describe("marca, renomear, progresso humano, falha e consumo", () => {
  test("a marca no cabecalho leva de volta para a lista", async () => {
    const body = await (await harness.app.request("/")).text();
    expect(body).toContain('<h1><a href="/"><svg class="brand-mark"');
    expect(body).toContain("</svg><span>GoodBizz</span></a></h1>");
    expect(body).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>');
    expect(body).toContain('<link rel="icon" href="/favicon.png" sizes="64x64" type="image/png"/>');
    expect(body).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180"/>');
  });

  test("o detalhe oferece o dialogo de renomear e a rota sem JS com CSRF", async () => {
    const study = await harness.service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    const body = await (await harness.app.request(`/studies/${study.id}`)).text();

    expect(body).toContain('id="rename-modal"');
    expect(body).toContain('id="rename-input"');
    expect(body).toContain("Salvar");
    expect(body).toContain("Cancelar");
    expect(body).toContain(`action="/ui/studies/${study.id}/rename"`);
    expect(body).toContain(`data-rename-api="/api/studies/${study.id}"`);
    // O campo do fallback sem JS vem pre-preenchido com o titulo atual (já normalizado).
    expect(body).toContain(`value="Oficinas"`);
  });

  test("renomear sem JS troca o titulo e volta para o estudo", async () => {
    const study = await harness.service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    const { cookiePair, token } = await csrfToken();
    const response = await harness.app.request(`/ui/studies/${study.id}/rename`, {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body: `niche=padarias+do+bairro&_csrf=${token}`,
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/studies/${study.id}`);
    // Renomear passa pela mesma normalização da criação.
    expect((await harness.service.get(study.id)).niche).toBe("Padarias Do Bairro");
  });

  test("renomear sem JS recusa titulo curto com 422", async () => {
    const study = await harness.service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    const { cookiePair, token } = await csrfToken();
    const response = await harness.app.request(`/ui/studies/${study.id}/rename`, {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body: `niche=a&_csrf=${token}`,
    });
    expect(response.status).toBe(422);
    expect((await harness.service.get(study.id)).niche).toBe("Oficinas");
  });

  test("o progresso mostra a fase em linguagem humana acima do passo tecnico", async () => {
    const study = await harness.service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    await harness.repo.update(study.id, {
      progress: { state: "running", step: "[3/6] avaliando as ideias", error: null },
    });
    const body = await (await harness.app.request(`/studies/${study.id}`)).text();

    expect(body).toContain('id="progress-label"');
    expect(body).toContain("Fase 3 de 6 — Avaliando cada ideia com o decisor System One");
    expect(body).toContain('id="progress-step"');
    expect(body).toContain("avaliando as ideias");
    // O contador de tempo e a barra de 6 fases seguem no lugar.
    expect(body).toContain('id="progress-elapsed"');
    expect(body).toContain('id="progress-steps"');
  });

  test("a falha mostra o alerta, a acao de executar de novo e preserva os artefatos", async () => {
    const study = await harness.service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    await harness.repo.update(study.id, {
      progress: {
        state: "failed",
        step: "[4/6] medindo a dor",
        error: "Limite do provedor (429). Tente de novo em alguns minutos.",
      },
    });
    const body = await (await harness.app.request(`/studies/${study.id}`)).text();

    expect(body).toContain('id="failure-panel"');
    expect(body).toContain("O estudo falhou");
    expect(body).toContain("Limite do provedor (429). Tente de novo em alguns minutos.");
    expect(body).toContain("Executar de novo");
    expect(body).toContain(`action="/ui/studies/${study.id}/run"`);
    expect(body).toContain(`data-run-api="/api/studies/${study.id}/run"`);
    // O painel não promete mais "refazer do começo": a reexecução retoma o que já está em cache.
    expect(body).toContain("retoma do ponto onde parou");
  });

  test("executar de novo sem JS reinicia o pipeline e volta para o estudo", async () => {
    const study = await harness.service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    const { cookiePair, token } = await csrfToken();
    const response = await harness.app.request(`/ui/studies/${study.id}/run`, {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body: `_csrf=${token}`,
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/studies/${study.id}`);
  });

  test("o painel de consumo mostra tokens, chamadas e custo estimado", async () => {
    const study = await harness.service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    await harness.repo.update(study.id, {
      usage: {
        llm: { calls: 3, inputTokens: 12480, cachedInputTokens: 2000, outputTokens: 5000 },
        decider: { calls: 42, inputTokens: 900, cachedInputTokens: 0, outputTokens: 300 },
      },
    });
    const body = await (await harness.app.request(`/studies/${study.id}`)).text();

    expect(body).toContain("Consumo e custo estimado");
    expect(body).toContain("chamadas ao LLM");
    expect(body).toContain("chamadas ao decisor");
    expect(body).toContain("tokens de entrada");
    expect(body).toContain("tokens de entrada em cache");
    expect(body).toContain("tokens de saída");
    expect(body).toContain("13.380");
    expect(body).toContain("US$");
    // O `note` do helper vira a legenda em `hint`.
    expect(body).toContain("preços de tabela");
  });

  test("estudo sem medicao de consumo mostra o aviso, sem inventar numero", async () => {
    const study = await harness.service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    const body = await (await harness.app.request(`/studies/${study.id}`)).text();
    expect(body).toContain("Sem medição de consumo (estudo gerado antes desta versão).");
    expect(body).not.toContain("chamadas ao LLM");
  });

  test("o cartao da lista traz um chip de custo so quando ha consumo medido", async () => {
    const withUsage = await harness.service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    await harness.repo.update(withUsage.id, {
      usage: {
        llm: { calls: 2, inputTokens: 200000, cachedInputTokens: 0, outputTokens: 100000 },
        decider: { calls: 5, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      },
    });
    const noUsage = await harness.service.create(resolveStudyConfig({ niche: "padarias", mock: true }));
    expect(noUsage.usage).toBeNull();

    const body = await (await harness.app.request("/")).text();
    expect(body).toContain("~US$ 0,0");
    // Dois cartoes na lista, mas so o estudo com consumo medido ganha o chip.
    expect(body.match(/class="study-card/g)?.length).toBe(2);
    expect(body.match(/custo estimado do consumo medido/g)?.length).toBe(1);
  });
});

describe("formulario de criacao", () => {
  test("criar sem JS grava o titulo normalizado e a descricao", async () => {
    const { cookiePair, token } = await csrfToken();
    const response = await harness.app.request("/ui/studies", {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body:
        "niche=clinicas+odontologicas&description=bairro%2C+uma+cadeira&mock=1" +
        `&monthlyTicket=300&numIdeas=2&_csrf=${token}`,
    });
    expect(response.status).toBe(303);

    const studies = await harness.service.list();
    expect(studies).toHaveLength(1);
    const record = await harness.service.get(studies[0]!.id);
    expect(record.niche).toBe("Clinicas Odontologicas");
    // A descrição fica gravada, mas não vira título nem aparece como texto próprio na página.
    expect(record.description).toBe("bairro, uma cadeira");
    const body = await (await harness.app.request(`/studies/${record.id}`)).text();
    expect(body).not.toContain("bairro, uma cadeira");
  });
});

describe("configuracao dos provedores", () => {
  test("o topbar oferece o link para as configuracoes", async () => {
    const body = await (await harness.app.request("/")).text();
    expect(body).toContain('<a href="/settings">Configurações</a>');
  });

  test("a pagina de configuracoes mostra cada campo com a origem e a chave mascarada", async () => {
    await harness.settings.patch({ llmBaseUrl: "https://salvo.test/v1", deciderApiKey: "chave-salva-9999" });

    const response = await harness.app.request("/settings");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const body = await response.text();

    expect(body).toContain("Configuração dos provedores");
    expect(body).toContain("A configuração vale para os próximos estudos.");
    expect(body).toContain('action="/ui/settings"');
    expect(body).toContain("Salvar");

    // Sobreposicao salva: origem "definido aqui" e a opcao de limpar.
    const saved = settingRow(body, "llmBaseUrl");
    expect(saved).toContain("URL do LLM");
    expect(saved).toContain("definido aqui");
    expect(saved).toContain("salvo.test");
    expect(saved).toContain('name="clear_llmBaseUrl"');

    // Chave vinda do ambiente: mascara no lugar do valor cru e campo de senha.
    const envKey = settingRow(body, "llmApiKey");
    expect(envKey).toContain("Chave do LLM");
    expect(envKey).toContain("do ambiente");
    expect(envKey).toContain("sk-…1234");
    expect(envKey).toContain('type="password"');
    expect(envKey).toContain('autocomplete="off"');
    expect(envKey).not.toContain('name="clear_llmApiKey"');

    // Chave salva: continua mascarada, nunca em claro.
    const savedKey = settingRow(body, "deciderApiKey");
    expect(savedKey).toContain("definido aqui");
    expect(savedKey).toContain("cha…9999");
    expect(savedKey).toContain('name="clear_deciderApiKey"');

    // Campo sem ambiente e sem sobreposicao: "nao definido".
    expect(settingRow(body, "deciderUrl")).toContain("não definido");
    expect(settingRow(body, "llmModel")).toContain("do ambiente");

    // Nem a chave do ambiente nem a salva podem aparecer em claro no HTML.
    expect(body).not.toContain("sk-env-chave-secreta-1234");
    expect(body).not.toContain("chave-salva-9999");
  });

  test("a pagina agrupa os campos por provedor, com legenda e ajuda associada ao campo", async () => {
    const body = await (await harness.app.request("/settings")).text();

    expect(body).toContain('class="settings-group"');
    expect(body).toContain("<legend>Provedor de texto (LLM)</legend>");
    expect(body).toContain("<legend>Provedor de decisão (System One)</legend>");

    // Cada campo sob o grupo do provedor a que pertence — e só sob ele.
    const llmGroup = body.slice(
      body.indexOf("<legend>Provedor de texto (LLM)</legend>"),
      body.indexOf("<legend>Provedor de decisão (System One)</legend>"),
    );
    expect(llmGroup).toContain('data-setting="llmBaseUrl"');
    expect(llmGroup).toContain('data-setting="llmApiKey"');
    expect(llmGroup).not.toContain('data-setting="deciderUrl"');

    const deciderGroup = body.slice(body.indexOf("<legend>Provedor de decisão (System One)</legend>"));
    expect(deciderGroup).toContain('data-setting="deciderUrl"');
    expect(deciderGroup).not.toContain('data-setting="llmModel"');

    // O texto de ajuda vive no DOM e é referenciado pelo input.
    expect(body).toContain('id="setting-help-llmBaseUrl"');
    expect(body).toContain('aria-describedby="setting-help-llmBaseUrl"');
  });

  test("salvar sem JS aplica o patch e volta para a pagina de configuracoes", async () => {
    const { cookiePair, token } = await csrfToken();
    const response = await harness.app.request("/ui/settings", {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body: `llmModel=modelo-escolhido&_csrf=${token}`,
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/settings");
    expect(await harness.service.providerSettings()).toEqual({ llmModel: "modelo-escolhido" });

    const body = await (await harness.app.request("/settings")).text();
    const row = settingRow(body, "llmModel");
    expect(row).toContain("definido aqui");
    expect(row).toContain("modelo-escolhido");
    expect(row).toContain('name="clear_llmModel"');
  });

  test("limpar remove a sobreposicao e o campo volta a herdar o ambiente", async () => {
    await harness.settings.patch({ llmBaseUrl: "https://salvo.test/v1" });

    const { cookiePair, token } = await csrfToken();
    const response = await harness.app.request("/ui/settings", {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body: `clear_llmBaseUrl=1&_csrf=${token}`,
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/settings");
    expect(await harness.service.providerSettings()).toEqual({});

    const body = await (await harness.app.request("/settings")).text();
    const row = settingRow(body, "llmBaseUrl");
    expect(row).toContain("do ambiente");
    expect(row).toContain("api.llm.test");
    expect(row).not.toContain("salvo.test");
    expect(row).not.toContain('name="clear_llmBaseUrl"');
  });

  test("um campo fora do contrato e recusado e nada muda", async () => {
    const { cookiePair, token } = await csrfToken();
    const response = await harness.app.request("/ui/settings", {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body: `desconhecido=1&_csrf=${token}`,
    });
    expect(response.status).toBe(422);
    expect(await harness.service.providerSettings()).toEqual({});
  });
});

describe("gestao de ideias na pagina do estudo", () => {
  /**
   * Estudo concluido renderizado pela propria app, e nao pelo componente isolado: o que o operador
   * ve e o que a rota devolve, incluindo o token de CSRF injetado pela app.
   */
  async function rendered(numIdeas = 3, state?: StudyState) {
    const study = await harness.service.create(
      resolveStudyConfig({ niche: "clinicas", numIdeas, mock: true }),
    );
    await harness.service.run(study.id);
    if (state !== undefined) {
      await harness.repo.update(study.id, { progress: { state, step: "x", error: null } });
    }
    const done = await harness.service.get(study.id);
    const html = await (await harness.app.request(`/studies/${study.id}`)).text();
    return { html, evaluations: done.evaluations, id: study.id };
  }

  test("cada linha do ranking tem um botao de excluir com dialogo de confirmacao", async () => {
    const { html, evaluations } = await rendered();

    // Um botao por ideia, e nao um por linha decorada: a contagem bate com as avaliacoes.
    const buttons = html.match(/data-idea-delete=/g) ?? [];
    expect(buttons).toHaveLength(evaluations.length);
    // O dialogo de confirmacao existe e tem os dois caminhos: confirmar e cancelar.
    expect(html).toContain('id="idea-delete-modal"');
    expect(html).toContain('id="idea-delete-confirm"');
    expect(html).toContain('id="idea-delete-cancel"');
    expect(html).toContain("<dialog");
  });

  test("o dialogo de exclusao de ideia tem um aviso proprio para a falha", async () => {
    const { html } = await rendered(2);

    // A falha da exclusao nao pode morrer no console: o dialogo tem um paragrafo proprio, vazio no
    // HTML servido, para o motivo ficar na tela enquanto a ideia continua no estudo.
    expect(html).toMatch(/<p id="idea-delete-error"[^>]*role="alert"[^>]*><\/p>/);
    expect(html).toContain('id="idea-delete-text"');
  });

  test("o botao de excluir carrega o id da ideia, nao o nome nem a posicao", async () => {
    const { html, evaluations } = await rendered();
    for (const idea of evaluations) {
      expect(html).toContain(`data-idea-delete="${idea.id}"`);
    }
    // A posicao e o nome nao podem servir de identidade: dois nomes iguais existem.
    expect(html).not.toMatch(/data-idea-delete="\d+"/);
  });

  test("existe um campo numerico e um botao para pedir N ideias novas", async () => {
    const { html, id } = await rendered();
    expect(html).toContain('name="count"');
    expect(html).toContain('type="number"');
    expect(html).toContain(`action="/ui/studies/${id}/ideas"`);
    expect(html).toContain("data-add-ideas");
    // O teto aparece para o operador nao descobrir o limite so depois de pedir.
    expect(html).toContain("40");
  });

  test("as acoes mutaveis nao aparecem enquanto o estudo roda", async () => {
    const { html } = await rendered(3, "running");
    expect(html).not.toContain("data-idea-delete=");
    expect(html).not.toContain("data-add-ideas");
  });

  test("o formulario de adicao leva o token de CSRF", async () => {
    const { html } = await rendered();
    const form = html.match(/<form[^>]*data-add-ideas[^>]*>[\s\S]*?<\/form>/)?.[0] ?? "";
    expect(form).toContain('name="_csrf"');
    expect(form).toContain("value=");
  });
});

describe("rotas de UI para ideia", () => {
  /** Estudo concluido, pronto para as duas acoes. */
  async function completed() {
    const study = await harness.service.create(resolveStudyConfig({ niche: "clinicas", mock: true }));
    await harness.service.run(study.id);
    return harness.service.get(study.id);
  }

  test("excluir ideia sem token de CSRF e recusado", async () => {
    const study = await completed();
    const target = study.evaluations[0]?.id ?? "";
    const response = await harness.app.request(`/ui/studies/${study.id}/ideas/${target}/delete`, {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost" },
      body: "",
    });
    expect(response.status).toBe(403);
    // Recusar e recusar mesmo: a ideia continua la.
    const after = await harness.service.get(study.id);
    expect(after.evaluations.map((e) => e.id)).toEqual(study.evaluations.map((e) => e.id));
  });

  test("acrescentar ideias sem token de CSRF e recusado", async () => {
    const study = await completed();
    const response = await harness.app.request(`/ui/studies/${study.id}/ideas`, {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost" },
      body: "count=2",
    });
    expect(response.status).toBe(403);
    const after = await harness.service.get(study.id);
    expect(after.evaluations).toHaveLength(study.evaluations.length);
  });
  test("excluir ideia inexistente com token valido responde 404", async () => {
    const study = await completed();
    const { cookiePair, token } = await csrfToken();
    const response = await harness.app.request(`/ui/studies/${study.id}/ideas/nao-existe/delete`, {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body: `_csrf=${encodeURIComponent(token)}`,
    });
    expect(response.status).toBe(404);
  });

  test("acrescentar ideias com token valido inicia a adicao e redireciona para o estudo", async () => {
    const study = await completed();
    const { cookiePair, token } = await csrfToken();
    const response = await harness.app.request(`/ui/studies/${study.id}/ideas`, {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body: `count=2&_csrf=${encodeURIComponent(token)}`,
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/studies/${study.id}`);
    // O redirect nao espera a geracao; o que muda e o estudo, e ele so cresce.
    const after = await harness.service.get(study.id);
    expect(after.evaluations.length).toBeGreaterThanOrEqual(study.evaluations.length);
  });

  test("acrescentar ideias com count invalido responde 422 e nao gera", async () => {
    const study = await completed();
    const { cookiePair, token } = await csrfToken();
    const response = await harness.app.request(`/ui/studies/${study.id}/ideas`, {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body: `count=0&_csrf=${encodeURIComponent(token)}`,
    });
    expect(response.status).toBe(422);
    const after = await harness.service.get(study.id);
    expect(after.evaluations).toHaveLength(study.evaluations.length);
  });

  test("excluir ideia com token valido remove e redireciona para o estudo", async () => {
    const study = await completed();
    const { cookiePair, token } = await csrfToken();
    const target = study.evaluations[0]?.id ?? "";
    const response = await harness.app.request(`/ui/studies/${study.id}/ideas/${target}/delete`, {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body: `_csrf=${encodeURIComponent(token)}`,
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/studies/${study.id}`);
    const after = await harness.service.get(study.id);
    expect(after.evaluations.map((e) => e.id)).not.toContain(target);
  });
  test("excluir ideia de estudo inexistente com token valido responde 404", async () => {
    const { cookiePair, token } = await csrfToken();
    const response = await harness.app.request("/ui/studies/estudo-inexistente/ideas/nao-existe/delete", {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body: `_csrf=${encodeURIComponent(token)}`,
    });
    expect(response.status).toBe(404);
  });

  test("excluir ideia com token valido responde 409 enquanto o pipeline roda", async () => {
    // Provedor que nunca responde: o estudo fica `running` e dentro do inFlight do serviço.
    // Precisa de um app proprio porque e o inFlight deste servico que produz o conflito.
    const db: DatabaseHandle = openMigratedDatabase(":memory:");
    const hanging = new StudyService({
      repo: new SqliteStudyRepository(db.db),
      cache: new StudyCache(new SqliteCacheStore(db.db)),
      llm: { generateText: () => new Promise<string>(() => {}) },
      decider: new DeciderMock(),
      logger: createLogger("error"),
      artifactsRoot: mkdtempSync(join(tmpdir(), "goodbizz-ui-hanging-")),
    });
    const hangingApp = buildUiApp({
      service: hanging,
      sessionSecret: loadEnv().SESSION_SECRET,
      production: false,
    });
    const study = await hanging.create(resolveStudyConfig({ niche: "clinicas", mock: true }));
    hanging.start(study.id);
    const cookie = (await hangingApp.request("/")).headers.get("set-cookie") ?? "";
    const cookiePair = cookie.split(";")[0] ?? "";
    const signed = decodeURIComponent(cookiePair.slice(`${CSRF_COOKIE}=`.length));
    const token = signed.slice(0, signed.lastIndexOf("."));
    const response = await hangingApp.request(`/ui/studies/${study.id}/ideas/qualquer/delete`, {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body: `_csrf=${encodeURIComponent(token)}`,
    });
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toBe("CONFLICT");
    db.sqlite.close();
  });

  test("acrescentar ideias acima do teto responde 422 e nao gera", async () => {
    const study = await completed();
    const { cookiePair, token } = await csrfToken();
    const response = await harness.app.request(`/ui/studies/${study.id}/ideas`, {
      method: "POST",
      headers: { ...FORM, Origin: "http://localhost", Cookie: cookiePair },
      body: `count=39&_csrf=${encodeURIComponent(token)}`,
    });
    expect(response.status).toBe(422);
    const after = await harness.service.get(study.id);
    expect(after.evaluations).toHaveLength(study.evaluations.length);
  });
});
