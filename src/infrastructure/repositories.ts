/**
 * SQLite adapter for StudyRepository (Drizzle query builders only, no raw SQL).
 *
 * Evaluations are serialized with the same key scheme the Python baseline writes to
 * `dados.json`, so the stored payload stays compatible with `recalibrate`.
 */
import { asc, desc, eq } from "drizzle-orm";
import type { Database } from "bun:sqlite";

import type { Db } from "./db.ts";
import { evaluations, studies } from "./schema.ts";
import { rankIdeas } from "../application/tournament.ts";
import type { StudyRepository } from "../domain/ports.ts";
import type {
  Evidence,
  IdeaEvaluation,
  IdeaValue,
  PainMethod,
  StudyListItem,
  StudyProgress,
  StudyRecord,
  StudyIdea,
  StudyState,
  StudySummary,
  StudyUsage,
  Tier,
  TournamentStanding,
} from "../domain/types.ts";

/** Idea object exactly as written to `dados.json` by the baseline. */
interface IdeaJson {
  nome: string;
  setor: string;
  descricao: string;
  indicadores: {
    fit: number;
    fit_conf: number;
    venda: number;
    venda_conf: number;
    disrupcao: number;
    disrupcao_conf: number;
    dor: string;
    dor_probs: Record<string, number>;
    dor_conf: number;
    solo: number;
  };
  negocio: {
    wtp: number;
    meta30: number;
    preco: number;
    preco_conf: number;
  };
  algoritmo: {
    rotulo: string;
    escore_dor: number;
    escore_interna: number;
    margem: number;
    desvio: number;
    sondas: Record<string, number>;
    por_parafrase: Record<string, Record<string, number>>;
  };
  indice: number;
  tier: Tier;
  valor?: {
    premissas: Array<{ nome: string; valor: number; unidade: string; fonte: string }>;
    recuperacao: number;
    perda_mes: number;
    ganho_mes: number;
    saldo_mes: number;
    payback_meses: number | null;
    retorno_12m: number;
    setup_fee: number;
  };
}

/** Domain evaluation -> baseline `dados.json` idea object (CON-006: bloco `valor` aditivo). */
function evaluationToIdeaJson(e: IdeaEvaluation & { value?: IdeaValue }): IdeaJson {
  return {
    nome: e.name,
    setor: e.sector,
    descricao: e.description,
    indicadores: {
      fit: e.indicators.fit,
      fit_conf: e.indicators.fitConf,
      venda: e.indicators.sale,
      venda_conf: e.indicators.saleConf,
      disrupcao: e.indicators.disruption,
      disrupcao_conf: e.indicators.disruptionConf,
      dor: e.indicators.pain,
      dor_probs: e.indicators.painProbs,
      dor_conf: e.indicators.painConf,
      solo: e.indicators.solo,
    },
    negocio: {
      wtp: e.business.wtp,
      meta30: e.business.meta30,
      preco: e.business.price,
      preco_conf: e.business.priceConf,
    },
    algoritmo: {
      rotulo: e.algorithm.label,
      escore_dor: e.algorithm.painScore,
      escore_interna: e.algorithm.internalScore,
      margem: e.algorithm.margin,
      desvio: e.algorithm.deviation,
      sondas: e.algorithm.probes,
      por_parafrase: e.algorithm.byParaphrase,
    },
    indice: e.index,
    tier: e.tier,
    ...(e.value === undefined
      ? {}
      : {
          valor: {
            premissas: e.value.premises.map((premise) => ({ ...premise })),
            recuperacao: e.value.recovery,
            perda_mes: e.value.loss,
            ganho_mes: e.value.gain,
            saldo_mes: e.value.balance,
            payback_meses: e.value.paybackMonths,
            retorno_12m: e.value.return12m,
            setup_fee: e.value.setupFee,
          },
        }),
  };
}

