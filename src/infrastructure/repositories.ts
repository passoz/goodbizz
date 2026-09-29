/**
 * SQLite adapter for StudyRepository (Drizzle query builders only, no raw SQL).
 *
 * Evaluations are serialized with the same key scheme the Python baseline writes to
 * `dados.json`, so the stored payload stays compatible with `recalibrate`.
 */
import { asc, desc, eq } from "drizzle-orm";

import type { Db } from "./db.ts";
import { evaluations, studies } from "./schema.ts";
import type { StudyRepository } from "../domain/ports.ts";
import type {
  IdeaEvaluation,
  PainMethod,
  StudyListItem,
  StudyProgress,
  StudyRecord,
  StudyState,
  StudySummary,
  Tier,
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
}

/** Domain evaluation -> baseline `dados.json` idea object. */
function evaluationToIdeaJson(e: IdeaEvaluation): IdeaJson {
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
  };
}

/** Baseline `dados.json` idea object -> domain evaluation. */
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
  };
}

export class SqliteStudyRepository implements StudyRepository {
  private readonly db: Db;

  constructor(db: Db) {
    this.db = db;
  }

  async save(record: StudyRecord): Promise<void> {
    const values = {
      id: record.id,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      niche: record.niche,
      city: record.city,
      monthlyTicket: record.monthlyTicket,
      numIdeas: record.numIdeas,
      painMethod: record.painMethod,
      mock: record.mock,
      artifactDir: record.artifactDir,
      brief: record.brief,
      state: record.progress.state,
      step: record.progress.step,
      error: record.progress.error,
      summaryJson: record.summary ? JSON.stringify(record.summary) : null,
    };
    this.db
      .insert(studies)
      .values(values)
      .onConflictDoUpdate({
        target: studies.id,
        set: {
          createdAt: values.createdAt,
          updatedAt: values.updatedAt,
          niche: values.niche,
          city: values.city,
          monthlyTicket: values.monthlyTicket,
          numIdeas: values.numIdeas,
          painMethod: values.painMethod,
          mock: values.mock,
          artifactDir: values.artifactDir,
          brief: values.brief,
          state: values.state,
          step: values.step,
          error: values.error,
          summaryJson: values.summaryJson,
        },
      })
      .run();
  }

  async update(id: string, patch: Partial<StudyRecord> & { progress?: StudyProgress }): Promise<void> {
    const set: Partial<typeof studies.$inferInsert> = {
      updatedAt: patch.updatedAt ?? new Date().toISOString(),
    };
    if (patch.niche !== undefined) set.niche = patch.niche;
    if (patch.city !== undefined) set.city = patch.city;
    if (patch.monthlyTicket !== undefined) set.monthlyTicket = patch.monthlyTicket;
    if (patch.numIdeas !== undefined) set.numIdeas = patch.numIdeas;
    if (patch.painMethod !== undefined) set.painMethod = patch.painMethod;
    if (patch.mock !== undefined) set.mock = patch.mock;
    if (patch.artifactDir !== undefined) set.artifactDir = patch.artifactDir;
    if (patch.brief !== undefined) set.brief = patch.brief;
    if (patch.summary !== undefined) {
      set.summaryJson = patch.summary ? JSON.stringify(patch.summary) : null;
    }
    if (patch.progress !== undefined) {
      set.state = patch.progress.state;
      set.step = patch.progress.step;
      set.error = patch.progress.error;
    }
    this.db.update(studies).set(set).where(eq(studies.id, id)).run();
  }

  async get(id: string): Promise<StudyRecord | null> {
    const row = this.db.select().from(studies).where(eq(studies.id, id)).get();
    if (!row) return null;
    const evalRows = this.db
      .select()
      .from(evaluations)
      .where(eq(evaluations.studyId, id))
      .orderBy(asc(evaluations.rank))
      .all();
    return {
      id: row.id,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      niche: row.niche,
      city: row.city,
      monthlyTicket: row.monthlyTicket,
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
      evaluations: evalRows.map((r) => ideaJsonToEvaluation(JSON.parse(r.payloadJson) as IdeaJson)),
      summary: row.summaryJson ? (JSON.parse(row.summaryJson) as StudySummary) : null,
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
      };
    });
  }

  async saveEvaluations(
    studyId: string,
    evaluations_: IdeaEvaluation[],
    summary: StudyRecord["summary"],
  ): Promise<void> {
    const ordered = [...evaluations_].sort((a, b) => b.index - a.index);
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
}
