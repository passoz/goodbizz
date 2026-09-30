/**
 * Public HTTP API (`/api`). Validated at the edge with Zod; never returns filesystem paths,
 * provider URLs or credentials.
 */
import { Hono } from "hono";
import { z } from "zod";

import { buildErrorHandler } from "./errors.ts";
import { resolveStudyConfig } from "../../config/runtime.ts";
import { loadEnv } from "../../config/env.ts";
import { providerSettingsView } from "../../config/providers.ts";
import { estimateCost } from "../../application/costs.ts";
import { explainFailure } from "../../application/failures.ts";
import { ValidationError } from "../../domain/errors.ts";
import type { Logger } from "../../domain/ports.ts";
import type { StudyRecord } from "../../domain/types.ts";
import type { StudyService } from "../../application/study-service.ts";

const StudyInput = z.object({
  niche: z.string().trim().min(2, "o nicho precisa de pelo menos 2 caracteres"),
  city: z.string().trim().optional(),
  monthlyTicket: z.number().int().positive().max(1_000_000).optional(),
  numIdeas: z.number().int().min(1).max(40).optional(),
  painMethod: z.enum(["choice", "noul", "escolha"]).optional(),
  mock: z.boolean().optional(),
  mockLlm: z.boolean().optional(),
  mockDecider: z.boolean().optional(),
  pdf: z.boolean().optional(),
  concurrency: z.number().int().min(1).max(32).optional(),
  timeout: z.number().positive().max(600).optional(),
});

/** Renomear: só o título exibido (o nicho). */
/**
 * Configuração dos provedores de IA: o que for salvo aqui sobrepõe as variáveis de ambiente;
 * `null` limpa o campo e volta a herdar o ambiente.
 */
