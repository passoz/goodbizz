/**
 * Interface web: lista, formulario, detalhe e a pagina sobre a API.
 * Tudo offline: SQLite em memoria, mocks deterministicos e `app.request` (sem porta).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Hono } from "hono";

import { StudyCache } from "../src/application/cache.ts";
import { StudyService } from "../src/application/study-service.ts";
import { loadEnv } from "../src/config/env.ts";
import { createLogger, resolveStudyConfig } from "../src/config/runtime.ts";
import type { IdeaEvaluation, StudySummary } from "../src/domain/types.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { openMigratedDatabase, type DatabaseHandle } from "../src/infrastructure/db.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { buildUiApp } from "../src/infrastructure/http/ui/routes.tsx";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";

interface UiHarness {
  app: Hono;
  service: StudyService;
  repo: SqliteStudyRepository;
  artifactsRoot: string;
  close: () => void;
}

function makeUiHarness(): UiHarness {
  const db: DatabaseHandle = openMigratedDatabase(":memory:");
  const repo = new SqliteStudyRepository(db.db);
  const artifactsRoot = mkdtempSync(join(tmpdir(), "goodbizz-ui-"));
  const service = new StudyService({
    repo,
    cache: new StudyCache(new SqliteCacheStore(db.db)),
    llm: new LlmMock(),
    decider: new DeciderMock(),
    logger: createLogger("error"),
    artifactsRoot,
  });
  const app = buildUiApp({ service, sessionSecret: loadEnv().SESSION_SECRET, production: false });
  return { app, service, repo, artifactsRoot, close: () => db.sqlite.close() };
}

let harness: UiHarness;

beforeEach(() => {
  harness = makeUiHarness();
});

afterEach(() => {
  harness.close();
});

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
    expect(body).toContain("oficinas");
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
    const evaluation: IdeaEvaluation = {
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
    const summary: StudySummary = {
      ordered: [evaluation],
      painGroups: { forte: ["Triagem de WhatsApp"], mista: [], fraca: [] },
      means: { fit: 0.8, sale: 0.6, disruption: 0.5, solo: 0.4, wtp: 0.7, meta30: 0.5 },
      tiers: { A: ["Triagem de WhatsApp"], B: [], C: [] },
      attack: [],
      review: [],
    };
    await harness.repo.saveEvaluations(study.id, [evaluation], summary);
    const planDir = join(harness.artifactsRoot, study.id, "01-triagem-de-whatsapp");
    mkdirSync(planDir, { recursive: true });
    writeFileSync(join(planDir, "README.md"), "# Plano\nconteudo do plano");

    const response = await harness.app.request(`/studies/${study.id}`);
    expect(response.status).toBe(200);
    const body = await response.text();

    expect(body).toContain("padarias");
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
      "disrupcao",
      "suporte solo",
      "pagaria o ticket",
      "30 clientes em 24 meses",
    ]) {
      expect(means).toContain(label);
    }
    // Todo dado apresentado carrega o seu helper de leitura.
    expect(means.match(/class="hint"/g)?.length).toBe(6);
    expect(means).toContain("maior e melhor");
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
  });

  test("a pagina como ler reune a legenda e a escala", async () => {
    const response = await harness.app.request("/como-ler");
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("Como ler estes numeros");
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
});
