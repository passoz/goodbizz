/**
 * Regressão do limite por chamada de IA na execução de um estudo.
 *
 * O serviço criava a configuração com `timeout: this.options.timeout ?? 60`. Como o literal nunca
 * é `undefined`, o fallback `overrides.timeout ?? env.GOODBIZZ_LLM_TIMEOUT` de `resolveStudyConfig`
 * nunca rodava e todo estudo nascia com 60 s por chamada, ignorando `GOODBIZZ_LLM_TIMEOUT`. Em
 * produção isso cortava documentos de 20 mil tokens do `deepseek-flash` e do tier gratuito do
 * tokenharbor (27,6 tok/s medidos), com 3 tentativas de 60 s = 184,5 s e falha garantida.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";

import { StudyCache } from "../src/application/cache.ts";
import { evaluationToJson } from "../src/application/dados.ts";
import { evaluateIdea } from "../src/application/evaluate.ts";
import { generateStudy } from "../src/application/generate-study.ts";
import { folderName } from "../src/application/reports.ts";
import { StudyService } from "../src/application/study-service.ts";
import { loadEnv, resetEnv } from "../src/config/env.ts";
import { resolveStudyConfig } from "../src/config/runtime.ts";
import { ConflictError, NotFoundError, ValidationError } from "../src/domain/errors.ts";
import type { StudyConfig } from "../src/domain/types.ts";
import { DeciderMock } from "../src/infrastructure/decider-mock.ts";
import { openMigratedDatabase } from "../src/infrastructure/db.ts";
import { LlmMock } from "../src/infrastructure/llm-mock.ts";
import { SqliteCacheStore } from "../src/infrastructure/cache-repository.ts";
import { SqliteStudyRepository } from "../src/infrastructure/repositories.ts";
import { silentLogger, tempDir } from "./helpers.ts";

const saved = new Map<string, string | undefined>();

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete Bun.env[key];
    else Bun.env[key] = value;
  }
  saved.clear();
  resetEnv();
});

/**
 * `executeRun` reconstroi a configuracao a partir do registro, que nao guarda chave nem URL: em
 * producao essas credenciais vem do ambiente. O teste reproduz isso em vez de injetar no registro.
 */
function withCredentials(): void {
  for (const [key, value] of [
    ["LLM_API_KEY", "test-llm-key"],
    ["DECISION_API_KEY", "test-decider-key"],
    ["DECISION_API_URL", "https://decider.invalid/v1"],
  ] as const) {
    if (!saved.has(key)) saved.set(key, Bun.env[key]);
    Bun.env[key] = value;
  }
  resetEnv();
}

/** Roda um estudo com os mocks deterministicos e devolve a config que os clientes receberam. */
async function captureRunConfig(): Promise<StudyConfig> {
  withCredentials();
  const db = openMigratedDatabase(":memory:");
  const captured: StudyConfig[] = [];
  const service = new StudyService({
    repo: new SqliteStudyRepository(db.db),
    cache: new StudyCache(new SqliteCacheStore(db.db)),
    llm: new LlmMock(),
    decider: new DeciderMock(),
    logger: silentLogger(),
    artifactsRoot: tempDir("goodbizz-timeout-"),
    clientsFor: (cfg) => {
      captured.push(cfg);
      return { llm: new LlmMock(), decider: new DeciderMock() };
    },
  });
  const record = await service.create(resolveStudyConfig({ niche: "clinicas", numIdeas: 2 }));
  await service.run(record.id);
  db.sqlite.close();
  return captured[0]!;
}

