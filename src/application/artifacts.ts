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
