/**
 * Unified CLI (`goodbizz`).
 *
 * Ports the three Python entrypoints (`generate_study.py`, `diagnose.py`, `recalibrate.py`)
 * behind one subcommand dispatcher, plus `serve` (boots the HTTP service) and `help`.
 * Exit codes: 0 ok, 1 failed run / fewer than three usable probes, 2 bad configuration or
 * unknown subcommand, 130 interrupted.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { StudyCache } from "./application/cache.ts";
import { DEFAULT_THRESHOLD, diagnoseExitCode, diagnoseProbes } from "./application/diagnose.ts";
import { generateStudy, type GenerateStudyResult } from "./application/generate-study.ts";
import { parseIdeas } from "./application/generation.ts";
import { htmlToPdf } from "./application/pdf.ts";
import { DEFAULT_CUTOFF, formatRecalibrateReport, recalibrate } from "./application/recalibrate.ts";
import { createLogger, resolveStudyConfig, studyContext } from "./config/runtime.ts";
import { loadEnv } from "./config/env.ts";
import { scrub } from "./config/redact.ts";
import { ArtifactError, ConfigError, ValidationError } from "./domain/errors.ts";
import { createDeciderClient } from "./infrastructure/decider.ts";
import { openMigratedDatabase } from "./infrastructure/db.ts";
import { SqliteSettingsRepository } from "./infrastructure/settings-repository.ts";
import { SqliteCacheStore } from "./infrastructure/cache-repository.ts";
import { createLlmClient } from "./infrastructure/llm.ts";
import { startService } from "./index.ts";
import type { ArtifactFile } from "./domain/ports.ts";
import type { ProviderSettings, StudyConfig } from "./domain/types.ts";

/** Migrations ship next to the sources (`drizzle/`) and are resolved from the module, not the cwd. */
const MIGRATIONS_DIR = fileURLToPath(new URL("../drizzle", import.meta.url));

type Command = "generate" | "diagnose" | "recalibrate" | "serve" | "help";

/** Subcommand and flag aliases, normalized to a canonical name. */
const COMMANDS: Record<string, Command> = {
  generate: "generate",
  gerar: "generate",
  study: "generate",
  estudo: "generate",
  diagnose: "diagnose",
  diagnosticar: "diagnose",
  recalibrate: "recalibrate",
  recalibrar: "recalibrate",
  serve: "serve",
  servico: "serve",
  server: "serve",
  help: "help",
  ajuda: "help",
  "-h": "help",
  "--help": "help",
};

interface FlagSpec {
  aliases: string[];
  boolean?: boolean;
}

type CommandSpec = Record<string, FlagSpec>;

interface ParsedArgs {
  values: Record<string, string>;
  flags: Set<string>;
  positionals: string[];
}

/** Parse `--flag value`, `--flag=value`, boolean flags and positionals against a command spec. */
function parseArgs(argv: string[], spec: CommandSpec): ParsedArgs {
  const aliases = new Map<string, string>();
  for (const [canonical, definition] of Object.entries(spec)) {
    aliases.set(canonical, canonical);
    for (const alias of definition.aliases) aliases.set(alias, canonical);
  }

  const values: Record<string, string> = {};
  const flags = new Set<string>();
  const positionals: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (!arg.startsWith("-") || arg === "-") {
      positionals.push(arg);
      continue;
    }
    const separator = arg.indexOf("=");
    const name = separator >= 0 ? arg.slice(0, separator) : arg;
    const inline = separator >= 0 ? arg.slice(separator + 1) : undefined;
    const canonical = aliases.get(name);
    if (canonical === undefined) {
      throw new ConfigError(`opcao desconhecida: ${name}`);
    }
    const definition = spec[canonical] as FlagSpec;
    if (definition.boolean === true) {
      if (inline !== undefined && inline !== "true" && inline !== "1") {
        throw new ConfigError(`opcao booleana nao aceita valor: ${name}`);
      }
      flags.add(canonical);
      continue;
    }
    if (inline !== undefined) {
      values[canonical] = inline;
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || (next.length > 1 && next.startsWith("-"))) {
      throw new ConfigError(`opcao ${name} exige um valor`);
    }
    values[canonical] = next;
    index += 1;
  }

  return { values, flags, positionals };
}