describe("limite por chamada de IA na execução do estudo", () => {
  test("herda GOODBIZZ_LLM_TIMEOUT quando o serviço não define timeout", async () => {
    saved.set("GOODBIZZ_LLM_TIMEOUT", Bun.env.GOODBIZZ_LLM_TIMEOUT);
    Bun.env.GOODBIZZ_LLM_TIMEOUT = "1200";
    resetEnv();

    const cfg = await captureRunConfig();

    expect(cfg.timeout).toBe(1200);
    // O valor fixo que causava o corte: 60 s por chamada.
    expect(cfg.timeout).not.toBe(60);
    expect(cfg.timeout).toBe(loadEnv().GOODBIZZ_LLM_TIMEOUT);
  });

  test("usa o default do ambiente quando a variável não está definida", async () => {
    saved.set("GOODBIZZ_LLM_TIMEOUT", Bun.env.GOODBIZZ_LLM_TIMEOUT);
    delete Bun.env.GOODBIZZ_LLM_TIMEOUT;
    resetEnv();

    const cfg = await captureRunConfig();

    expect(cfg.timeout).toBe(300);
    expect(cfg.timeout).not.toBe(60);
  });

  test("o timeout do serviço tem precedência sobre o ambiente", async () => {
    saved.set("GOODBIZZ_LLM_TIMEOUT", Bun.env.GOODBIZZ_LLM_TIMEOUT);
    Bun.env.GOODBIZZ_LLM_TIMEOUT = "1200";
    resetEnv();

    withCredentials();
    const db = openMigratedDatabase(":memory:");
    const captured: StudyConfig[] = [];
    const service = new StudyService({
      repo: new SqliteStudyRepository(db.db),
      cache: new StudyCache(new SqliteCacheStore(db.db)),
      llm: new LlmMock(),
      decider: new DeciderMock(),
      logger: silentLogger(),
      artifactsRoot: tempDir("goodbizz-timeout-"),
      timeout: 900,
      clientsFor: (cfg) => {
        captured.push(cfg);
        return { llm: new LlmMock(), decider: new DeciderMock() };
      },
    });
    const record = await service.create(resolveStudyConfig({ niche: "clinicas", numIdeas: 2 }));
    await service.run(record.id);
    db.sqlite.close();

    expect(captured[0]!.timeout).toBe(900);
  });
});

/**
 * FR-001 / SCENARIO-1.1: cada ideia precisa de identidade propria, porque `name` nao distingue
 * duas ideias homonimas. Sem um id, "remover exatamente a ideia que escolhi" seria impossivel.
 *
 * O `id` nasce em `evaluateIdea` e atravessa o pipeline; a persistencia dele e da task 1.3.
 */
describe("identidade estavel por ideia", () => {
  test("cada ideia avaliada recebe um id preenchido", async () => {
    const cfg = resolveStudyConfig({ niche: "clinicas", numIdeas: 1, mock: true });
    const evaluated = await evaluateIdea(
      { name: "Agenda Vazada", sector: "s", description: "d" },
      new DeciderMock(),
      cfg,
    );

    expect(typeof evaluated.id).toBe("string");
    expect(evaluated.id.length).toBeGreaterThan(0);
  });

  test("ids sao distintos entre si mesmo com names iguais", async () => {
    const cfg = resolveStudyConfig({ niche: "clinicas", numIdeas: 1, mock: true });
    const decider = new DeciderMock();

    const first = await evaluateIdea({ name: "Agenda Vazada", sector: "s", description: "d" }, decider, cfg);
    const second = await evaluateIdea({ name: "Agenda Vazada", sector: "s", description: "d" }, decider, cfg);

    // Mesmo name: so o id separa as duas linhas.
    expect(first.name).toBe(second.name);
    expect(first.id).not.toBe(second.id);
  });

  test("o id atravessa o pipeline e nao se repete dentro do estudo", async () => {
    const { handle, cache } = (() => {
      const h = openMigratedDatabase(":memory:");
      return { handle: h, cache: new StudyCache(new SqliteCacheStore(h.db)) };
    })();

    const cfg: StudyConfig = {
      ...resolveStudyConfig({ niche: "clinicas", numIdeas: 4, mock: true }),
      outputDir: tempDir("goodbizz-ideias-"),
      evaluateOnly: true,
    };
    const result = await generateStudy(cfg, {
      llm: new LlmMock(),
      decider: new DeciderMock(),
      cache,
      logger: silentLogger(),
    });

    const ids = result.evaluations.map((e) => e.id);
    expect(ids).toHaveLength(4);
    for (const id of ids) expect(id).toBeTruthy();
    expect(new Set(ids).size).toBe(ids.length);

    handle.sqlite.close();
  });

  test("o id nao entra na forma do dados.json (CON-006)", async () => {
    const cfg: StudyConfig = {
      ...resolveStudyConfig({ niche: "clinicas", numIdeas: 2, mock: true }),
      outputDir: tempDir("goodbizz-forma-"),
      evaluateOnly: true,
    };
    const handle = openMigratedDatabase(":memory:");
    const result = await generateStudy(cfg, {
      llm: new LlmMock(),
      decider: new DeciderMock(),
      cache: new StudyCache(new SqliteCacheStore(handle.db)),
      logger: silentLogger(),
    });

    // O baseline Python casa por chave: a forma nao pode ganhar `id`.
    const json = evaluationToJson(result.evaluations[0]!);
    expect(Object.keys(json)).not.toContain("id");
    expect(json["nome"]).toBe(result.evaluations[0]!.name);

    handle.sqlite.close();
  });
});

