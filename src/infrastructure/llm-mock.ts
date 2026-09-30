/**
 * Mock deterministico do provedor de texto: permite rodar o pipeline inteiro offline.
 * Nao simula a qualidade de um LLM; apenas prova que o fluxo completa e gera documentos.
 */
import type { LlmClient } from "../domain/ports.ts";
import type { Idea, ProviderUsage } from "../domain/types.ts";

export const MOCK_IDEAS: Idea[] = [
  {
    name: "Triagem de WhatsApp",
    sector: "atendimento",
    description: "Lê as mensagens que chegam, separa dúvida simples de intenção real e avisa quem decide.",
  },
  {
    name: "Confirmacao de horario",
    sector: "agenda",
    description: "Confirma compromissos algumas horas antes e realoca a vaga quando alguém desmarca.",
  },
  {
    name: "Ficha do cliente",
    sector: "cadastro",
    description: "Extrai os dados do cliente a partir do documento e preenche o cadastro obrigatório.",
  },
  {
    name: "Resgate de insatisfacao",
    sector: "reputacao",
    description:
      "Lê as conversas em andamento, detecta insatisfação e avisa antes de virar avaliação pública.",
  },
  {
    name: "Previsao de movimento",
    sector: "operacao",
    description: "Prevê o movimento do dia e gera lista de compras e de preparo.",
  },
  {
    name: "Livro de indicacoes",
    sector: "rede",
    description: "Registra quem indicou quem e fecha o acerto do mês.",
  },
];

export const MOCK_BRIEF = `# Brief (modo simulado)

Premissas fixas do modo --mock. Substitua por um LLM real para um brief de verdade.

- Comprador: dono-operador, decide sozinho, sem equipe de TI.
- Orçamento: baixo e mensal; o dinheiro sai do bolso dele, não de um departamento.
- Canal de compra: WhatsApp e indicação de conhecido.
- Dor que faz comprar: perda de dinheiro visível ou risco de imagem.
- Volume de mensagens: alto e concentrado em poucos horários.
`;

/** Texto após a primeira ocorrencia de `marker`, ou null se ausente (maxsplit=1). */
function afterFirst(text: string, marker: string): string | null {
  const index = text.indexOf(marker);
  return index < 0 ? null : text.slice(index + marker.length);
}

/** Texto antes da primeira ocorrencia de `marker` (maxsplit=1). */
function beforeFirst(text: string, marker: string): string {
  const index = text.indexOf(marker);
  return index < 0 ? text : text.slice(0, index);
}