function parseIntFlag(values: Record<string, string>, name: string, fallback: number): number {
  const raw = values[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) throw new ConfigError(`valor invalido para --${name}: ${raw}`);
  return parsed;
}

function parseFloatFlag(values: Record<string, string>, name: string, fallback: number): number {
  const raw = values[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) throw new ConfigError(`valor invalido para --${name}: ${raw}`);
  return parsed;
}

/** Reject artifact paths that would escape the output directory. */
function resolveArtifactPath(root: string, relativePath: string): string {
  const base = resolve(root);
  const target = resolve(base, relativePath);
  const inside = relative(base, target);
  if (inside.startsWith("..") || isAbsolute(inside) || inside === "") {
    throw new ArtifactError(`caminho de artefato fora da saida: ${relativePath}`);
  }
  return target;
}

function writeArtifact(root: string, file: ArtifactFile): void {
  const target = resolveArtifactPath(root, file.path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, file.content);
}

function packageVersion(): string {
  try {
    const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function wantsHelp(argv: readonly string[]): boolean {
  return argv.includes("-h") || argv.includes("--help");
}

const GENERATE_SPEC: CommandSpec = {
  niche: { aliases: ["--niche", "--nicho"] },
  description: { aliases: ["--description", "--descricao"] },
  city: { aliases: ["--city", "--cidade"] },
  ticket: { aliases: ["--ticket"] },
  ideas: { aliases: ["--ideas", "--ideias"] },
  output: { aliases: ["--output", "--output-dir", "--saida"] },
  "ideas-file": { aliases: ["--ideas-file", "--ideias-arquivo"] },
  "pain-method": { aliases: ["--pain-method", "--metodo-dor"] },
  "eval-only": { aliases: ["--eval-only", "--so-avaliar"], boolean: true },
  mock: { aliases: ["--mock"], boolean: true },
  "mock-llm": { aliases: ["--mock-llm"], boolean: true },
  "mock-decider": { aliases: ["--mock-decider", "--mock-decisor"], boolean: true },
  pdf: { aliases: ["--pdf"], boolean: true },
  concurrency: { aliases: ["--concurrency", "--paralelo"] },
  timeout: { aliases: ["--timeout"] },
  "llm-url": { aliases: ["--llm-url"] },
  "llm-model": { aliases: ["--llm-model"] },
  "llm-key": { aliases: ["--llm-key"] },
  "decider-url": { aliases: ["--decider-url", "--decisor-url"] },
  "decider-model": { aliases: ["--decider-model", "--decisor-model"] },
  "decider-key": { aliases: ["--decider-key", "--decisor-key"] },
};

const DIAGNOSE_SPEC: CommandSpec = {
  ideas: { aliases: ["--ideas", "--ideias"] },
  niche: { aliases: ["--niche", "--nicho"] },
  city: { aliases: ["--city", "--cidade"] },
  threshold: { aliases: ["--threshold", "--limiar"] },
  "decider-url": { aliases: ["--decider-url", "--decisor-url"] },
  "decider-model": { aliases: ["--decider-model", "--decisor-model"] },
  "decider-key": { aliases: ["--decider-key", "--decisor-key"] },
  mock: { aliases: ["--mock"], boolean: true },
};

const RECALIBRATE_SPEC: CommandSpec = {
  cutoff: { aliases: ["--cutoff", "--corte"] },
};

function printGenerateHelp(): void {
  console.log(`Uso: goodbizz generate <nicho> [opções]

Gera um estudo completo de nicho (brief, ideias, avaliação, documentos e relatórios).

Argumentos:
  nicho                              o titulo do estudo, ate 50 caracteres (equivale a --niche)

Opcoes:
  --niche, --nicho <texto>           o titulo do estudo; vira o cabecalho, entao vale o limite de
                                     50 caracteres e cada palavra e capitalizada
  --description, --descricao <texto> contexto do estudo; entra concatenado ao titulo nos prompts
  --city, --cidade <texto>           cidade ou região alvo
  --ticket <inteiro>                 ticket mensal em BRL (padrão: 300)
  --ideas, --ideias <inteiro>        número de ideias a gerar (padrão: 8)
  --output, --output-dir, --saída <dir>  diretorio de saída (padrão: estudo)
  --ideas-file, --ideias-arquivo <arquivo>  JSON com ideias (pula a geração por LLM)
  --pain-method, --metodo-dor <choice|escolha|noul>  método de medição de dor (padrão: choice)
  --eval-only, --so-avaliar          para depois da avaliação (coleta dados para calibração)
  --mock                             roda offline com LLM e decisor simulados
  --mock-llm                         simula apenas o LLM (usa o decisor real)
  --mock-decider, --mock-decisor     simula apenas o decisor (usa o LLM real)
  --pdf                              compila um PDF único do estudo
  --concurrency, --paralelo <inteiro>  chamadas concorrentes (padrão: 8)
  --timeout <segundos>               timeout por chamada (padrão: GOODBIZZ_LLM_TIMEOUT, 300)
  --llm-url <url>                    URL base compatível com OpenAI
  --llm-model <modelo>               modelo do LLM
  --llm-key <chave>                  chave da API do LLM
  --decider-url, --decisor-url <url>  endpoint System One (Jev, Laya, local, etc.)
  --decider-model, --decisor-model <modelo>  modelo do decisor
  --decider-key, --decisor-key <chave>  chave do decisor
  -h, --help                         mostra esta ajuda`);
}

function printDiagnoseHelp(): void {
  console.log(`Uso: goodbizz diagnose --ideas <arquivo.json> [opções]

Mede a coerência das sondas de dor antes de recalibrar limiares: consistencia
(afirmacao+negacao perto de 1.00) e estabilidade entre paráfrases.

Opcoes:
  --ideas, --ideias <arquivo>        JSON com 5 a 10 ideias (obrigatório)
  --niche, --nicho <texto>           o nicho (padrão: o nicho em uma frase)
  --city, --cidade <texto>           cidade ou região alvo
  --threshold, --limiar <número>     soma afirmação+negação acima disso = contraditória (padrão: 1.20)
  --decider-url, --decisor-url <url>  endpoint System One (Jev, Laya, local, etc.)
  --decider-model, --decisor-model <modelo>  modelo do decisor
  --decider-key, --decisor-key <chave>  chave do decisor
  --mock                             simula o decisor com respostas deterministicas
  -h, --help                         mostra esta ajuda`);
}

function printRecalibrateHelp(): void {
  console.log(`Uso: goodbizz recalibrate <dados.json...> [opções]

Recalibra os limiares do classificador de dor contra um conjunto de casos rotulados.

Argumentos:
  dados.json...                      um ou mais arquivos dados.json de execucoes anteriores

Opcoes:
  --cutoff, --corte <número>         venda >= cutoff conta como dor real (padrão: 1.40)
  -h, --help                         mostra esta ajuda`);
}

function printServeHelp(): void {
  console.log(`Uso: goodbizz serve

Sobe o serviço HTTP (API, interface web e rotas de saude) ouvindo em PORT.
A configuração vem do ambiente; encerra de forma graciosa em SIGTERM/SIGINT.

Opcoes:
  -h, --help                         mostra esta ajuda`);
}

function printGeneralHelp(print: (line: string) => void = (line) => console.log(line)): void {
  print("goodbizz — estudos de nicho, diagnostico de sondas e recalibração de limiares.");
  print("");
  print("Uso: goodbizz <comando> [opções]");
  print("");
  print("Comandos:");
  print("  generate, gerar, study, estudo   gera um estudo completo a partir do nicho");
  print("  diagnose, diagnosticar           mede a coerência das sondas de dor");
  print("  recalibrate, recalibrar          recalibra os limiares com dados rotulados");
  print("  serve, serviço, server           sobe o serviço HTTP");
  print("  help, ajuda                      mostra esta ajuda");
  print("");
  print("Opcoes globais:");
  print("  -v, --version                    mostra a versão");
  print("  -h, --help                       mostra a ajuda de um comando");
  print("");
  print('Use "goodbizz <comando> --help" para ver as flags de cada comando.');
}

function printSummary(cfg: StudyConfig, result: GenerateStudyResult): void {
  console.log(`\nPronto. Saida em ${cfg.outputDir}/`);
  for (const file of result.files) console.log(`  ${file.path}`);
  console.log(`  cache: ${result.cacheCount} respostas guardadas (${result.cacheHits} reaproveitadas)`);
  console.log(
    "\nComo ler: índice de ação 0 a 2 (maior e melhor; Tier A >= 1.84, B >= 1.60) | " +
      "dor FORTE >= 0.65 e dominante | desvio entre paráfrases menor e melhor (< 0.15) | " +
      "WTP e meta30 são probabilidades de 0 a 1 (maior e melhor) | ticket é teto, não piso.",
  );
  if (result.issues.length > 0) {
    console.log(`\n${result.issues.length} documento(s) com aviso:`);
    for (const issue of result.issues) console.log(`  - ${issue}`);
  }
  if (cfg.mockLlm || cfg.mockDecider) {
    const parts: string[] = [];
    if (cfg.mockLlm) parts.push("texto sintético (LLM simulado)");
    if (cfg.mockDecider) parts.push("números deterministicos (decisor simulado)");
    console.log(`\nAVISO: ${parts.join(" e ")}. Nao use esta saida como estudo real.`);
  }
}

/**
 * Configuração de provedores salva na aba /settings vale também para a CLI — mas só quando o banco
 * do serviço existe nesta máquina. A ordem é: flag explícita > settings > ambiente.
 */
async function loadProviderSettings(databaseUrl: string): Promise<ProviderSettings> {
  if (databaseUrl === ":memory:" || !existsSync(databaseUrl)) return {};
  try {
    const handle = openMigratedDatabase(databaseUrl, MIGRATIONS_DIR);
    try {
      return await new SqliteSettingsRepository(handle.db).get();
    } finally {
      handle.sqlite.close();
    }
  } catch (error) {
    // Silencioso de propósito: a CLI roda fora do serviço e um banco ausente é o caso normal.
    void error;
    return {};
  }
}

async function runGenerate(argv: string[]): Promise<number> {
  if (wantsHelp(argv)) {
    printGenerateHelp();
    return 0;
  }
  const { values, flags, positionals } = parseArgs(argv, GENERATE_SPEC);
  if (positionals.length > 1) {
    throw new ConfigError(`argumentos extras: ${positionals.slice(1).join(", ")}`);
  }
  const niche = (values["niche"] ?? positionals[0] ?? "").trim();
  const settings = await loadProviderSettings(loadEnv().DATABASE_URL);

  const cfg = resolveStudyConfig({
    niche,
    description: values["description"],
    city: values["city"],
    monthlyTicket: parseIntFlag(values, "ticket", 300),
    numIdeas: parseIntFlag(values, "ideas", 8),
    outputDir: values["output"] ?? "estudo",
    ideasFile: values["ideas-file"] ?? "",
    evaluateOnly: flags.has("eval-only"),
    painMethod: values["pain-method"] ?? "choice",
    mock: flags.has("mock"),
    mockLlm: flags.has("mock-llm"),
    mockDecider: flags.has("mock-decider"),
    pdf: flags.has("pdf"),
    concurrency: parseIntFlag(values, "concurrency", 8),
    timeout: parseFloatFlag(values, "timeout", 60),
    llmBaseUrl: values["llm-url"] ?? settings.llmBaseUrl,
    llmModel: values["llm-model"] ?? settings.llmModel,
    llmKey: values["llm-key"] ?? settings.llmApiKey,
    deciderUrl: values["decider-url"] ?? settings.deciderUrl,
    deciderModel: values["decider-model"] ?? settings.deciderModel,
    deciderKey: values["decider-key"] ?? settings.deciderApiKey,
  });

  mkdirSync(cfg.outputDir, { recursive: true });
  const handle = openMigratedDatabase(join(cfg.outputDir, ".cache.db"), MIGRATIONS_DIR);
  try {
    const cache = new StudyCache(new SqliteCacheStore(handle.db));
    console.log(`\nEstudo de nicho: ${cfg.niche}`);
    if (cfg.city) console.log(`Regiao: ${cfg.city}`);
    console.log(
      `Ticket: R$ ${cfg.monthlyTicket}/mes | ideias: ${cfg.numIdeas} | ` +
        `modo: ${cfg.mock ? "SIMULADO" : "real"}\n`,
    );

    const result = await generateStudy(cfg, {
      llm: createLlmClient(cfg),
      decider: createDeciderClient(cfg),
      cache,
      logger: createLogger("warn"),
      onProgress: (step) => console.log(`  ${step}`),
    });

    for (const file of result.files) writeArtifact(cfg.outputDir, file);

    if (cfg.pdf && result.files.some((file) => file.path === "estudo-completo.html")) {
      const outcome = await htmlToPdf(
        join(cfg.outputDir, "estudo-completo.html"),
        join(cfg.outputDir, "estudo-completo.pdf"),
      );
      console.log(`     pdf: ${scrub(outcome.message)}`);
    }

    printSummary(cfg, result);
    return 0;
  } finally {
    handle.sqlite.close();
  }
}

async function runDiagnose(argv: string[]): Promise<number> {
  if (wantsHelp(argv)) {
    printDiagnoseHelp();
    return 0;
  }
  const { values, flags } = parseArgs(argv, DIAGNOSE_SPEC);
  const ideasPath = values["ideas"];
  if (ideasPath === undefined) {
    throw new ConfigError("informe o arquivo de ideias (--ideas)");
  }
  const threshold = parseFloatFlag(values, "threshold", DEFAULT_THRESHOLD);

  let payload: unknown;
  try {
    payload = JSON.parse(readFileSync(ideasPath, "utf8"));
  } catch (error) {
    throw new ValidationError(`nao foi possivel ler ${ideasPath}: ${String(error)}`);
  }
  const ideas = parseIdeas(payload);

  const settings = await loadProviderSettings(loadEnv().DATABASE_URL);
  const cfg = resolveStudyConfig({
    niche: values["niche"] ?? "o nicho em uma frase",
    city: values["city"],
    mockLlm: true,
    mockDecider: flags.has("mock"),
    deciderUrl: values["decider-url"] ?? settings.deciderUrl,
    deciderModel: values["decider-model"] ?? settings.deciderModel,
    deciderKey: values["decider-key"] ?? settings.deciderApiKey,
  });

  const report = await diagnoseProbes(ideas, createDeciderClient(cfg), studyContext(cfg), threshold);

  console.log(`\n${ideas.length} ideias x ${report.variants} parafrases x ${report.probes.length} sondas\n`);
  console.log(
    `  ${"sonda".padEnd(12)}${"media".padStart(7)}${"desvio".padStart(8)}${"contradicao".padStart(13)}   veredito`,
  );
  console.log(`  ${"-".repeat(62)}`);
  for (const probe of report.probes) {
    console.log(
      `  ${probe.probe.padEnd(12)}${probe.mean.toFixed(2).padStart(7)}` +
        `${probe.deviation.toFixed(3).padStart(8)}${probe.contradiction.toFixed(2).padStart(13)}` +
        `   ${probe.verdict}`,
    );
  }
  console.log(`\nsondas utilizaveis: ${report.usable.length > 0 ? report.usable.join(", ") : "nenhuma"}`);
  console.log(
    `referência: soma afirmação+negação de 1.00 é coerência perfeita; ` +
      `acima de ${report.threshold} a sonda responde sim para as duas`,
  );
  for (const note of report.notes) console.log(`\n${note}`);

  return diagnoseExitCode(report);
}

async function runRecalibrate(argv: string[]): Promise<number> {
  if (wantsHelp(argv)) {
    printRecalibrateHelp();
    return 0;
  }
  const { values, positionals } = parseArgs(argv, RECALIBRATE_SPEC);
  if (positionals.length === 0) {
    throw new ConfigError("informe um ou mais arquivos dados.json");
  }
  const cutoff = parseFloatFlag(values, "cutoff", DEFAULT_CUTOFF);
  const payloads = positionals.map((path) => {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as unknown;
    } catch (error) {
      throw new ValidationError(`nao foi possivel ler ${path}: ${String(error)}`);
    }
  });

  const report = recalibrate(payloads, cutoff);
  console.log(
    `\nDataset: ${report.cases} labeled cases ` +
      `(${report.positives} selling, ${report.cases - report.positives} not selling)`,
  );
  if (report.ignored.length > 0) {
    console.log(`Dead zone: ${report.ignored.length} case(s) ignored`);
  }
  for (const warning of report.warnings) console.log(`\nWARNING: ${warning}`);

  const current = report.current;
  console.log(
    `\nThreshold currently in use (${current.strong}/${current.weak}/${current.unstable}): ` +
      `true strong=${current.tp} FALSE STRONG=${current.fp} true weak=${current.tn} escalate=${current.escalate}`,
  );
  console.log("\nBest threshold combinations (false STRONG first, then accuracy, then escalation):");
  console.log(formatRecalibrateReport(report));

  const best = report.best;
  console.log(
    `\nRecommended: STRONG_THRESHOLD=${best.strong}  WEAK_THRESHOLD=${best.weak}  UNSTABLE_THRESHOLD=${best.unstable}`,
  );
  console.log(
    `  true strong=${best.tp}  FALSE STRONG=${best.fp}  true weak=${best.tn}  ` +
      `false weak=${best.fn}  escalate=${best.escalate}`,
  );
  console.log("\nTo apply, update the thresholds in src/domain/pain.ts:");
  console.log(
    `    STRONG_THRESHOLD = ${best.strong}\n    WEAK_THRESHOLD = ${best.weak}\n    UNSTABLE_THRESHOLD = ${best.unstable}`,
  );
  return 0;
}

async function runServe(argv: string[]): Promise<number> {
  if (wantsHelp(argv)) {
    printServeHelp();
    return 0;
  }
  try {
    void startService();
  } catch (error) {
    return reportError(error);
  }
  // The service owns its own SIGTERM/SIGINT handlers and shuts down gracefully.
  return await new Promise<number>(() => {});
}

function reportError(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error);
  console.error(scrub(message));
  if (error instanceof ConfigError || error instanceof ValidationError) return 2;
  return 1;
}

/** Run `work`, but resolve 130 as soon as SIGINT arrives. */
async function runWithInterrupt(work: () => Promise<number>): Promise<number> {
  let handler!: () => void;
  const interrupt = new Promise<number>((resolve) => {
    handler = () => resolve(130);
    process.once("SIGINT", handler);
  });
  try {
    return await Promise.race([work(), interrupt]);
  } finally {
    process.off("SIGINT", handler);
  }
}

export async function main(argv: string[]): Promise<number> {
  const first = argv[0];
  if (first === "-v" || first === "--version") {
    console.log(packageVersion());
    return 0;
  }

  const command = first === undefined ? "help" : COMMANDS[first];
  if (command === undefined) {
    printGeneralHelp((line) => console.error(line));
    return 2;
  }

  const rest = argv.slice(1);
  if (command === "serve") return runServe(rest);

  return runWithInterrupt(async () => {
    try {
      if (command === "help") {
        printGeneralHelp();
        return 0;
      }
      if (command === "generate") return await runGenerate(rest);
      if (command === "diagnose") return await runDiagnose(rest);
      return await runRecalibrate(rest);
    } catch (error) {
      return reportError(error);
    }
  });
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2)));
}