/** Estudo concluido de N ideias, com artefatos reais em disco, pronto para remocao. */
async function completedStudy(numIdeas: number) {
  withCredentials();
  const db = openMigratedDatabase(":memory:");
  const dir = tempDir("goodbizz-remove-");
  const repo = new SqliteStudyRepository(db.db);
  const service = new StudyService({
    repo,
    cache: new StudyCache(new SqliteCacheStore(db.db)),
    llm: new LlmMock(),
    decider: new DeciderMock(),
    logger: silentLogger(),
    artifactsRoot: dir,
  });
  const cfg = resolveStudyConfig({ niche: "clinicas", numIdeas, mock: true, outputDir: dir });
  const record = await service.create(cfg);
  await service.run(record.id);
  return { service, repo, db, dir, id: record.id };
}

/** Pastas `NN-slug` presentes na raiz do estudo, ordenadas. */
function ideaFolders(root: string): string[] {
  return Array.from(new Bun.Glob("*/").scanSync({ cwd: root, onlyFiles: false }))
    .map((entry) => entry.replace(/\/$/, ""))
    .filter((entry) => /^\d\d-/.test(entry))
    .sort();
}

describe("remocao de ideia por id", () => {
  test("remove a ideia do meio e zera o ranking a partir de 1", async () => {
    const { service, db, id } = await completedStudy(3);
    try {
      const before = await service.get(id);
      const middle = before.evaluations[1]!;

      const after = await service.removeIdea(id, middle.id);

      expect(after.evaluations).toHaveLength(2);
      expect(after.evaluations.map((e) => e.id)).toEqual([
        before.evaluations[0]!.id,
        before.evaluations[2]!.id,
      ]);
      // O rank gravado recomeca em 1: e o que a UI usa para numerar as pastas.
      const ranks = db.sqlite
        .query("SELECT rank FROM evaluations WHERE study_id = ? ORDER BY rank")
        .all(id) as { rank: number }[];
      expect(ranks.map((r) => r.rank)).toEqual([1, 2]);
      expect(after.summary?.ordered.map((e) => e.id)).toEqual([
        before.evaluations[0]!.id,
        before.evaluations[2]!.id,
      ]);
    } finally {
      db.sqlite.close();
    }
  });

  test("apaga a pasta da ideia removida e renomeia as seguintes, sem orfao", async () => {
    const { service, db, id } = await completedStudy(3);
    try {
      const before = await service.get(id);
      const [first, middle, last] = before.evaluations as [
        (typeof before.evaluations)[number],
        (typeof before.evaluations)[number],
        (typeof before.evaluations)[number],
      ];
      expect(ideaFolders(before.artifactDir)).toEqual([
        folderName(1, first!.name),
        folderName(2, middle!.name),
        folderName(3, last!.name),
      ]);

      await service.removeIdea(id, middle!.id);

      // Sobram 2 pastas, renumeradas pelo ranking novo; a da ideia do meio sumiu e nada ficou orfao.
      expect(ideaFolders(before.artifactDir)).toEqual([
        folderName(1, first!.name),
        folderName(2, last!.name),
      ]);
      expect(existsSync(join(before.artifactDir, folderName(2, middle!.name)))).toBe(false);
      expect(ideaFolders(before.artifactDir).every((folder) => /^\d\d-/.test(folder))).toBe(true);
    } finally {
      db.sqlite.close();
    }
  });

  test("regera os agregados com exatamente as ideias restantes", async () => {
    const { service, db, id } = await completedStudy(3);
    try {
      const before = await service.get(id);
      const removed = before.evaluations[1]!;
      const kept = [before.evaluations[0]!, before.evaluations[2]!];

      await service.removeIdea(id, removed.id);

      const root = before.artifactDir;
      const read = (file: string) => readFileSync(join(root, file), "utf8");
      const dados = JSON.parse(read("dados.json")) as { ideias: { nome: string }[] };
      expect(dados.ideias.map((i) => i.nome)).toEqual(kept.map((e) => e.name));
      expect(dados.ideias.map((i) => i.nome)).not.toContain(removed.name);
      for (const file of ["00-tabelao.md", "00-tabelao.csv", "README.md"]) {
        expect(read(file)).not.toContain(removed.name);
        for (const idea of kept) expect(read(file)).toContain(idea.name);
      }
    } finally {
      db.sqlite.close();
    }
  });

  test("lança NotFoundError para id de ideia inexistente e não toca no disco", async () => {
    const { service, db, id } = await completedStudy(3);
    try {
      const before = await service.get(id);
      const snapshot = ideaFolders(before.artifactDir);

      await expect(service.removeIdea(id, "id-que-nao-existe")).rejects.toBeInstanceOf(NotFoundError);
      expect(ideaFolders(before.artifactDir)).toEqual(snapshot);
      expect((await service.get(id)).evaluations).toHaveLength(3);
    } finally {
      db.sqlite.close();
    }
  });

  test("lança ConflictError enquanto o estudo roda e não toca no disco", async () => {
    withCredentials();
    const db = openMigratedDatabase(":memory:");
    const dir = tempDir("goodbizz-remove-busy-");
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    // Segura a primeira chamada sem invalidar o pipeline: o mock ainda responde por tras do gate.
    const inner = new LlmMock();
    const blockingLlm = {
      generateText: async (system: string, user: string) => {
        await gate;
        return inner.generateText(system, user);
      },
    };
    const service = new StudyService({
      repo: new SqliteStudyRepository(db.db),
      cache: new StudyCache(new SqliteCacheStore(db.db)),
      llm: blockingLlm,
      decider: new DeciderMock(),
      logger: silentLogger(),
      artifactsRoot: dir,
    });
    try {
      const record = await service.create(
        resolveStudyConfig({ niche: "clinicas", numIdeas: 2, mock: true, outputDir: dir }),
      );
      const running = service.run(record.id);
      // Espera o pipeline marcar o estudo como em execucao antes de tentar remover.
      for (let attempt = 0; attempt < 200; attempt += 1) {
        if ((await service.get(record.id)).progress.state === "running") break;
        await Bun.sleep(5);
      }

      await expect(service.removeIdea(record.id, "qualquer")).rejects.toBeInstanceOf(ConflictError);
      release();
      await running;
    } finally {
      db.sqlite.close();
    }
  });

  test("nomes iguais: remove so a escolhida e preserva a outra", async () => {
    const { service, repo, db, id } = await completedStudy(3);
    try {
      const before = await service.get(id);
      const [first, second, third] = before.evaluations as [
        (typeof before.evaluations)[number],
        (typeof before.evaluations)[number],
        (typeof before.evaluations)[number],
      ];
      // Gemea: mesmo nome, id novo. E o par que so a remocao por id distingue.
      const twin = { ...first!, id: "id-gemeo" };
      await repo.saveEvaluations(id, [twin, first!, third!], (await service.get(id)).summary);
      // As duas ocupam 01 e 02 com o mesmo slug; a gêmea precisa de pasta propria.
      const slugA = folderName(1, first!.name);
      const twinDoc = readFileSync(join(before.artifactDir, slugA, "README.md"), "utf8");
      mkdirSync(join(before.artifactDir, folderName(2, first!.name)), { recursive: true });
      writeFileSync(join(before.artifactDir, folderName(2, first!.name), "README.md"), twinDoc, "utf8");

      const after = await service.removeIdea(id, first!.id);

      expect(after.evaluations.map((e) => e.id)).toEqual(["id-gemeo", third!.id]);
      // A pasta da gêmea sobrevive com o documento: apagar por nome teria levar as duas.
      expect(existsSync(join(before.artifactDir, folderName(1, first!.name)))).toBe(true);
      expect(readFileSync(join(before.artifactDir, folderName(1, first!.name), "README.md"), "utf8")).toBe(
        twinDoc,
      );
      // E a da removida sumiu, sem orfao com o mesmo slug.
      expect(existsSync(join(before.artifactDir, folderName(2, first!.name)))).toBe(false);
      expect(ideaFolders(before.artifactDir)).toEqual([
        folderName(1, first!.name),
        folderName(2, third!.name),
      ]);
      void second;
    } finally {
      db.sqlite.close();
    }
  });
});

