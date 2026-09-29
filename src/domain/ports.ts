/**
 * Ports (interfaces) the application layer depends on. Infrastructure provides adapters.
 */
import type {
  DeciderAnswers,
  IdeaEvaluation,
  QuestionSet,
  StudyListItem,
  StudyProgress,
  StudyRecord,
} from "./types.ts";

/** Text generation provider (any OpenAI-compatible chat completions endpoint). */
export interface LlmClient {
  generateText(system: string, user: string): Promise<string>;
}

/** Probabilistic decision provider (System One protocol). */
export interface DeciderClient {
  ask(state: string, questions: QuestionSet): Promise<DeciderAnswers>;
  queryProbes(state: string, probes: Record<string, string>): Promise<Record<string, number>>;
}

export interface Logger {
  debug(message: string, fields?: Record<string, unknown>): void;
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/** Response cache keyed by a hash of the call parameters. */
export interface CacheStore {
  get(key: string): Promise<unknown | null>;
  put(key: string, value: unknown): Promise<void>;
  count(): Promise<number>;
  hits(): number;
}

export interface StudyRepository {
  save(record: StudyRecord): Promise<void>;
  update(id: string, patch: Partial<StudyRecord> & { progress?: StudyProgress }): Promise<void>;
  get(id: string): Promise<StudyRecord | null>;
  list(): Promise<StudyListItem[]>;
  /** Remove o estudo e as avaliações dele. Os artefatos em disco sao do chamador. */
  delete(id: string): Promise<void>;
  saveEvaluations(
    studyId: string,
    evaluations: IdeaEvaluation[],
    summary: StudyRecord["summary"],
  ): Promise<void>;
}

export interface ArtifactFile {
  /** Path relative to the study output directory. */
  path: string;
  content: string | Uint8Array;
}

/** Writes the deterministic artifact tree of a study to disk. */
export interface ArtifactStore {
  write(studyId: string, files: ArtifactFile[]): Promise<string>;
  read(studyId: string, relativePath: string): Promise<string | null>;
  list(studyId: string): Promise<string[]>;
}
