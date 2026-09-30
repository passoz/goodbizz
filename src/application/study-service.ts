/**
 * Study service: the application facade shared by the CLI, the HTTP API and the web UI.
 *
 * Owns the lifecycle of a study (create -> run -> artifacts) and exposes the diagnosis and
 * recalibration use cases. Nothing here talks HTTP or SQL directly: it depends on ports.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { diagnoseProbes, diagnoseExitCode, type DiagnoseReport } from "./diagnose.ts";
import { buildZip } from "./artifacts.ts";
import { explainFailure } from "./failures.ts";
import type { ProviderSettingsStore } from "./settings.ts";
import { generateStudy } from "./generate-study.ts";
import { htmlToPdf } from "./pdf.ts";
import { recalibrate, type RecalibrateReport } from "./recalibrate.ts";
import { slug } from "./reports.ts";
import { scrub } from "../config/redact.ts";
import { resolveStudyConfig, studyContext } from "../config/runtime.ts";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.ts";
import type { ArtifactFile, DeciderClient, LlmClient, Logger, StudyRepository } from "../domain/ports.ts";
import type { ProviderSettings, ProviderSettingsPatch } from "../domain/types.ts";
import type { Idea, StudyConfig, StudyListItem, StudyRecord } from "../domain/types.ts";
import type { StudyCache } from "./cache.ts";

export interface StudyServiceOptions {
  repo: StudyRepository;
  cache: StudyCache;
  llm: LlmClient;
  decider: DeciderClient;
  /** Clientes por estudo (permite um timeout diferente por configuração); sem isso valem `llm`/`decider`. */
  clientsFor?: (cfg: StudyConfig) => { llm: LlmClient; decider: DeciderClient };
  logger: Logger;
  /** Root directory that holds one subdirectory per study. */
  artifactsRoot: string;
  pdf?: boolean;
  concurrency?: number;
  paraphrases?: number;
  timeout?: number;
  /** Providers configured as simulated at the service level; a study inherits them. */
  mockLlm?: boolean;
  mockDecider?: boolean;
  /** Configuração de provedores vinda da aba `/settings` (sobrepõe o ambiente). */
  settings?: ProviderSettingsStore;
}

export interface DiagnoseInput {
  ideas: readonly Idea[];
  niche: string;
  city?: string;
  threshold?: number;
}

export class StudyService {
  /** One in-flight run per study: a concurrent request awaits the same execution. */
  private readonly inFlight = new Map<string, Promise<StudyRecord>>();

  constructor(private readonly options: StudyServiceOptions) {}

  /** Persist a pending study. The caller decides when to run it. */
  async create(cfg: StudyConfig): Promise<StudyRecord> {
    const id = Bun.randomUUIDv7();
    const now = new Date().toISOString();
    const artifactDir = join(this.options.artifactsRoot, id);
    mkdirSync(artifactDir, { recursive: true });
    const record: StudyRecord = {
      id,
      createdAt: now,
      updatedAt: now,
      niche: cfg.niche,
      city: cfg.city,
      monthlyTicket: cfg.monthlyTicket,
      numIdeas: cfg.numIdeas,
      painMethod: cfg.painMethod,
      mock: cfg.mock,
      artifactDir,
      brief: "",
      progress: { state: "pending", step: "na fila", error: null },
      evaluations: [],
      summary: null,
      usage: null,
    };
    await this.options.repo.save(record);
    this.options.logger.info("study created", { id, niche: cfg.niche });
    return record;
  }

  /** Start the pipeline without awaiting it; failures land in the persisted progress. */
  start(id: string): void {
    void this.run(id).catch((error: unknown) => {
      this.options.logger.error("study run failed", { id, error: scrub(String(error)) });
    });
  }

  /** Execute the pipeline for an existing study; concurrent callers share the same execution. */
  async run(id: string): Promise<StudyRecord> {
    const existing = this.inFlight.get(id);
    if (existing) return existing;
    const execution = this.executeRun(id).finally(() => {
      this.inFlight.delete(id);
    });
    this.inFlight.set(id, execution);
    return execution;
  }