/** Documento sintetico que ecoa o bloco de dados recebido. */
function documentFixture(user: string): string {
  let rawData = "";
  const measuredPt = afterFirst(user, "DADOS MEDIDOS");
  const measuredEn = afterFirst(user, "MEASURED DATA");
  if (measuredPt !== null) {
    rawData = beforeFirst(measuredPt, "FIM DOS DADOS").trim();
  } else if (measuredEn !== null) {
    rawData = beforeFirst(measuredEn, "END OF DATA").trim();
  }

  const lines: Record<string, string> = {};
  for (const line of rawData.split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    lines[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }

  const first = (field: string, fallback = "-"): string => (lines[field] ?? fallback).split(" | ")[0]!.trim();
  const complete = (field: string, fallback = "-"): string =>
    (lines[field] ?? fallback).replaceAll(" | ", " · ").trim();

  const name = lines["Ideia"] ?? lines["Idea"] ?? "ideia de exemplo";
  const indexVal = first("ÍNDICE DE AÇÃO", first("ACTION INDEX", "-"));
  let tierVal = first("TIER") || complete("TIER");
  if ((lines["ÍNDICE DE AÇÃO"] ?? "").includes("TIER:")) {
    tierVal = beforeFirst(afterFirst(lines["ÍNDICE DE AÇÃO"]!, "TIER:")!, " | ").trim();
  }

  const fit = first("fit");
  const sale = first("facilidade de venda", first("sale ease", "-"));
  const disruption = first("disrupção", first("disruption", "-"));
  const solo = first("suporte solo", first("solo support", "-"));
  const pain = complete("tipo de dor", complete("pain type", "-"));
  const algo = complete("ALGORITMO DA DOR", complete("PAIN ALGORITHM", "-"));
  const val = complete("VALIDAÇÃO", complete("VALIDATION", "-"));
  let ticket = "300";
  for (const part of val.split("R$ ")) {
    if (part.includes("por mês") || part.includes("por mes") || part.includes("per month")) {
      ticket = part.split(" ")[0]!.trim();
      break;
    }
  }

  return `# ${name}

**Índice de Ação:** ${indexVal} · **Tier:** ${tierVal}
**Dor verificada:** ${algo}

> Documento gerado em modo \`--mock\`. O texto abaixo é sintético e existe apenas para
> exercitar o pipeline de ponta a ponta. Não use como estudo real.

## 1. Resumo executivo

Esta é uma saída de exemplo. Em execução real, o LLM escreve aqui o veredito da ideia,
as duas ou três fraquezas que o plano precisa resolver e o alerta de preço.

O índice de ação medido foi ${indexVal}, com Tier ${tierVal}. A dor foi classificada como ${algo}.

## 2. Indicadores coletados

### 2.1 Indicadores principais

| Indicador | Valor |
|---|---|
| Aderência ao mercado (fit) | ${fit} |
| Facilidade de venda | ${sale} |
| Disrupção | ${disruption} |
| Suporte solo | ${solo} |
| Tipo de dor | ${pain} |

### 2.2 Verificação automática da dor

${algo}

### 2.3 Mercado

Em execução real, esta seção recebe as âncoras de mercado do brief. Nenhum número de
mercado é gerado pelo modelo: ou vem do brief, ou é marcado \`[INFERENCE]\`.

### 2.4 Validação de preço e meta

${val}

O ticket de R$ ${ticket} por mês é **teto, não piso**, e a meta de clientes é de 10 a 15 em
24 meses.

## 3. Como funciona

Fluxo de exemplo: a mensagem entra, o decisor classifica, o código decide e o dono recebe
apenas o que precisa de ação humana. Toda classificação abaixo do limiar de confiança vai
para revisão em vez de ser executada.

\`\`\`json
{
  "intencao": {
    "type": "choice",
    "instructions": "Classifique a intenção do cliente",
    "criteria": {"duvida": "...", "compra": "...", "problema": "..."}
  },
  "urgencia": {"type": "bool", "instructions": "O cliente demonstra pressa?"}
}
\`\`\`

## 4. Estratégia de venda

1. Demonstrar com o dado do próprio dono, sem cobrar.
2. Diagnóstico pago como filtro.
3. Piloto com escopo fechado e métrica combinada.
4. Assinatura mensal.

| Objeção | Resposta |
|---|---|
| "Já testei e não funcionou" | Provar com o dado dele, não com promessa. |
| "É caro para o meu tamanho" | Comparar com a perda mensal medida. |

## 5. Estratégia de marketing

Posicionamento em uma frase, mensagem principal, canais e calendário sazonal quando fizer
sentido. Nada de jargão de IA.

## 6. Precificação e economia unitária

Entrada mais baixa que o teto, com migração para o preço cheio depois de valor provado.
Custo marginal de modelo de decisão é de centavos por milhar de chamadas.

## 7. SWOT

- Forças: dor medida e mecanismo claro.
- Fraquezas: suporte e integração são o gargalo, não o modelo.
- Oportunidades: vender via associação local.
- Ameaças: concorrente nacional e substituto gratuito.

## 8. Business Model Canvas

| Bloco | Conteúdo |
|---|---|
| Segmentos de cliente | dono-operador do nicho |
| Proposta de valor | resolver a dor medida |
| Canais | WhatsApp, indicação, associação |
| Relacionamento | próximo na entrada, remoto no recorrente |
| Fontes de receita | setup + mensalidade |
| Recursos principais | o classificador e a integração |
| Atividades principais | configurar, medir, vender |
| Parcerias principais | associação local e provedor do canal |
| Estrutura de custos | API, infraestrutura, suporte |

## 9. Ferramentas complementares

### 9.1 Cinco Forças de Porter

| Força | Intensidade |
|---|---|
| Rivalidade | média |
| Poder dos clientes | alto |
| Poder dos fornecedores | alto |
| Novos entrantes | alta |
| Substitutos | média |

### 9.2 Matriz de risco

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| benefícios invisíveis | média | alto | provar com o dado do cliente |

### 9.3 4 Ps

Produto, preço, praça e promoção definidos a partir dos indicadores medidos.

### 9.4 Roadmap de 90 dias

| Semana | Foco |
|---|---|
| 1-2 | oferta e discurso |
| 3-4 | primeiras conversas |
| 5-8 | pilotos |

### 9.5 KPIs

Métricas de uso, de conversão e de churn.

## 10. Próximos passos

1. Fechar a oferta.
2. Conseguir um cliente conhecido para a demonstração.
3. Medir a linha de base.
4. Definir o limiar de confiança.
5. Levar o caso pronto à associação local.
`;
}

export class LlmMock implements LlmClient {
  private calls = 0;

  /** Consumo do modo simulado: só as chamadas (o mock não usa provedor nem tokens). */
  usage(): ProviderUsage {
    return { calls: this.calls, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  }

  generateText(system: string, user: string): Promise<string> {
    this.calls += 1;
    void system;
    void user;
    if (system.includes("PALAVRA-CHAVE: IDEIAS") || system.includes("KEYWORD: IDEAS")) {
      return Promise.resolve(JSON.stringify(MOCK_IDEAS));
    }
    if (system.includes("PALAVRA-CHAVE: BRIEF") || system.includes("KEYWORD: BRIEF")) {
      return Promise.resolve(MOCK_BRIEF);
    }
    return Promise.resolve(documentFixture(user));
  }
}
