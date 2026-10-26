/**
 * Conta do retorno (FR-002, FR-003): o LLM declara as premissas, o código faz a conta.
 * Módulo puro e determinístico: mesma entrada, mesmos números — sem chamada a provedor.
 */

export interface ValueInput {
  /** Fatores da perda mensal (2 a 4, positivos); a perda é o produto deles. */
  factors: readonly number[];
  /** Fração da perda que vira ganho (0 a 1). */
  recovery: number;
  /** Taxa de implantação cobrada uma vez (inteiro de 0 a 100000). */
  setupFee: number;
  /** Mensalidade do estudo. */
  monthlyTicket: number;
}

export interface ValueResult {
  /** Perda mensal do dono hoje (produto dos fatores). */
  perdaMes: number;
  /** Ganho mensal recuperado (perda vezes recuperação). */
  ganhoMes: number;
  /** Saldo mensal (ganho menos mensalidade). */
  saldoMes: number;
  /** Meses para o setup se pagar, com 2 casas; nulo quando o saldo é menor ou igual a zero. */
  paybackMeses: number | null;
  /** Ganho de 12 meses menos o setup menos 12 mensalidades. */
  retorno12m: number;
}

/**
 * Calcula a conta do retorno a partir das premissas validadas.
 * A perda é o produto dos fatores, o ganho é a perda vezes a recuperação, o saldo é o
 * ganho menos a mensalidade, o payback é o setup dividido pelo saldo (nulo sem saldo
 * positivo) e o retorno em 12 meses é 12 vezes o ganho menos o setup menos 12 mensalidades.
 */
export function calculateValue(input: ValueInput): ValueResult {
  const perdaMes = input.factors.reduce((total, factor) => total * factor, 1);
  const ganhoMes = perdaMes * input.recovery;
  const saldoMes = ganhoMes - input.monthlyTicket;
  const paybackMeses = Math.round((input.setupFee / saldoMes) * 100) / 100;
  const retorno12m = 12 * ganhoMes - input.setupFee - 12 * input.monthlyTicket;
  return { perdaMes, ganhoMes, saldoMes, paybackMeses, retorno12m };
}