  private async executeRun(id: string): Promise<StudyRecord> {
    const record = await this.options.repo.get(id);
    if (!record) throw new NotFoundError(`study ${id} not found`);

    const setProgress = async (
      state: StudyRecord["progress"]["state"],
      step: string,
      error: string | null,
    ) => {
      await this.options.repo.update(id, { progress: { state, step, error } });
    };

    await setProgress("running", "iniciando", null);
    try {
      const cfg = resolveStudyConfig({
        niche: record.niche,
        city: record.city,
        monthlyTicket: record.monthlyTicket,
        numIdeas: record.numIdeas,
        painMethod: record.painMethod,
        mock: record.mock,
        // O estudo herda do serviço o que estiver simulado: sem isso, um estudo criado sem o
        // "modo simulado" exigiria credencial de um provedor que o serviço já decidiu simular.
        mockLlm: record.mock || this.options.mockLlm === true,
        mockDecider: record.mock || this.options.mockDecider === true,
        outputDir: record.artifactDir,
        pdf: this.options.pdf ?? false,
        concurrency: this.options.concurrency ?? 8,
        paraphrases: this.options.paraphrases ?? 3,
        timeout: this.options.timeout ?? 60,
      });

      const clients = this.options.clientsFor?.(cfg) ?? {
        llm: this.options.llm,
        decider: this.options.decider,
      };
      const result = await generateStudy(cfg, {
        llm: clients.llm,
        decider: clients.decider,
        cache: this.options.cache,
        logger: this.options.logger,
        onProgress: (step) => {
          void setProgress("running", step, null);
        },
      });

      this.writeFiles(record.artifactDir, result.files);

      if (cfg.pdf) {
        const htmlPath = join(record.artifactDir, "estudo-completo.html");
        const pdfPath = join(record.artifactDir, "estudo-completo.pdf");
        const pdfResult = await htmlToPdf(htmlPath, pdfPath);
        this.options.logger.info("pdf compilation", { id, message: pdfResult.message, ok: pdfResult.ok });
      }

      await this.options.repo.update(id, { brief: result.brief, usage: result.usage });
      await this.options.repo.saveEvaluations(id, result.evaluations, result.summary);
      await setProgress("done", "concluído", null);

      const updated = await this.options.repo.get(id);
      if (!updated) throw new NotFoundError(`study ${id} disappeared during the run`);
      return updated;
    } catch (error) {
      // O texto guardado é o que o operador lê: explica o motivo e o que fazer; o erro cru entra
      // entre parênteses para depuração e o log mantém tudo.
      const raw = scrub(error instanceof Error ? error.message : String(error));
      this.options.logger.error("study run failed", { id, error: raw });
      await setProgress("failed", "erro", explainFailure(error));
      throw error;
    }
  }

  async list(): Promise<StudyListItem[]> {
    return this.options.repo.list();
  }

  async get(id: string): Promise<StudyRecord> {
    const record = await this.options.repo.get(id);
    if (!record) throw new NotFoundError(`study ${id} not found`);
    return record;
  }

  /** Configuração de provedores salva em runtime (vazio = tudo do ambiente). */
  async providerSettings(): Promise<ProviderSettings> {
    return this.options.settings ? this.options.settings.current() : {};
  }

  /** Aplica um remendo na configuração de provedores; os clientes passam a usá-la já na próxima chamada. */
  async updateProviderSettings(patch: ProviderSettingsPatch): Promise<ProviderSettings> {
    if (!this.options.settings) throw new ValidationError("configuração de provedores indisponível");
    const next = await this.options.settings.patch(patch);
    this.options.logger.info("provider settings updated", { fields: Object.keys(patch) });
    return next;
  }

  /**
   * Renomeia o estudo (o título exibido). Não mexe em artefatos nem em pastas: o diretório do
   * estudo é o id e as pastas das ideias vêm do rank + nome da ideia.
   */
  async rename(id: string, niche: string): Promise<StudyRecord> {
    const clean = niche.trim();
    if (clean.length < 2) {
      throw new ValidationError("o nicho precisa de pelo menos 2 caracteres");
    }
    await this.get(id);
    await this.options.repo.update(id, { niche: clean });
    return this.get(id);
  }