/** Baseline `dados.json` idea object -> domain evaluation (bloco `valor` ausente vira ideia sem valor). */
function ideaJsonToEvaluation(j: IdeaJson): IdeaEvaluation {
  return {
    name: j.nome,
    sector: j.setor,
    description: j.descricao,
    indicators: {
      fit: j.indicadores.fit,
      fitConf: j.indicadores.fit_conf,
      sale: j.indicadores.venda,
      saleConf: j.indicadores.venda_conf,
      disruption: j.indicadores.disrupcao,
      disruptionConf: j.indicadores.disrupcao_conf,
      pain: j.indicadores.dor,
      painProbs: j.indicadores.dor_probs,
      painConf: j.indicadores.dor_conf,
      solo: j.indicadores.solo,
    },
    business: {
      wtp: j.negocio.wtp,
      meta30: j.negocio.meta30,
      price: j.negocio.preco,
      priceConf: j.negocio.preco_conf,
    },
    algorithm: {
      label: j.algoritmo.rotulo,
      painScore: j.algoritmo.escore_dor,
      internalScore: j.algoritmo.escore_interna,
      margin: j.algoritmo.margem,
      deviation: j.algoritmo.desvio,
      probes: j.algoritmo.sondas,
      byParaphrase: j.algoritmo.por_parafrase,
    },
    index: j.indice,
    tier: j.tier,
    ...(j.valor === undefined
      ? {}
      : {
          value: {
            premises: j.valor.premissas.map((premise) => ({ ...premise })),
            recovery: j.valor.recuperacao,
            loss: j.valor.perda_mes,
            gain: j.valor.ganho_mes,
            balance: j.valor.saldo_mes,
            paybackMonths: j.valor.payback_meses,
            return12m: j.valor.retorno_12m,
            setupFee: j.valor.setup_fee,
          },
        }),
  };
}

const NO_SEARCH = { calls: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };

/**
 * Consumo gravado. Estudos anteriores à busca não têm `search`: a leitura completa com zero para o
 * custo e a página tratarem todo estudo do mesmo jeito.
 */
function usageOf(json: string | null): StudyUsage | null {
  if (!json) return null;
  const usage = JSON.parse(json) as Omit<StudyUsage, "search"> & { search?: StudyUsage["search"] };
  return { ...usage, search: usage.search ?? { ...NO_SEARCH } };
}

export class SqliteStudyRepository implements StudyRepository {
  constructor(private readonly db: Db) {}

  async save(record: StudyRecord): Promise<void> {
    const values = {
      id: record.id,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      niche: record.niche,
      description: record.description,
      city: record.city,
      monthlyTicket: record.monthlyTicket,
      setupFee: record.setupFee,
      numIdeas: record.numIdeas,
      painMethod: record.painMethod,
      mock: record.mock,
      artifactDir: record.artifactDir,
      brief: record.brief,
      state: record.progress.state,
      step: record.progress.step,
      error: record.progress.error,
      summaryJson: record.summary ? JSON.stringify(record.summary) : null,
      usageJson: record.usage ? JSON.stringify(record.usage) : null,
      evidencesJson: JSON.stringify(record.evidences),
    };
    this.db
      .insert(studies)
      .values(values)
      .onConflictDoUpdate({
        target: studies.id,
        set: {
          createdAt: values.createdAt,
          niche: values.niche,
          description: values.description,
          city: values.city,
          monthlyTicket: values.monthlyTicket,
          setupFee: values.setupFee,
          numIdeas: values.numIdeas,
          painMethod: values.painMethod,
          mock: values.mock,
          artifactDir: values.artifactDir,
          brief: values.brief,
          state: values.state,
          step: values.step,
          error: values.error,
          summaryJson: values.summaryJson,
          usageJson: values.usageJson,
          evidencesJson: values.evidencesJson,
        },
      })
      .run();
  }

