import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { buildApiApp } from "../src/infrastructure/http/api.ts";
import { makeHarness, type TestHarness } from "./helpers.ts";

let harness: TestHarness;

beforeEach(() => {
  harness = makeHarness();
});

afterEach(() => {
  harness.close();
});

function api() {
  return buildApiApp({
    service: harness.service,
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
});