const ProviderSettingsPatchInput = z
  .object({
    llmBaseUrl: z.string().trim().max(500).nullable().optional(),
    llmModel: z.string().trim().max(200).nullable().optional(),
    llmApiKey: z.string().trim().max(500).nullable().optional(),
    deciderUrl: z.string().trim().max(500).nullable().optional(),
    deciderModel: z.string().trim().max(200).nullable().optional(),
    deciderApiKey: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const RenameInput = z.object({
  niche: z.string().trim().min(2, "o nicho precisa de pelo menos 2 caracteres"),
});

const IdeaInput = z.object({
  name: z.string().trim().min(1),
  sector: z.string().trim().optional(),
  description: z.string().trim().min(1),
});

const DiagnoseInput = z.object({
  niche: z.string().trim().min(2),
  city: z.string().trim().optional(),
  threshold: z.number().positive().max(3).optional(),
  ideas: z.array(IdeaInput).min(1).max(50),
});

const RecalibrateInput = z.object({
  cutoff: z.number().positive().max(3).optional(),
  datasets: z.array(z.unknown()).min(1),
});

function parseOrThrow<T>(schema: z.ZodType<T>, payload: unknown): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    throw new ValidationError(
      `payload invalido: ${parsed.error.issues.map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`).join("; ")}`,
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return parsed.data;
}

function publicStudy(record: StudyRecord) {
  return {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    niche: record.niche,
    city: record.city,
    monthlyTicket: record.monthlyTicket,
    numIdeas: record.numIdeas,
    painMethod: record.painMethod,
    mock: record.mock,
    brief: record.brief,
    state: record.progress.state,
    step: record.progress.step,
    // Estudos antigos guardaram o erro cru do provedor: a leitura passa pelo tradutor de falhas
    // (idempotente para o que já está humanizado).
    error: record.progress.error === null ? null : explainFailure(record.progress.error),
    evaluations: record.evaluations,
    summary: record.summary,
    usage: record.usage,
    /** Estimativa com os preços do ambiente (`GOODBIZZ_PRICE_*`); `null` sem consumo medido. */
    cost: estimateCost(record.usage),
  };
}

export interface ApiDeps {
  service: StudyService;
  /** Providers currently configured; reported as booleans only. */
  providerStatus: () => { llm: boolean; decider: boolean; mockByDefault: boolean };
  logger?: Logger;
}

const QUIET_LOGGER: Logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };

export function buildApiApp(deps: ApiDeps): Hono {
  const api = new Hono();
  api.onError(buildErrorHandler(deps.logger ?? QUIET_LOGGER));

  api.get("/config", (c) => c.json(deps.providerStatus()));

  api.post("/studies", async (c) => {
    const input = parseOrThrow(StudyInput, await c.req.json());
    const cfg = resolveStudyConfig(input);
    const record = await deps.service.create(cfg);
    deps.service.start(record.id);
    return c.json(publicStudy(record), 201);
  });

  api.get("/settings", async (c) => {
    const env = loadEnv();
    return c.json({ fields: providerSettingsView(env, await deps.service.providerSettings()) });
  });

  /** `null` limpa o campo e volta a herdar o ambiente. */
  api.patch("/settings", async (c) => {
    const patch = parseOrThrow(ProviderSettingsPatchInput, await c.req.json());
    const settings = await deps.service.updateProviderSettings(patch);
    const env = loadEnv();
    return c.json({ fields: providerSettingsView(env, settings) });
  });

  api.get("/studies", async (c) => {
    const studies = (await deps.service.list()).map((item) => ({
      ...item,
      cost: estimateCost(item.usage),
    }));
    return c.json({ studies });
  });

  api.get("/studies/:id", async (c) => {
    const record = await deps.service.get(c.req.param("id"));
    return c.json({ ...publicStudy(record), artifacts: await deps.service.artifactPaths(record.id) });
  });

  /** Renomeia o estudo: muda só o título exibido (nicho). */
  api.patch("/studies/:id", async (c) => {
    const input = parseOrThrow(RenameInput, await c.req.json());
    const record = await deps.service.rename(c.req.param("id"), input.niche);
    return c.json(publicStudy(record));
  });

  /** Exclui o estudo: registro, avaliações e artefatos. 409 enquanto o pipeline roda. */
  api.delete("/studies/:id", async (c) => {
    await deps.service.delete(c.req.param("id"));
    return c.body(null, 204);
  });

  api.post("/studies/:id/run", async (c) => {
    const record = await deps.service.run(c.req.param("id"));
    return c.json(publicStudy(record));
  });

  api.get("/studies/:id/artifacts", async (c) => {
    const id = c.req.param("id");
    return c.json({ id, artifacts: await deps.service.artifactPaths(id) });
  });

  /** Download de tudo: um ZIP com a arvore de artefatos do estudo. */
  api.get("/studies/:id/artifacts.zip", async (c) => {
    const { filename, bytes } = await deps.service.archive(c.req.param("id"));
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(bytes.length),
      },
    });
  });

  api.get("/studies/:id/artifacts/:file{.+}", async (c) => {
    const id = c.req.param("id");
    const relativePath = c.req.param("file");
    if (!relativePath) throw new ValidationError("informe o caminho do artefato");
    if (relativePath.endsWith(".pdf")) {
      const absolute = await deps.service.artifactPath(id, relativePath);
      return new Response(Bun.file(absolute), {
        headers: { "Content-Type": "application/pdf" },
      });
    }
    const content = await deps.service.readArtifact(id, relativePath);
    return c.text(content, 200, { "Content-Type": contentTypeOf(relativePath) });
  });

  api.post("/diagnose", async (c) => {
    const input = parseOrThrow(DiagnoseInput, await c.req.json());
    const { report, exitCode } = await deps.service.diagnose({
      ideas: input.ideas.map((idea) => ({
        name: idea.name,
        sector: idea.sector ?? "",
        description: idea.description,
      })),
      niche: input.niche,
      city: input.city ?? "",
      threshold: input.threshold,
    });
    return c.json({ ...report, exitCode });
  });

  api.post("/recalibrate", async (c) => {
    const input = parseOrThrow(RecalibrateInput, await c.req.json());
    return c.json(deps.service.recalibrate(input.datasets, input.cutoff));
  });

  return api;
}

function contentTypeOf(relativePath: string): string {
  if (relativePath.endsWith(".md")) return "text/markdown; charset=utf-8";
  if (relativePath.endsWith(".csv")) return "text/csv; charset=utf-8";
  if (relativePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (relativePath.endsWith(".html")) return "text/html; charset=utf-8";
  return "text/plain; charset=utf-8";
}