  async update(id: string, patch: Partial<StudyRecord> & { progress?: StudyProgress }): Promise<void> {
    const set: Partial<typeof studies.$inferInsert> = {
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };
    if (patch.niche !== undefined) set.niche = patch.niche;
    if (patch.description !== undefined) set.description = patch.description;
    if (patch.city !== undefined) set.city = patch.city;
    if (patch.monthlyTicket !== undefined) set.monthlyTicket = patch.monthlyTicket;
    if (patch.setupFee !== undefined) set.setupFee = patch.setupFee;
    if (patch.numIdeas !== undefined) set.numIdeas = patch.numIdeas;
    if (patch.painMethod !== undefined) set.painMethod = patch.painMethod;
    if (patch.mock !== undefined) set.mock = patch.mock;
    if (patch.artifactDir !== undefined) set.artifactDir = patch.artifactDir;
    if (patch.brief !== undefined) set.brief = patch.brief;
    if (patch.summary !== undefined) {
      set.summaryJson = patch.summary ? JSON.stringify(patch.summary) : null;
    }
    if (patch.usage !== undefined) {
      set.usageJson = patch.usage ? JSON.stringify(patch.usage) : null;
    }
    if (patch.evidences !== undefined) set.evidencesJson = JSON.stringify(patch.evidences);
    if (patch.progress !== undefined) {
      set.state = patch.progress.state;
      set.step = patch.progress.step;
      set.error = patch.progress.error;
    }
    this.db.update(studies).set(set).where(eq(studies.id, id)).run();
  }

  async get(id: string): Promise<StudyRecord | null> {
    // Banco anterior à migração 0007 não tem a coluna `setup_fee`: o Drizzle devolve o nome
    // da coluna no lugar do valor, então a leitura cai para o SQL tolerante (QR-004).
    if (!this.hasSetupFeeColumn()) return this.getLegacy(id);
    const row = this.db.select().from(studies).where(eq(studies.id, id)).get() ?? null;
    if (!row) return null;
    const evalRows = this.db
      .select()
      .from(evaluations)
      .where(eq(evaluations.studyId, id))
      .orderBy(asc(evaluations.rank))
      .all();
    const ideas: StudyIdea[] = evalRows.map((r) => ({
      ...ideaJsonToEvaluation(JSON.parse(r.payloadJson) as IdeaJson),
      // O id vem da coluna; o payload_json continua sendo a fonte da forma do baseline (CON-006).
      id: r.ideaId ?? `legacy-${r.studyId}-${String(r.rank).padStart(8, "0")}`,
      // A data de geracao vive em coluna propria pela mesma razao; ideia antiga nao tem.
      ...(r.generatedAt === null ? {} : { generatedAt: r.generatedAt }),
      // O torneio tambem: estudo anterior a ele volta com `null` e ordena pelo indice.
      tournament: r.tournamentJson === null ? null : (JSON.parse(r.tournamentJson) as TournamentStanding),
    }));
    const summary = row.summaryJson ? (JSON.parse(row.summaryJson) as StudySummary) : null;
    // Estudos gravados antes da migration 0003 guardaram `summary_json` sem `id` em `ordered`.
    // A tabela `evaluations` e a fonte da identidade (o backfill preencheu `idea_id`), entao
    // `ordered` e remontado dela — mesma ordem do ranking que `summarizeStudy` usa (torneio,
    // indice, nome) — em vez do blob denormalizado, que ficaria sem id para sempre.
    if (summary) {
      summary.ordered = rankIdeas(ideas);
    }
    return {
      id: row.id,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      niche: row.niche,
      description: row.description,
      city: row.city,
      monthlyTicket: row.monthlyTicket,
      setupFee: row.setupFee ?? 1500,
      numIdeas: row.numIdeas,
      painMethod: row.painMethod as PainMethod,
      mock: row.mock,
      artifactDir: row.artifactDir,
      brief: row.brief,
      progress: {
        state: row.state as StudyState,
        step: row.step,
        error: row.error,
      },
      evaluations: ideas,
      summary,
      usage: usageOf(row.usageJson),
      evidences: row.evidencesJson ? (JSON.parse(row.evidencesJson) as Evidence[]) : [],
    };
  }

