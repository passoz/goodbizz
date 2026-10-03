/**
 * Public HTTP API (`/api`). Validated at the edge with Zod; never returns filesystem paths,
 * provider URLs or credentials.
 */
import { Hono } from "hono";
import { z } from "zod";

import { buildErrorHandler } from "./errors.ts";
import { resolveStudyConfig } from "../../config/runtime.ts";
import { loadEnv } from "../../config/env.ts";
import { envProviderDefaults, profileViews } from "../../config/providers.ts";
import { probeProvider } from "../provider-probe.ts";
import { estimateCost } from "../../application/costs.ts";
import { explainFailure } from "../../application/failures.ts";
import { ValidationError } from "../../domain/errors.ts";
import { MAX_DESCRIPTION_LENGTH, MAX_NICHE_LENGTH, MIN_NICHE_LENGTH } from "../../domain/naming.ts";
import type { Logger } from "../../domain/ports.ts";
import type { ProviderSettings, StudyRecord } from "../../domain/types.ts";
import { MAX_IDEAS_PER_STUDY, type StudyService } from "../../application/study-service.ts";

const StudyInput = z.object({
  niche: z
    .string()
    .trim()
    .min(MIN_NICHE_LENGTH, `o nicho precisa de pelo menos ${MIN_NICHE_LENGTH} caracteres`)
    .max(
      MAX_NICHE_LENGTH,
      `o nicho precisa ter no máximo ${MAX_NICHE_LENGTH} caracteres de título; mova o detalhe para a descrição`,
    ),
  /** Contexto do estudo: entra concatenado ao título nos prompts, nunca no título exibido. */
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
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

/** Catálogo nomeado de provedores: criar, editar, excluir, escolher o ativo e testar. */
const ProviderKindInput = z.enum(["llm", "decider"]);

const ProviderProfileInput = z
  .object({
    name: z.string().trim().min(1, "o nome do provedor é obrigatório").max(60),
    kind: ProviderKindInput,
    url: z.string().trim().min(1, "a URL do provedor é obrigatória").max(500),
    model: z.string().trim().min(1, "o modelo é obrigatório").max(200),
    apiKey: z.string().trim().max(500).optional(),
  })
  .strict();

const ProviderProfilePatchInput = z
  .object({
    name: z.string().trim().min(1, "o nome do provedor é obrigatório").max(60).optional(),
    url: z.string().trim().min(1, "a URL do provedor é obrigatória").max(500).optional(),
    model: z.string().trim().min(1, "o modelo é obrigatório").max(200).optional(),
    /** Vazio mantém a chave atual: a API nunca devolve a chave em claro. */
    apiKey: z.string().trim().max(500).optional(),
  })
  .strict();

const ActiveProviderInput = z
  .object({ kind: ProviderKindInput, id: z.string().trim().min(1).nullable() })
  .strict();

const ProviderTestInput = z
  .object({
    kind: ProviderKindInput,
    /** Provedor salvo: com `apiKey` vazio, a sonda usa a chave guardada (editar sem redigitar). */
    id: z.string().trim().min(1).optional(),
    url: z.string().trim().min(1, "a URL do provedor é obrigatória").max(500),
    model: z.string().trim().max(200).optional(),
    apiKey: z.string().trim().max(500).optional(),
  })
  .strict();

/** Ativos do catálogo no formato que a UI consome. */
function activeOf(settings: ProviderSettings): { llm: string | null; decider: string | null } {
  return { llm: settings.activeLlm ?? null, decider: settings.activeDecider ?? null };
}

/** Renomear: só o título exibido (o nicho). */
const RenameInput = z.object({
  niche: z
    .string()
    .trim()
    .min(MIN_NICHE_LENGTH, `o nicho precisa de pelo menos ${MIN_NICHE_LENGTH} caracteres`)
    .max(MAX_NICHE_LENGTH, `o nicho precisa ter no máximo ${MAX_NICHE_LENGTH} caracteres`),
});

/**
 * Quantas ideias acrescentar. O teto por estudo e conferido no serviço, e nao aqui: ele depende de
 * quantas o estudo ja tem, e a rota nao deve carregar essa regra.
 */
const AddIdeasInput = z
  .object({
    count: z.number().int("count precisa ser um numero inteiro").min(1, "count precisa ser pelo menos 1"),
  })
  .strict();

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
    description: record.description,
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
    const settings = await deps.service.providerSettings();
    return c.json({
      profiles: profileViews(settings),
      active: activeOf(settings),
      defaults: envProviderDefaults(loadEnv()),
    });
  });

  /** Cria um provedor nomeado; ele passa a ser o ativo do tipo dele. */
  api.post("/settings/providers", async (c) => {
    const input = parseOrThrow(ProviderProfileInput, await c.req.json());
    const settings = await deps.service.createProvider(input);
    return c.json({ profiles: profileViews(settings), active: activeOf(settings) }, 201);
  });

  /** Edita um provedor. `apiKey` vazio mantém a chave atual (a API nunca devolve a chave). */
  api.patch("/settings/providers/:id", async (c) => {
    const input = parseOrThrow(ProviderProfilePatchInput, await c.req.json());
    const settings = await deps.service.updateProvider(c.req.param("id"), input);
    return c.json({ profiles: profileViews(settings), active: activeOf(settings) });
  });

  api.delete("/settings/providers/:id", async (c) => {
    const settings = await deps.service.deleteProvider(c.req.param("id"));
    return c.json({ profiles: profileViews(settings), active: activeOf(settings) });
  });

  /** Escolhe o provedor ativo de um tipo; `null` volta a herdar o ambiente. */
  api.put("/settings/active", async (c) => {
    const input = parseOrThrow(ActiveProviderInput, await c.req.json());
    const settings = await deps.service.setActiveProvider(input.kind, input.id);
    return c.json({ profiles: profileViews(settings), active: activeOf(settings) });
  });

  /** Testa a configuração digitada contra o provedor (ping/ready), sem persistir nada. */
  api.post("/settings/test", async (c) => {
    const input = parseOrThrow(ProviderTestInput, await c.req.json());
    let apiKey = input.apiKey ?? "";
    if (apiKey === "" && input.id !== undefined) {
      // No editar, a chave salva nao volta para a tela em claro: a sonda usa a guardada.
      const settings = await deps.service.providerSettings();
      const stored = (settings.profiles ?? []).find((profile) => profile.id === input.id);
      if (stored !== undefined) apiKey = stored.apiKey;
    }
    const result = await probeProvider({
      kind: input.kind,
      url: input.url,
      model: input.model ?? "",
      apiKey,
    });
    return c.json(result);
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

  /**
   * Remove uma ideia pelo id: 204 sem corpo. 404 para estudo ou ideia inexistente, 409 enquanto o
   * pipeline roda.
   */
  api.delete("/studies/:id/ideas/:ideaId", async (c) => {
    await deps.service.removeIdea(c.req.param("id"), c.req.param("ideaId"));
    return c.body(null, 204);
  });

  /**
   * Acrescenta ideias: 201 na hora e a geracao em background.
   *
   * A ordem importa. O `get` vem primeiro para o estudo inexistente ser 404, e `addIdeas` e
   * chamado sem `await` de proposito: ele decide 409 e 422 de forma sincrona (a tarefa anterior),
   * e a promessa devolvida e o trabalho em background, que nao pode segurar a requisicao.
   */
  api.post("/studies/:id/ideas", async (c) => {
    const id = c.req.param("id");
    const input = parseOrThrow(AddIdeasInput, await c.req.json());
    const record = await deps.service.get(id);
    // O serviço continua sendo a autoridade sobre o teto, mas ele só descobre a resposta depois
    // de devolver a promessa. Conferir aqui com a mesma constante é o que faz o 422 chegar junto
    // da resposta, em vez de virar uma rejeição que ninguém está esperando.
    if (record.evaluations.length + input.count > MAX_IDEAS_PER_STUDY) {
      throw new ValidationError(
        `o estudo tem ${record.evaluations.length} de ${MAX_IDEAS_PER_STUDY} ideias; ` +
          `${input.count} novas passaria de ${MAX_IDEAS_PER_STUDY}`,
      );
    }
    const pending = deps.service.addIdeas(id, input.count);
    // A falha da adicao ja foi persistida no estado do estudo; aqui so evitamos rejeição solta.
    void pending.catch(() => {});
    return c.json(
      publicStudy({
        ...record,
        progress: { state: "running", step: `adicionando ${input.count} ideias`, error: null },
      }),
      201,
    );
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
