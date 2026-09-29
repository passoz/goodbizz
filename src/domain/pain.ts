/**
 * Pain probe catalogue and classification thresholds.
 *
 * Ported verbatim from the Python baseline (`goodbizz/algorithm.py`): the thresholds were
 * calibrated over 17 real cases and must not drift.
 */
import type { InternalProbe, StrongProbe } from "./types.ts";

/** >= this and dominant -> FORTE. */
export const STRONG_THRESHOLD = 0.65;
/** >= this and dominant -> FRACA. */
export const WEAK_THRESHOLD = 0.5;
/** Deviation between paraphrases above this -> INSTAVEL. */
export const UNSTABLE_THRESHOLD = 0.15;
/** Fewer paraphrases than this is unreliable. */
export const MIN_PARAPHRASES = 3;

export const STRONG_PROBES: readonly StrongProbe[] = ["dinheiro", "reputacao"];
export const INTERNAL_PROBES: readonly InternalProbe[] = ["processo", "tecnologia"];

/** Four atomic probes, each asked in three independent paraphrases. */
export const PAIN_PROBES: Record<string, Record<string, string>> = {
  v1: {
    dinheiro:
      "Se o dono NÃO tiver essa solução, ele perde dinheiro que entraria hoje " +
      "(ex.: venda perdida, cliente que desiste, cobrança que não acontece)?",
    reputacao:
      "Se o dono NÃO tiver essa solução, ele fica mal falado publicamente " +
      "(ex.: avaliação ruim no Google/TripAdvisor, cliente reclamando para outros)?",
    processo:
      "Essa solução serve principalmente para organizar processos internos ou economizar " +
      "tempo da equipe, sem impacto direto e imediato em vendas ou reputação?",
    tecnologia:
      "Essa solução é basicamente 'modernização tecnológica' (ter app, ter IA, ter site bonito) " +
      "que o dono compra por vaidade ou porque os outros têm, e não por dor concreta?",
  },
  v2: {
    dinheiro: "A falta dessa solução causa sangria financeira visível no caixa do negócio esta semana?",
    reputacao: "A falta dessa solução queima o nome do negócio com clientes a ponto de virar queixa pública?",
    processo:
      "O benefício principal é eficiência operacional interna (menos retrabalho, equipe mais organizada)?",
    tecnologia:
      "O apelo principal é tecnológico/inovação ('ter inteligência artificial', 'automatizar tudo') " +
      "mais do que resolver um prejuízo palpável?",
  },
  v3: {
    dinheiro: "O dono do negócio sente no bolso, em reais, todo mês que não usa uma solução como essa?",
    reputacao:
      "Um cliente insatisfeito por causa desse problema provavelmente deixará uma nota ruim ou fará propaganda negativa?",
    processo:
      "Essa solução é um 'nice to have' de gestão interna que a operação consegue empurrar com a barriga se o orçamento apertar?",
    tecnologia:
      "Essa ideia parece mais uma solução procurando um problema do que a resposta a uma dor que tira o sono do dono?",
  },
};

/** Default market context used when the caller does not pass one. */
export const DEFAULT_CONTEXT =
  "Contexto do mercado: pousadas de até 20 quartos, hotéis boutique, hostels e " +
  "pequenos meios de hospedagem no Brasil. Donos operacionais, sem equipe de TI, " +
  "orçamento curto, atendem no balcão e no WhatsApp.";

export const DEFAULT_VARIANTS: readonly string[] = ["v1", "v2", "v3"];

/** Question ids sent to the decider for one paraphrase: p_dinheiro, p_reputacao, ... */
export function probeQuestions(variant: string): Record<string, string> {
  const probes = PAIN_PROBES[variant];
  if (!probes) throw new Error(`unknown paraphrase variant: ${variant}`);
  const questions: Record<string, string> = {};
  for (const [key, text] of Object.entries(probes)) {
    questions[`p_${key}`] = text;
  }
  return questions;
}