  async list(): Promise<StudyListItem[]> {
    const rows = this.db.select().from(studies).orderBy(desc(studies.createdAt)).all();
    return rows.map((row) => {
      const summary = row.summaryJson ? (JSON.parse(row.summaryJson) as StudySummary) : null;
      const top = summary?.ordered[0];
      return {
        id: row.id,
        createdAt: row.createdAt,
        niche: row.niche,
        city: row.city,
        monthlyTicket: row.monthlyTicket,
        state: row.state as StudyState,
        step: row.step,
        ideaCount: summary ? summary.ordered.length : 0,
        topIdea: top ? top.name : null,
        topIndex: top ? top.index : null,
        usage: usageOf(row.usageJson),
      };
    });
  }

  async saveEvaluations(
    studyId: string,
    evaluations_: StudyIdea[],
    summary: StudyRecord["summary"],
  ): Promise<void> {
    // O rank gravado e a ordem do ranking: media do torneio, depois indice, depois nome.
    const ordered = rankIdeas(evaluations_);
    this.db.transaction((tx) => {
      tx.delete(evaluations).where(eq(evaluations.studyId, studyId)).run();
      if (ordered.length > 0) {
        tx.insert(evaluations)
          .values(
            ordered.map((e, i) => ({
              studyId,
              rank: i + 1,
              name: e.name,
              sector: e.sector,
              description: e.description,
              index: e.index,
              tier: e.tier,
              payloadJson: JSON.stringify(evaluationToIdeaJson(e)),
              ideaId: e.id,
              generatedAt: e.generatedAt ?? null,
              tournamentJson: e.tournament ? JSON.stringify(e.tournament) : null,
            })),
          )
          .run();
      }
      tx.update(studies)
        .set({ summaryJson: summary ? JSON.stringify(summary) : null })
        .where(eq(studies.id, studyId))
        .run();
    });
  }

  /** A coluna `setup_fee` existe quando a migração 0007 já rodou. */
  private hasSetupFeeColumn(): boolean {
    const sqlite = (this.db as unknown as { $client: Database }).$client;
    const columns = sqlite.query("PRAGMA table_info(studies)").all() as Array<{ name: string }>;
    return columns.some((column) => column.name === "setup_fee");
  }

  /** Leitura de banco anterior à migração 0007 (sem `setup_fee`): devolve o padrão 1500. */
  private getLegacy(id: string): StudyRecord | null {
    const sqlite = (this.db as unknown as { $client: Database }).$client;
    const row = sqlite.query("SELECT * FROM studies WHERE id = ?").get(id) as Record<string, unknown> | null;
    if (!row || typeof row["id"] !== "string") return null;
    return {
      id: row["id"],
      createdAt: String(row["created_at"] ?? ""),
      updatedAt: String(row["updated_at"] ?? ""),
      niche: String(row["niche"] ?? ""),
      description: String(row["description"] ?? ""),
      city: String(row["city"] ?? ""),
      monthlyTicket: Number(row["monthly_ticket"] ?? 0),
      setupFee: 1500,
      numIdeas: Number(row["num_ideas"] ?? 0),
      painMethod: row["pain_method"] as PainMethod,
      mock: row["mock"] === 1 || row["mock"] === true,
      artifactDir: String(row["artifact_dir"] ?? ""),
      brief: String(row["brief"] ?? ""),
      progress: {
        state: (row["state"] as StudyState) ?? "pending",
        step: String(row["step"] ?? ""),
        error: (row["error"] as string | null) ?? null,
      },
      evaluations: [],
      summary: row["summary_json"] ? (JSON.parse(String(row["summary_json"])) as StudySummary) : null,
      usage: usageOf(typeof row["usage_json"] === "string" ? row["usage_json"] : null),
      evidences:
        typeof row["evidences_json"] === "string" && row["evidences_json"] !== ""
          ? (JSON.parse(String(row["evidences_json"])) as Evidence[])
          : [],
    };
  }

  /** Apaga o estudo e as avaliações dele na mesma transação. */
  async delete(id: string): Promise<void> {
    this.db.transaction((tx) => {
      tx.delete(evaluations).where(eq(evaluations.studyId, id)).run();
      tx.delete(studies).where(eq(studies.id, id)).run();
    });
  }
}