describe("adicao de ideias por quantidade", () => {
  /** Estudo concluido e servico pronto, contando chamadas de LLM. */
  async function studyReadyToGrow(numIdeas: number) {
    withCredentials();
    const db = openMigratedDatabase(":memory:");
    const dir = tempDir("goodbizz-add-");
    const repo = new SqliteStudyRepository(db.db);
    const state = { llmCalls: 0 };
    const inner = new LlmMock();
    const countingLlm = {
      generateText: async (system: string, user: string) => {
        state.llmCalls += 1;
        return inner.generateText(system, user);
      },
    };
    const service = new StudyService({
      repo,
      cache: new StudyCache(new SqliteCacheStore(db.db)),
      llm: countingLlm,
      decider: new DeciderMock(),
      logger: silentLogger(),
      artifactsRoot: dir,
    });
    const cfg = resolveStudyConfig({ niche: "clinicas", numIdeas, mock: true, outputDir: dir });
    const record = await service.create(cfg);
    await service.run(record.id);
    return { service, repo, db, dir, id: record.id, state };
  }

  test("acrescenta 5 ideias e preserva as 3 antigas com seus documentos", async () => {
    const { service, db, id } = await studyReadyToGrow(3);
    try {
      const before = await service.get(id);
      const oldIds = before.evaluations.map((e) => e.id);
      const oldNames = before.evaluations.map((e) => e.name);
      // `evaluations` vem no rank gravado, entao a posicao e o numero da pasta.
      const oldDocs = before.evaluations.map((idea, position) =>
        readFileSync(join(before.artifactDir, folderName(position + 1, idea.name), "README.md"), "utf8"),
      );

      const after = await service.addIdeas(id, 5);

      expect(after.evaluations).toHaveLength(8);
      expect(oldDocs.every((text) => text.trim().length > 0)).toBe(true);
      // Adicionar re-ranqueia o conjunto, entao a posicao antiga nao sobrevive; o id e o nome sim.
      // Nenhum id antigo foi redefinido pelas novas: sao 8 distintos.
      expect(new Set(after.evaluations.map((e) => e.id)).size).toBe(8);
      const byId = new Map(after.evaluations.map((e) => [e.id, e]));
      before.evaluations.forEach((old, position) => {
        const still = byId.get(old.id);
        expect(still?.name).toBe(old.name);
        // O documento antigo continua na pasta que o rank novo deu a ideia.
        const moved = after.evaluations.findIndex((e) => e.id === old.id);
        expect(moved).toBeGreaterThanOrEqual(0);
        expect(
          readFileSync(join(before.artifactDir, folderName(moved + 1, old.name), "README.md"), "utf8").trim()
            .length,
        ).toBeGreaterThan(0);
        void position;
      });
      expect(after.evaluations.map((e) => e.name)).toEqual(expect.arrayContaining(oldNames));
      expect(oldIds).toHaveLength(3);
      expect(after.summary?.ordered).toHaveLength(8);
    } finally {
      db.sqlite.close();
    }
  });

  test("uma pasta por ideia, com o indice novo, e nenhum orfao", async () => {
    const { service, db, id } = await studyReadyToGrow(3);
    try {
      const before = await service.get(id);
      expect(ideaFolders(before.artifactDir)).toHaveLength(3);

      const after = await service.addIdeas(id, 5);

      const folders = ideaFolders(before.artifactDir);
      expect(folders).toHaveLength(8);
      expect(folders.map((f) => f.slice(0, 2))).toEqual(["01", "02", "03", "04", "05", "06", "07", "08"]);
      // O ranking persistido e a numeração das pastas contam a mesma história.
      const names = after.summary!.ordered.map((e) => e.name);
      expect(folders).toEqual(names.map((name, position) => folderName(position + 1, name)));
      for (const folder of folders) {
        expect(existsSync(join(before.artifactDir, folder, "README.md"))).toBe(true);
      }
    } finally {
      db.sqlite.close();
    }
  });

  test("recusa com ValidationError antes de qualquer chamada de LLM", async () => {
    const { service, db, id, state } = await studyReadyToGrow(3);
    try {
      for (const count of [0, -1, 1.5, Number.NaN]) {
        const before = state.llmCalls;
        await expect(service.addIdeas(id, count)).rejects.toBeInstanceOf(ValidationError);
        expect(state.llmCalls).toBe(before);
      }
    } finally {
      db.sqlite.close();
    }
  });

  test("recusa acima do teto de 40 ideias antes de qualquer chamada de LLM", async () => {
    const { service, db, id, state } = await studyReadyToGrow(3);
    try {
      const before = state.llmCalls;
      // 3 existentes + 38 novas = 41, uma acima do teto planejado.
      await expect(service.addIdeas(id, 38)).rejects.toBeInstanceOf(ValidationError);
      expect(state.llmCalls).toBe(before);
      expect((await service.get(id)).evaluations).toHaveLength(3);
    } finally {
      db.sqlite.close();
    }
  });

  test("lança ConflictError enquanto o estudo roda", async () => {
    withCredentials();
    const db = openMigratedDatabase(":memory:");
    const dir = tempDir("goodbizz-add-busy-");
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inner = new LlmMock();
    const blockingLlm = {
      generateText: async (system: string, user: string) => {
        await gate;
        return inner.generateText(system, user);
      },
    };
    const service = new StudyService({
      repo: new SqliteStudyRepository(db.db),
      cache: new StudyCache(new SqliteCacheStore(db.db)),
      llm: blockingLlm,
      decider: new DeciderMock(),
      logger: silentLogger(),
      artifactsRoot: dir,
    });
    try {
      const record = await service.create(
        resolveStudyConfig({ niche: "clinicas", numIdeas: 2, mock: true, outputDir: dir }),
      );
      const running = service.run(record.id);
      for (let attempt = 0; attempt < 200; attempt += 1) {
        if ((await service.get(record.id)).progress.state === "running") break;
        await Bun.sleep(5);
      }

      // Sincrono de proposito: a rota de API precisa do 409 na chamada, e nao de uma promessa
      // rejeitada que ela teria que distinguir de um 201.
      expect(() => service.addIdeas(record.id, 2)).toThrow(ConflictError);
      release();
      await running;
    } finally {
      db.sqlite.close();
    }
  });

  test("os agregados passam a descrever as 8 ideias", async () => {
    const { service, db, id } = await studyReadyToGrow(3);
    try {
      const before = await service.get(id);
      await service.addIdeas(id, 5);

      const read = (file: string) => readFileSync(join(before.artifactDir, file), "utf8");
      const dados = JSON.parse(read("dados.json")) as { config: { n_ideias: number }; ideias: unknown[] };
      expect(dados.ideias).toHaveLength(8);
      expect(dados.config.n_ideias).toBe(8);
      for (const name of (await service.get(id)).evaluations.map((e) => e.name)) {
        expect(read("00-tabelao.md")).toContain(name);
      }
    } finally {
      db.sqlite.close();
    }
  });
});
