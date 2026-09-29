/**
 * Monta a arvore de artefatos de um estudo em memoria (o ArtifactStore grava depois).
 * Conteudo 100% deterministico: nenhum LLM entra aqui.
 */
import type { ArtifactFile } from "../domain/ports.ts";
import type { IdeaEvaluation, StudyConfig, StudySummary } from "../domain/types.ts";
import { serializeDados } from "./dados.ts";
import { indexMarkdown, indicatorsTableCsv, indicatorsTableMarkdown, scopeNotice } from "./reports.ts";

export interface ArtifactPlan {
  files: ArtifactFile[];
  folders: Record<string, string>;
}

/**
 * Arquivos do estudo: brief, tabelao (md/csv), indice, dados.json e o README de cada ideia.
 * @param folders nome da ideia -> pasta (`01-slug`).
 * @param documents nome da ideia -> markdown ja gerado; ideia sem documento nao vira pasta.
 */
export function buildArtifactFiles(
  cfg: StudyConfig,
  brief: string,
  summary: StudySummary,
  data: IdeaEvaluation[],
  folders: Record<string, string>,
  documents: Record<string, string>,
): ArtifactFile[] {
  const files: ArtifactFile[] = [
    {
      path: "00-brief.md",
      content: `# Brief de contexto — ${cfg.niche}\n\n${scopeNotice(cfg)}\n${brief.trim()}\n`,
    },
    { path: "00-tabelao.md", content: indicatorsTableMarkdown(cfg, data) },
    { path: "00-tabelao.csv", content: indicatorsTableCsv(data) },
  ];
  if (Object.keys(folders).length > 0) {
    files.push({ path: "README.md", content: indexMarkdown(cfg, brief, summary, folders) });
  }
  files.push({ path: "dados.json", content: serializeDados(cfg, brief, summary, data) });
  for (const [name, folder] of Object.entries(folders)) {
    const document = documents[name];
    if (document !== undefined && document.trim() !== "") {
      files.push({ path: `${folder}/README.md`, content: document });
    }
  }
  return files;
}

// ── Empacotamento ───────────────────────────────────────────────────────────
// ZIP proprio porque nem todo runtime tem um: `Bun.Archive` escreve tar/ustar, nao zip. Sao ~90
// linhas de formato publico (PKZIP), sem dependencia, e o resultado e verificavel por qualquer
// extrator do sistema.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Data/hora no formato DOS usado pelo ZIP (2s de resolucao, a partir de 1980). */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export interface ZipEntry {
  /** Caminho relativo, com barra normal. */
  path: string;
  /** Bytes do arquivo. O tipo estreito evita cast no `Bun.deflateSync`. */
  data: Uint8Array<ArrayBuffer>;
}

/**
 * Empacota entradas em um ZIP (deflate, com fallback para "store" quando comprimir piora).
 * Puro: mesma entrada e mesma data -> mesmos bytes.
 */
export function buildZip(
  entries: readonly ZipEntry[],
  modifiedAt: Date = new Date(),
): Uint8Array<ArrayBuffer> {
  const { time, date } = dosDateTime(modifiedAt);
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  const write = (target: Uint8Array[], bytes: Uint8Array): void => {
    target.push(bytes);
  };
  const u16 = (value: number): Uint8Array => {
    const out = new Uint8Array(2);
    new DataView(out.buffer).setUint16(0, value & 0xffff, true);
    return out;
  };
  const u32 = (value: number): Uint8Array => {
    const out = new Uint8Array(4);
    new DataView(out.buffer).setUint32(0, value >>> 0, true);
    return out;
  };

  for (const entry of entries) {
    const name = new TextEncoder().encode(entry.path.replace(/^\/+/, ""));
    const crc = crc32(entry.data);
    const deflated = Bun.deflateSync(entry.data, { library: "zlib", level: 6 }) as Uint8Array;
    const useDeflate = deflated.length < entry.data.length;
    const payload = useDeflate ? deflated : entry.data;
    const method = useDeflate ? 8 : 0;

    write(chunks, u32(0x04034b50));
    write(chunks, u16(20));
    write(chunks, u16(0x0800)); // nomes em UTF-8
    write(chunks, u16(method));
    write(chunks, u16(time));
    write(chunks, u16(date));
    write(chunks, u32(crc));
    write(chunks, u32(payload.length));
    write(chunks, u32(entry.data.length));
    write(chunks, u16(name.length));
    write(chunks, u16(0));
    write(chunks, name);
    write(chunks, payload);

    write(central, u32(0x02014b50));
    write(central, u16(20));
    write(central, u16(20));
    write(central, u16(0x0800));
    write(central, u16(method));
    write(central, u16(time));
    write(central, u16(date));
    write(central, u32(crc));
    write(central, u32(payload.length));
    write(central, u32(entry.data.length));
    write(central, u16(name.length));
    write(central, u16(0));
    write(central, u16(0));
    write(central, u16(0));
    write(central, u16(0));
    write(central, u32(0));
    write(central, u32(offset));
    write(central, name);

    offset += 30 + name.length + payload.length;
  }

  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const trailer: Uint8Array[] = [
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralSize),
    u32(offset),
    u16(0),
  ];

  const all = [...chunks, ...central, ...trailer];
  const total = all.reduce((sum, part) => sum + part.length, 0);
  const zip = new Uint8Array(total);
  let cursor = 0;
  for (const part of all) {
    zip.set(part, cursor);
    cursor += part.length;
  }
  return zip;
}
