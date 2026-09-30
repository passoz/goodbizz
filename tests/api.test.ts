import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { StudyCache } from "../src/application/cache.ts";
import { StudyService } from "../src/application/study-service.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { buildApiApp } from "../src/infrastructure/http/api.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { makeHarness, silentLogger, type TestHarness } from "./helpers.ts";

let harness: TestHarness;

beforeEach(() => {
  harness = makeHarness();
});

afterEach(() => {
  harness.close();
});

function api(service: StudyService = harness.service) {
  return buildApiApp({
    service,
    providerStatus: () => ({ llm: false, decider: false, mockByDefault: true }),
  });
}

describe("study API", () => {
  test("reports provider status as booleans", async () => {
    const response = await api().request("/config");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ llm: false, decider: false, mockByDefault: true });
  });

  test("creates a study and returns it with an id", async () => {
    const response = await api().request("/studies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: "oficinas mecanicas de bairro", numIdeas: 3, mock: true }),
    });
    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; niche: string; numIdeas: number };
    expect(body.id).toBeString();
    expect(body.niche).toBe("oficinas mecanicas de bairro");
    expect(body.numIdeas).toBe(3);

    const listing = await api().request("/studies");
    const list = (await listing.json()) as { studies: Array<{ id: string }> };
    expect(list.studies.map((study) => study.id)).toContain(body.id);
  });

  test("rejects an invalid payload with 422 and validation details", async () => {
    const response = await api().request("/studies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: "" }),
    });
    expect(response.status).toBe(422);
    const body = (await response.json()) as { error: string; details?: unknown[] };
    expect(body.error).toBe("VALIDATION_FAILED");
    expect(body.details?.length).toBeGreaterThan(0);
  });

  test("answers 404 for an unknown study", async () => {
    const response = await api().request("/studies/does-not-exist");
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("NOT_FOUND");
  });

  test("runs the pipeline and exposes ranked evaluations and artifacts", async () => {
    const created = await api().request("/studies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: "pousadas historicas", numIdeas: 3, mock: true }),
    });
    const { id } = (await created.json()) as { id: string };

    const run = await api().request(`/studies/${id}/run`, { method: "POST" });
    expect(run.status).toBe(200);

    const detail = (await (await api().request(`/studies/${id}`)).json()) as {
      state: string;
      evaluations: Array<{ name: string; index: number; tier: string }>;
      summary: { ordered: Array<{ name: string }> } | null;
      artifacts: string[];
    };
    expect(detail.state).toBe("done");
    expect(detail.evaluations).toHaveLength(3);
    const indices = detail.evaluations.map((evaluation) => evaluation.index);
    expect(indices).toEqual([...indices].sort((a, b) => b - a));
    const top = detail.evaluations[0];
    expect(top).toBeDefined();
    expect(detail.summary?.ordered[0]?.name).toBe(top?.name);
    expect(detail.artifacts).toContain("dados.json");
    expect(detail.artifacts.some((path) => path.endsWith("/README.md"))).toBe(true);

    const csv = await api().request(`/studies/${id}/artifacts/00-tabelao.csv`);
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect(await csv.text()).toContain("ideia,setor,indice");

    const escaped = await api().request(`/studies/${id}/artifacts/..%2F..%2Fetc%2Fpasswd`);
    expect(escaped.status).toBe(404);
  });

  test("diagnoses probes and recalibrates a dataset", async () => {
    const diagnose = await api().request("/diagnose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        niche: "pousadas",
        ideas: [{ name: "Triagem", description: "Le mensagens e encaminha" }],
      }),
    });
    expect(diagnose.status).toBe(200);
    const report = (await diagnose.json()) as { probes: Array<{ probe: string }>; usable: string[] };
    expect(report.probes.map((probe) => probe.probe)).toEqual([
      "dinheiro",
      "reputacao",
      "processo",
      "tecnologia",
    ]);

    const recalibrate = await api().request("/recalibrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasets: [{ ideias: [] }] }),
    });
    expect(recalibrate.status).toBe(200);
    const recalibrated = (await recalibrate.json()) as { cases: number; best: { strong: number } };
    expect(recalibrated.cases).toBe(0);

    const bad = await api().request("/recalibrate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datasets: [] }),
    });
    expect(bad.status).toBe(422);
  });

  test("lista, baixa em zip e serve o pdf dos artefatos", async () => {
    const created = await api().request("/studies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: "barbearias de bairro", numIdeas: 1, mock: true }),
    });
    const { id } = (await created.json()) as { id: string };

    // Sem execucao ainda nao ha artefato: a lista vem vazia e o zip responde 404.
    const emptyList = await api().request(`/studies/${id}/artifacts`);
    expect(emptyList.status).toBe(200);
    expect(((await emptyList.json()) as { artifacts: string[] }).artifacts).toEqual([]);
    expect((await api().request(`/studies/${id}/artifacts.zip`)).status).toBe(404);

    await api().request(`/studies/${id}/run`, { method: "POST" });

    const list = (await (await api().request(`/studies/${id}/artifacts`)).json()) as {
      artifacts: string[];
    };
    expect(list.artifacts).toContain("dados.json");

    const zip = await api().request(`/studies/${id}/artifacts.zip`);
    expect(zip.status).toBe(200);
    expect(zip.headers.get("content-type")).toBe("application/zip");
    expect(zip.headers.get("content-disposition")).toContain(
      'attachment; filename="estudo-barbearias-de-bairro-',
    );
    const bytes = new Uint8Array(await zip.arrayBuffer());
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    // Os nomes das entradas ficam em texto claro no ZIP.
    const names = new TextDecoder("latin1").decode(bytes);
    for (const expected of ["dados.json", "00-brief.md", "README.md"]) {
      expect(names).toContain(expected);
    }

    // Artefato binario (pdf) e servido como arquivo, nao como texto.
    writeFileSync(join(harness.artifactsRoot, id, "estudo-completo.pdf"), "%PDF-1.4 fake");
    const pdf = await api().request(`/studies/${id}/artifacts/estudo-completo.pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
  });
});

describe("exclusão de estudo", () => {
  test("apaga o estudo, as avaliações e os artefatos com 204", async () => {
    const record = await harness.service.create(
      resolveStudyConfig({ niche: "padarias de bairro", mock: true }),
    );
    mkdirSync(record.artifactDir, { recursive: true });
    writeFileSync(join(record.artifactDir, "README.md"), "# Estudo\n", "utf8");

    const response = await api().request(`/studies/${record.id}`, { method: "DELETE" });
    expect(response.status).toBe(204);

    expect((await api().request(`/studies/${record.id}`)).status).toBe(404);
    expect(existsSync(record.artifactDir)).toBe(false);
    const listing = (await (await api().request("/studies")).json()) as { studies: unknown[] };
    expect(listing.studies).toHaveLength(0);
  });

  test("responde 404 ao excluir estudo inexistente", async () => {
    expect((await api().request("/studies/nao-existe", { method: "DELETE" })).status).toBe(404);
  });

  test("recusa com 409 enquanto o pipeline esta rodando", async () => {
    // Provedor que nunca responde: mantém o estudo `running` e dentro do inFlight do serviço.
    const hanging = new StudyService({
      repo: new SqliteStudyRepository(harness.db.db),
      cache: new StudyCache(new SqliteCacheStore(harness.db.db)),
      llm: { generateText: () => new Promise<string>(() => {}) },
      decider: new DeciderMock(),
      logger: silentLogger(),
      artifactsRoot: harness.artifactsRoot,
    });
    const record = await hanging.create(resolveStudyConfig({ niche: "barbearias", mock: true }));
    hanging.start(record.id);

    const response = await api(hanging).request(`/studies/${record.id}`, { method: "DELETE" });
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: string }).error).toBe("CONFLICT");
  });
});

describe("renomear estudo", () => {
  test("muda o título exibido e aparece na listagem", async () => {
    const record = await harness.service.create(
      resolveStudyConfig({ niche: "padarias de bairro", mock: true }),
    );

    const response = await api().request(`/studies/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: "padarias artesanais do centro" }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { niche: string };
    expect(body.niche).toBe("padarias artesanais do centro");

    const listing = (await (await api().request("/studies")).json()) as {
      studies: Array<{ id: string; niche: string }>;
    };
    expect(listing.studies.find((study) => study.id === record.id)?.niche).toBe(
      "padarias artesanais do centro",
    );
  });

  test("recusa título curto com 422 e estudo inexistente com 404", async () => {
    const record = await harness.service.create(resolveStudyConfig({ niche: "barbearias", mock: true }));
    const short = await api().request(`/studies/${record.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: " a " }),
    });
    expect(short.status).toBe(422);

    const missing = await api().request("/studies/nao-existe", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ niche: "qualquer coisa" }),
    });
    expect(missing.status).toBe(404);
  });
});

describe("consumo e custo estimado", () => {
  test("devolve tokens, chamadas e o custo calculado com os preços do ambiente", async () => {
    const record = await harness.service.create(
      resolveStudyConfig({ niche: "clinicas odontologicas", mock: true }),
    );
    const repo = new SqliteStudyRepository(harness.db.db);
    await repo.update(record.id, {
      usage: {
        llm: { calls: 2, inputTokens: 1_000_000, cachedInputTokens: 0, outputTokens: 0 },
        decider: { calls: 7, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
      },
    });

    const body = (await (await api().request(`/studies/${record.id}`)).json()) as {
      usage: { llm: { calls: number; inputTokens: number }; decider: { calls: number } };
      cost: { usd: number; brl: number | null; note: string };
    };
    expect(body.usage.llm.inputTokens).toBe(1_000_000);
    expect(body.usage.decider.calls).toBe(7);
    // 1M de entrada * US$ 0,14/1M (padrão do ambiente) + decisor grátis.
    expect(body.cost.usd).toBe(0.14);
    expect(body.cost.brl).toBeNull();
    expect(body.cost.note).toContain("0.14/1M entrada");

    const listed = (await (await api().request("/studies")).json()) as {
      studies: Array<{ id: string; cost: { usd: number } | null }>;
    };
    expect(listed.studies.find((study) => study.id === record.id)?.cost?.usd).toBe(0.14);
  });

  test("estudo sem medição devolve usage e cost nulos", async () => {
    const record = await harness.service.create(resolveStudyConfig({ niche: "oficinas", mock: true }));
    const body = (await (await api().request(`/studies/${record.id}`)).json()) as {
      usage: unknown;
      cost: unknown;
    };
    expect(body.usage).toBeNull();
    expect(body.cost).toBeNull();
  });
});