  /**
   * Apaga o estudo: registro, avaliações e a árvore de artefatos no disco.
   * Recusa (409) enquanto o pipeline está rodando — apagar no meio deixaria escrita órfã.
   */
  async delete(id: string): Promise<void> {
    const record = await this.get(id);
    if (this.inFlight.has(id)) {
      throw new ConflictError(`study ${id} is still running`);
    }
    rmSync(record.artifactDir, { recursive: true, force: true });
    await this.options.repo.delete(id);
  }

  /** Relative paths of every artifact already written for the study. */
  async artifactPaths(id: string): Promise<string[]> {
    const record = await this.get(id);
    return this.listFiles(record.artifactDir);
  }

  async readArtifact(id: string, relativePath: string): Promise<string> {
    const target = await this.artifactPath(id, relativePath);
    if (!existsSync(target) || !statSync(target).isFile()) {
      throw new NotFoundError(`artifact ${relativePath} not found for study ${id}`);
    }
    return readFileSync(target, "utf8");
  }

  /** Absolute path of an artifact, validated against directory traversal. */
  async artifactPath(id: string, relativePath: string): Promise<string> {
    const record = await this.get(id);
    return this.safePath(record.artifactDir, relativePath);
  }

  /**
   * ZIP com todos os artefatos do estudo, em uma pasta com nome legivel. Le do disco (o que o
   * usuário vê na listagem e o que ele baixa) e falha quando ainda não há nada gravado.
   */
  async archive(id: string): Promise<{ filename: string; bytes: Uint8Array<ArrayBuffer> }> {
    const record = await this.get(id);
    const paths = this.listFiles(record.artifactDir);
    if (paths.length === 0) {
      throw new NotFoundError(`study ${id} has no artifacts to download yet`);
    }
    const prefix = `${slug(record.niche) || "estudo"}-${record.id.slice(0, 8)}`;
    const entries = paths.map((relativePath) => ({
      path: `${prefix}/${relativePath}`,
      // Copia para um ArrayBuffer próprio: `readFileSync` devolve Buffer, e o ZIP precisa de bytes
      // estáveis (além de satisfazer o tipo do compressor).
      data: new Uint8Array(readFileSync(this.safePath(record.artifactDir, relativePath))),
    }));
    return {
      filename: `estudo-${prefix}.zip`,
      bytes: buildZip(entries),
    };
  }

  async diagnose(input: DiagnoseInput): Promise<{ report: DiagnoseReport; exitCode: number }> {
    const report = await diagnoseProbes(
      input.ideas,
      this.options.decider,
      studyContext({ niche: input.niche, city: input.city ?? "" }),
      input.threshold,
    );
    return { report, exitCode: diagnoseExitCode(report) };
  }

  recalibrate(payloads: readonly unknown[], cutoff?: number): RecalibrateReport {
    return recalibrate(payloads, cutoff);
  }

  private listFiles(root: string, base = root): string[] {
    if (!existsSync(root)) return [];
    const files: string[] = [];
    for (const entry of readdirSync(root).sort()) {
      const path = join(root, entry);
      if (statSync(path).isDirectory()) files.push(...this.listFiles(path, base));
      else files.push(relative(base, path).split(sep).join("/"));
    }
    return files;
  }

  private writeFiles(root: string, files: readonly ArtifactFile[]): void {
    for (const file of files) {
      const target = this.safePath(root, file.path);
      mkdirSync(resolve(target, ".."), { recursive: true });
      if (typeof file.content === "string") writeFileSync(target, file.content, "utf8");
      else writeFileSync(target, file.content);
    }
  }

  private safePath(root: string, relativePath: string): string {
    const rootPath = resolve(root);
    const target = resolve(rootPath, relativePath);
    if (target !== rootPath && !target.startsWith(rootPath + sep)) {
      // A path that escapes the study directory is a client error, but reporting "not found" keeps
      // the response uniform and never confirms what exists outside the root.
      throw new NotFoundError(`artifact ${relativePath} not found`);
    }
    return target;
  }
}
