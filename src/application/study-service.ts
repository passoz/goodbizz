/**
 * Study service: the application facade shared by the CLI, the HTTP API and the web UI.
 *
 * Owns the lifecycle of a study (create -> run -> artifacts) and exposes the diagnosis and
 * recalibration use cases. Nothing here talks HTTP or SQL directly: it depends on ports.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import { diagnoseProbes, diagnoseExitCode, type DiagnoseReport } from "./diagnose.ts";
import { buildArtifactFiles, buildZip } from "./artifacts.ts";
import { explainFailure } from "./failures.ts";
import type { ProviderSettingsStore } from "./settings.ts";
import { generateAddition, generateStudy } from "./generate-study.ts";
import { htmlToPdf } from "./pdf.ts";
import { recalibrate, type RecalibrateReport } from "./recalibrate.ts";
import { folderName, slug } from "./reports.ts";
import { summarizeStudy } from "./summary.ts";
import { scrub } from "../config/redact.ts";
import { resolveStudyConfig, studyContext } from "../config/runtime.ts";
import { ConflictError, NotFoundError, ValidationError } from "../domain/errors.ts";
import type { ArtifactFile, DeciderClient, LlmClient, Logger, StudyRepository } from "../domain/ports.ts";
import type { ProviderSettings, ProviderSettingsPatch } from "../domain/types.ts";
import type {
  Idea,
  StudyConfig,
  StudyIdea,
  StudyListItem,
  StudyRecord,
  StudySummary,
} from "../domain/types.ts";
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

/** Teto de ideias por estudo. Acima disso o operador nao consegue usar o ranking na tela. */
export const MAX_IDEAS_PER_STUDY = 40;

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
        // Sem `?? 60` aqui: o fallback de `GOODBIZZ_LLM_TIMEOUT` mora em
        // `resolveStudyConfig`, e um literal nunca deixa esse fallback rodar. Com o `60` fixo,
        // todo estudo nascia com 60 s por chamada, ignorando a configuracao do servico.
        timeout: this.options.timeout,
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

  /**
   * Remove uma ideia pelo id e reconcilia o que dependia dela: ranking persistido, summary e a
   * arvore de artefatos.
   *
   * A identidade vem do `id` (coluna `idea_id`), nunca do nome: com dois nomes iguais, apagar por
   * nome levaria as duas. O estudo e recusado (409) enquanto o pipeline roda, porque o run
   * reescreveria pastas e agregados por baixo da remocao.
   */
  async removeIdea(id: string, ideaId: string): Promise<StudyRecord> {
    // A corrida vem antes do resto: durante o run ainda nao existem avaliacoes gravadas, e um
    // `NotFoundError` de ideia seria a resposta errada para o operador.
    if (this.inFlight.has(id)) {
      throw new ConflictError(`study ${id} is still running`);
    }
    const record = await this.get(id);
    const target = record.evaluations.find((evaluation) => evaluation.id === ideaId);
    if (!target) {
      throw new NotFoundError(`idea ${ideaId} not found in study ${id}`);
    }
    const remaining = record.evaluations.filter((evaluation) => evaluation.id !== ideaId);

    // `saveEvaluations` regrava `rank` pela posicao do array, entao a ordem nova zera em 1.
    const summary = this.summaryOf(remaining);
    await this.options.repo.saveEvaluations(id, remaining, summary);
    this.reconcileIdeasOnDisk(record, target, remaining, summary);
    this.options.logger.info("idea removed", { id, ideaId, name: target.name });

    const updated = await this.get(id);
    if (!updated) throw new NotFoundError(`study ${id} disappeared during the removal`);
    return updated;
  }

  /**
   * Faz `NN-slug/` casar com o ranking novo, sem perder o documento de quem continua no estudo.
   *
   * `previous` e a ordem antiga (o rank persistido diz qual pasta cada ideia ocupava) e `folders` o
   * destino de cada nome. A renomeacao e em duas fases porque renomear direto encolheria `02-x`
   * para `01-x` e depois a `01-x` voltaria para `02-x`, sobrescrevendo a pasta que acabou de
   * receber o documento. `freshNames` sao as ideias cujo documento chega agora: elas nao sao
   * renomeadas, sao escritas.
   */
  private reconcileFolders(
    record: StudyRecord,
    previous: readonly StudyIdea[],
    folders: Record<string, string>,
    freshNames: ReadonlySet<string>,
    freshFiles: readonly ArtifactFile[],
  ): void {
    const root = record.artifactDir;
    if (!existsSync(root)) return;

    const staged = new Map<string, string>();
    previous.forEach((idea, position) => {
      // Ideia homonima de uma que vem nova: as duas disputam a mesma pasta, e a que chega
      // agora vence. Sem esse desempate o documento novo seria sobrescrito pelo antigo.
      if (freshNames.has(idea.name)) return;
      const current = folderName(position + 1, idea.name);
      if (!existsSync(join(root, current))) return;
      const temporary = `.pwn-reconciliando-${idea.id}`;
      rmSync(join(root, temporary), { recursive: true, force: true });
      renameSync(join(root, current), join(root, temporary));
      staged.set(idea.id, temporary);
    });

    this.writeFiles(root, freshFiles);

    for (const idea of previous) {
      const temporary = staged.get(idea.id);
      if (temporary === undefined) continue;
      const target = folders[idea.name];
      if (target === undefined) continue;
      rmSync(join(root, target), { recursive: true, force: true });
      renameSync(join(root, temporary), join(root, target));
    }

    // Rede de seguranca do contrato "nenhum orfao": qualquer `NN-slug` fora do ranking novo sai.
    const expected = new Set(Object.values(folders));
    for (const folder of this.ideaFoldersOnDisk(root)) {
      if (!expected.has(folder)) rmSync(join(root, folder), { recursive: true, force: true });
    }
  }

  /**
   * Reconcilia `NN-slug/` com o ranking novo. A renomeacao e em duas fases porque renomear direto
   * encolheria `02-x` para `01-x` e depois a `01-x` voltaria para `02-x`, sobrescrevendo a pasta
   * que acabou de receber o documento. Documentos das ideias preservadas nao sao regerados (isso
   * exigiria LLM de novo); so os agregados, que sao funcao do conjunto.
   */
  private reconcileIdeasOnDisk(
    record: StudyRecord,
    removed: StudyIdea,
    remaining: readonly StudyIdea[],
    summary: StudySummary | null,
  ): void {
    const root = record.artifactDir;
    if (!existsSync(root)) return;

    // Pasta atual de cada ideia: `NN-slug` do rank antigo. O id nao esta no caminho, entao o
    // vinculo vem do rank persistido -- nunca de casar nome com nome.
    const currentFolder = new Map<string, string>();
    record.evaluations.forEach((idea, position) => {
      const candidate = folderName(position + 1, idea.name);
      if (existsSync(join(root, candidate))) currentFolder.set(idea.id, candidate);
    });

    const staged = new Map<string, string>();
    for (const [ideaId, folder] of currentFolder) {
      if (ideaId === removed.id) continue;
      const temporary = `.pwn-removendo-${ideaId}`;
      renameSync(join(root, folder), join(root, temporary));
      staged.set(ideaId, temporary);
    }
    for (const [position, idea] of remaining.entries()) {
      const temporary = staged.get(idea.id);
      if (temporary === undefined) continue;
      const target = folderName(position + 1, idea.name);
      rmSync(join(root, target), { recursive: true, force: true });
      renameSync(join(root, temporary), join(root, target));
    }

    // A pasta da ideia removida some pelo id.
    const removedFolder = currentFolder.get(removed.id);
    if (removedFolder !== undefined) rmSync(join(root, removedFolder), { recursive: true, force: true });

    // Rede de seguranca do contrato "nenhum orfao": qualquer `NN-slug` que nao perteneca ao
    // ranking novo e removida.
    const expected = new Set(remaining.map((idea, position) => folderName(position + 1, idea.name)));
    for (const folder of this.ideaFoldersOnDisk(root)) {
      if (!expected.has(folder)) rmSync(join(root, folder), { recursive: true, force: true });
    }

    const cfg = this.configForRecord(record, remaining.length);
    const folders: Record<string, string> = {};
    for (const [position, idea] of remaining.entries()) {
      folders[idea.name] = folderName(position + 1, idea.name);
    }
    const aggregates = buildArtifactFiles(
      cfg,
      record.brief ?? "",
      summary ?? this.summaryOf([])!,
      [...remaining],
      folders,
      {},
      // Só a raiz: os `NN-slug/README.md` de cada ideia foram preservados pela renomeação.
    ).filter((file) => !file.path.includes("/"));
    if (remaining.length === 0) {
      // Sem ideias nao ha ranking para indexar: o README e o tabelao viriam descrevendo nada.
      for (const stale of ["README.md", "00-tabelao.md", "00-tabelao.csv"]) {
        rmSync(join(root, stale), { force: true });
      }
      this.writeFiles(
        root,
        aggregates.filter((file) => file.path === "dados.json"),
      );
      return;
    }
    this.writeFiles(root, aggregates);
  }

  /** Pastas `NN-slug` da raiz do estudo. */
  private ideaFoldersOnDisk(root: string): string[] {
    return Array.from(new Bun.Glob("*/").scanSync({ cwd: root, onlyFiles: false }), (entry) =>
      entry.replace(/\/$/, ""),
    ).filter((entry) => /^\d\d-/.test(entry));
  }

  /**
   * Summary das ideias restantes. Com zero ideias a media populacional vira NaN e o `dados.json`
   * gravaria `null` no lugar de um numero, entao as medias sao normalizadas para 0.
   */
  private summaryOf(ideas: readonly StudyIdea[]): StudySummary | null {
    if (ideas.length === 0) return null;
    const summary = summarizeStudy([...ideas]);
    for (const [key, value] of Object.entries(summary.means)) {
      if (!Number.isFinite(value)) summary.means[key as keyof StudySummary["means"]] = 0;
    }
    return summary;
  }

  /** Configuracao do estudo com o numero de ideias que ele tem agora (o `dados.json` deve casar). */
  private configForRecord(record: StudyRecord, numIdeas: number): StudyConfig {
    return resolveStudyConfig({
      niche: record.niche,
      city: record.city,
      monthlyTicket: record.monthlyTicket,
      numIdeas,
      painMethod: record.painMethod,
      mock: record.mock,
      mockLlm: record.mock || this.options.mockLlm === true,
      mockDecider: record.mock || this.options.mockDecider === true,
      outputDir: record.artifactDir,
      pdf: this.options.pdf ?? false,
      concurrency: this.options.concurrency ?? 8,
      paraphrases: this.options.paraphrases ?? 3,
      timeout: this.options.timeout,
    });
  }

  /**
   * Acrescenta `count` ideias novas, preservando as que ja existem.
   *
   * Deliberadamente nao `async`: a rota de API precisa receber o 409/422/404 na chamada, e nao
   * como promessa rejeitada, para responder 201 e so entao deixar a execucao em background. A
   * promessa devolvida resolve quando a adicao termina, o que e o que o CLI e os testes esperam.
   */
  addIdeas(id: string, count: number): Promise<StudyRecord> {
    if (this.inFlight.has(id)) {
      throw new ConflictError(`study ${id} is still running`);
    }
    const work = this.get(id).then((record) => {
      if (!Number.isInteger(count) || count < 1) {
        throw new ValidationError(
          `count precisa ser um inteiro de 1 a ${MAX_IDEAS_PER_STUDY}; veio ${count}`,
        );
      }
      const total = record.evaluations.length + count;
      if (total > MAX_IDEAS_PER_STUDY) {
        throw new ValidationError(
          `o estudo tem ${record.evaluations.length} de ${MAX_IDEAS_PER_STUDY} ideias; ` +
            `${count} novas passaria de ${MAX_IDEAS_PER_STUDY}`,
        );
      }
      return this.executeAddition(record, count);
    });
    // A vaga e tomada antes do primeiro await: duas adicoes simultaneas nao podem passar.
    this.inFlight.set(id, work);
    return work.finally(() => {
      if (this.inFlight.get(id) === work) this.inFlight.delete(id);
    });
  }

  private async executeAddition(record: StudyRecord, count: number): Promise<StudyRecord> {
    const id = record.id;
    const setProgress = async (
      state: StudyRecord["progress"]["state"],
      step: string,
      error: string | null,
    ) => {
      await this.options.repo.update(id, { progress: { state, step, error } });
    };

    await setProgress("running", `adicionando ${count} ideias`, null);
    try {
      const cfg = this.configForRecord(record, record.evaluations.length + count);
      const clients = this.options.clientsFor?.(cfg) ?? {
        llm: this.options.llm,
        decider: this.options.decider,
      };
      const result = await generateAddition(
        cfg,
        { brief: record.brief ?? "", existing: record.evaluations },
        count,
        // Uma chave de cache por pedido: dois pedidos iguais no mesmo estudo sao operacoes distintas.
        Bun.randomUUIDv7(),
        {
          llm: clients.llm,
          decider: clients.decider,
          cache: this.options.cache,
          logger: this.options.logger,
          onProgress: (step) => {
            void setProgress("running", step, null);
          },
        },
      );

      await this.options.repo.saveEvaluations(id, result.evaluations, result.summary);
      // As pastas que sobraram de antes sao renomeadas para o indice novo e as novas vao pro disco.
      const freshNames = new Set(
        result.evaluations.slice(record.evaluations.length).map((idea) => idea.name),
      );
      this.reconcileFolders(record, record.evaluations, result.folders, freshNames, result.files);
      this.rebuildPdf(record, cfg, id);

      await setProgress("done", "concluído", null);
      this.options.logger.info("ideas added", { id, added: count, total: result.evaluations.length });

      const updated = await this.get(id);
      if (!updated) throw new NotFoundError(`study ${id} disappeared during the addition`);
      return updated;
    } catch (error) {
      const raw = scrub(error instanceof Error ? error.message : String(error));
      this.options.logger.error("idea addition failed", { id, error: raw });
      await setProgress("failed", "erro", explainFailure(error));
      throw error;
    }
  }

  /** Regera o PDF quando o estudo o produz: o `dados.json` e o HTML acabaram de mudar. */
  private rebuildPdf(record: StudyRecord, cfg: StudyConfig, id: string): void {
    if (!cfg.pdf) return;
    const htmlPath = join(record.artifactDir, "estudo-completo.html");
    if (!existsSync(htmlPath)) return;
    void htmlToPdf(htmlPath, join(record.artifactDir, "estudo-completo.pdf")).then((result) => {
      this.options.logger.info("pdf compilation", { id, message: result.message, ok: result.ok });
    });
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
