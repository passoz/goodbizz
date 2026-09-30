/**
 * Traduz falhas do pipeline em texto que o operador entende — o que aconteceu e o que fazer.
 *
 * O erro cru do provedor (ex.: `[429]: {"error":...}`) não sai sozinho: ele entra entre parênteses no
 * fim, para depuração. Nada aqui inclui credencial (o texto passa por `scrub` antes).
 */
import { scrub } from "../config/redact.ts";

/** Frase humana + ação; `detail` mantém o erro original para depuração. */
export function explainFailure(error: unknown): string {
  const raw = scrub(error instanceof Error ? error.message : String(error));
  const detail = raw.length > 0 ? ` (detalhe: ${raw.slice(0, 300)})` : "";

  if (/\b429\b|rate.?limit|too many requests|quota/i.test(raw)) {
    return (
      "O provedor de IA recusou por limite de uso (429 / cota). Isso passa sozinho: espere alguns " +
      "minutos e execute o estudo de novo. O que já foi gerado continua em disco." +
      detail
    );
  }
  if (/\b401\b|\b403\b|unauthorized|invalid api key|forbidden/i.test(raw)) {
    return (
      "O provedor de IA recusou a credencial (401/403). Confira a chave configurada " +
      "(LLM_API_KEY / DECISION_API_KEY) e se ela tem permissão para o modelo escolhido." +
      detail
    );
  }
  if (
    /EAI_AGAIN|ENOTFOUND|ECONNREFUSED|ECONNRESET|fetch failed|unable to connect|connection refused|socket hang up|timed? ?out|timeout/i.test(
      raw,
    )
  ) {
    return (
      "Não foi possível falar com o provedor de IA (rede ou DNS). Nada foi cobrado por esta " +
      "tentativa; verifique se o serviço está no ar e execute o estudo de novo." +
      detail
    );
  }
  if (/\b50[0-9]\b|bad gateway|service unavailable|internal server error/i.test(raw)) {
    return "O provedor de IA devolveu erro interno (5xx). Tente de novo em alguns minutos." + detail;
  }
  if (/no active credentials|no credentials for provider/i.test(raw)) {
    return (
      "O modelo escolhido não tem credencial ativa no roteador de IA. Conecte o provedor no " +
      "dashboard do 9router (ou troque LLM_API_MODEL/DECISION_API_MODEL)." +
      detail
    );
  }
  if (/documento|section\(s\) missing|document too short/i.test(raw)) {
    return (
      "O texto devolvido pelo modelo não cumpriu o contrato do documento (seções obrigatórias ou " +
      "tamanho). Execute de novo — a próxima geração costuma sair dentro do padrão." +
      detail
    );
  }
  return `O estudo falhou: ${raw.length > 0 ? raw : "motivo não informado pelo provedor"}.`;
}
