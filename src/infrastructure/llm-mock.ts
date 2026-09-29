/**
 * Mock deterministico do provedor de texto: permite rodar o pipeline inteiro offline.
 * Nao simula a qualidade de um LLM; apenas prova que o fluxo completa e gera documentos.
 */
import type { LlmClient } from "../domain/ports.ts";
import type { Idea } from "../domain/types.ts";

export const MOCK_IDEAS: Idea[] = [
  {
    name: "Triagem de WhatsApp",
    sector: "atendimento",
    description: "Le as mensagens que chegam, separa duvida simples de intencao real e avisa quem decide.",
  },
  {
    name: "Confirmacao de horario",
    sector: "agenda",
    description: "Confirma compromissos algumas horas antes e realoca a vaga quando alguem desmarca.",
  },
  {
    name: "Ficha do cliente",
    sector: "cadastro",
    description: "Extrai os dados do cliente a partir do documento e preenche o cadastro obrigatorio.",
  },
  {
    name: "Resgate de insatisfacao",
    sector: "reputacao",
    description:
      "Le as conversas em andamento, detecta insatisfacao e avisa antes de virar avaliacao publica.",
  },
  {
    name: "Previsao de movimento",
    sector: "operacao",
    description: "Preve o movimento do dia e gera lista de compras e de preparo.",
  },
  {
    name: "Livro de indicacoes",
    sector: "rede",
    description: "Registra quem indicou quem e fecha o acerto do mes.",
  },
];

export const MOCK_BRIEF = `# Brief (modo simulado)

Premissas fixas do modo --mock. Substitua por um LLM real para um brief de verdade.

- Comprador: dono-operador, decide sozinho, sem equipe de TI.
- Orcamento: baixo e mensal; o dinheiro sai do bolso dele, nao de um departamento.
- Canal de compra: WhatsApp e indicacao de conhecido.
- Dor que faz comprar: perda de dinheiro visivel ou risco de imagem.
- Volume de mensagens: alto e concentrado em poucos horarios.
`;

/** Texto apos a primeira ocorrencia de `marker`, ou null se ausente (maxsplit=1). */
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
  const indexVal = first("INDICE DE ACAO", first("ACTION INDEX", "-"));
  let tierVal = first("TIER") || complete("TIER");
  if ((lines["INDICE DE ACAO"] ?? "").includes("TIER:")) {
    tierVal = beforeFirst(afterFirst(lines["INDICE DE ACAO"]!, "TIER:")!, " | ").trim();
  }

  const fit = first("fit");
  const sale = first("facilidade de venda", first("sale ease", "-"));
  const disruption = first("disrupcao", first("disruption", "-"));
  const solo = first("suporte solo", first("solo support", "-"));
  const pain = complete("tipo de dor", complete("pain type", "-"));
  const algo = complete("ALGORITMO DA DOR", complete("PAIN ALGORITHM", "-"));
  const val = complete("VALIDACAO", complete("VALIDATION", "-"));
  let ticket = "300";
  for (const part of val.split("R$ ")) {
    if (part.includes("por mes") || part.includes("per month")) {
      ticket = part.split(" ")[0]!.trim();
      break;
    }
  }

  return `# ${name}

**Indice de Acao:** ${indexVal} · **Tier:** ${tierVal}
**Dor verificada:** ${algo}

> Documento gerado em modo \`--mock\`. O texto abaixo e sintetico e existe apenas para
> exercitar o pipeline de ponta a ponta. Nao use como estudo real.

## 1. Resumo executivo

Esta e uma saida de exemplo. Em execucao real, o LLM escreve aqui o veredito da ideia,
as duas ou tres fraquezas que o plano precisa resolver e o alerta de preco.

O indice de acao medido foi ${indexVal}, com Tier ${tierVal}. A dor foi classificada como ${algo}.

## 2. Indicadores coletados

### 2.1 Indicadores principais

| Indicador | Valor |
|---|---|
| Aderencia ao mercado (fit) | ${fit} |
| Facilidade de venda | ${sale} |
| Disrupcao | ${disruption} |
| Suporte solo | ${solo} |
| Tipo de dor | ${pain} |

### 2.2 Verificacao automatica da dor

${algo}

### 2.3 Mercado

Em execucao real, esta secao recebe as ancoras de mercado do brief. Nenhum numero de
mercado e gerado pelo modelo: ou vem do brief, ou e marcado \`[INFERENCE]\`.

### 2.4 Validacao de preco e meta

${val}

O ticket de R$ ${ticket} por mes e **teto, nao piso**, e a meta de clientes e de 10 a 15 em
24 meses.

## 3. Como funciona

Fluxo de exemplo: a mensagem entra, o decisor classifica, o codigo decide e o dono recebe
apenas o que precisa de acao humana. Toda classificacao abaixo do limiar de confianca vai
para revisao em vez de ser executada.

\`\`\`json
{
  "intencao": {
    "type": "choice",
    "instructions": "Classifique a intencao do cliente",
    "criteria": {"duvida": "...", "compra": "...", "problema": "..."}
  },
  "urgencia": {"type": "bool", "instructions": "O cliente demonstra pressa?"}
}
\`\`\`

## 4. Estrategia de venda

1. Demonstrar com o dado do proprio dono, sem cobrar.
2. Diagnostico pago como filtro.
3. Piloto com escopo fechado e metrica combinada.
4. Assinatura mensal.

| Objecao | Resposta |
|---|---|
| "Ja testei e nao funcionou" | Provar com o dado dele, nao com promessa. |
| "E caro para o meu tamanho" | Comparar com a perda mensal medida. |

## 5. Estrategia de marketing

Posicionamento em uma frase, mensagem principal, canais e calendario sazonal quando fizer
sentido. Nada de jargao de IA.

## 6. Precificacao e economia unitaria

Entrada mais baixa que o teto, com migracao para o preco cheio depois de valor provado.
Custo marginal de modelo de decisao e de centavos por milhar de chamadas.

## 7. SWOT

- Forcas: dor medida e mecanismo claro.
- Fraquezas: suporte e integracao sao o gargalo, nao o modelo.
- Oportunidades: vender via associacao local.
- Ameacas: concorrente nacional e substituto gratuito.

## 8. Business Model Canvas

| Bloco | Conteudo |
|---|---|
| Segmentos de cliente | dono-operador do nicho |
| Proposta de valor | resolver a dor medida |
| Canais | WhatsApp, indicacao, associacao |
| Relacionamento | proximo na entrada, remoto no recorrente |
| Fontes de receita | setup + mensalidade |
| Recursos principais | o classificador e a integracao |
| Atividades principais | configurar, medir, vender |
| Parcerias principais | associacao local e provedor do canal |
| Estrutura de custos | API, infraestrutura, suporte |

## 9. Ferramentas complementares

### 9.1 Cinco Forcas de Porter

| Forca | Intensidade |
|---|---|
| Rivalidade | media |
| Poder dos clientes | alto |
| Poder dos fornecedores | alto |
| Novos entrantes | alta |
| Substitutos | media |

### 9.2 Matriz de risco

| Risco | Probabilidade | Impacto | Mitigacao |
|---|---|---|---|
| beneficios invisivel | media | alto | provar com o dado do cliente |

### 9.3 4 Ps

Produto, preco, praca e promocao definidos a partir dos indicadores medidos.

### 9.4 Roadmap de 90 dias

| Semana | Foco |
|---|---|
| 1-2 | oferta e discurso |
| 3-4 | primeiras conversas |
| 5-8 | pilotos |

### 9.5 KPIs

Metricas de uso, de conversao e de churn.

## 10. Proximos passos

1. Fechar a oferta.
2. Conseguir um cliente conhecido para a demonstracao.
3. Medir a linha de base.
4. Definir o limiar de confianca.
5. Levar o caso pronto a associacao local.
`;
}

export class LlmMock implements LlmClient {
  generateText(system: string, user: string): Promise<string> {
    if (system.includes("PALAVRA-CHAVE: IDEIAS") || system.includes("KEYWORD: IDEAS")) {
      return Promise.resolve(JSON.stringify(MOCK_IDEAS));
    }
    if (system.includes("PALAVRA-CHAVE: BRIEF") || system.includes("KEYWORD: BRIEF")) {
      return Promise.resolve(MOCK_BRIEF);
    }
    return Promise.resolve(documentFixture(user));
  }
}
