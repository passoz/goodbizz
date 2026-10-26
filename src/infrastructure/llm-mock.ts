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

/** Temas das buscas simuladas: os seis que a pesquisa exige, mais dois de mercado. */
const MOCK_QUERY_TOPICS = [
  "preço de sistema para",
  "concorrentes de automação para",
  "reclamações de clientes de",
  "custos e perdas na operação de",
  "quantos negócios de",
  "regulação e licença para",
  "atendimento pelo WhatsApp em",
  "ticket médio de",
];

/** Oito buscas a partir do nicho e da cidade que o prompt de planejamento informa. */
function mockQueries(user: string): string[] {
  const niche = (/^Nicho: (.+)$/m.exec(user)?.[1] ?? "o nicho").trim().toLowerCase();
  const city = (/^Cidade ou região alvo: (.+)$/m.exec(user)?.[1] ?? "").trim();
  const place = city === "" || city === "não informada" ? "" : ` em ${city}`;
  return MOCK_QUERY_TOPICS.map((topic) => `${topic} ${niche}${place}`);
}

/** Tipo da evidência pelo tema da busca, como um extrator real faria. */
function mockKind(query: string): string {
  const text = query.toLowerCase();
  if (text.includes("preço")) return "preco";
  if (text.includes("concorrente")) return "concorrente";
  if (text.includes("reclama")) return "reclamacao";
  if (text.includes("custo")) return "custo";
  if (text.includes("regula")) return "regulacao";
  return "mercado";
}

/**
 * Extração simulada: a primeira frase do conteúdo de cada resultado (no máximo dois), copiada
 * literalmente, com o primeiro número dela como valor. Assim o mock passa pela validação literal
 * do código sem nenhuma regra especial.
 */
function mockEvidences(user: string): Array<Record<string, unknown>> {
  const query = (/^BUSCA: (.+)$/m.exec(user)?.[1] ?? "").trim();
  const pattern = /URL: (\S+)\nTÍTULO: (.*)\nCONTEÚDO:\n([\s\S]*?)\nFIM DO RESULTADO/g;
  const evidences: Array<Record<string, unknown>> = [];
  for (const match of user.matchAll(pattern)) {
    if (evidences.length >= 2) break;
    const content = (match[3] ?? "").replace(/\s+/g, " ").trim();
    const sentence = (/^.*?[.!?](?=\s|$)/.exec(content)?.[0] ?? content).trim();
    if (sentence === "") continue;
    const number = /\d+(?:[.,]\d+)?/.exec(sentence)?.[0];
    evidences.push({
      tipo: mockKind(query),
      afirmacao: `Achado da busca "${query}": ${(match[2] ?? "").trim()}`,
      trecho: sentence,
      url: match[1],
      valor: number === undefined ? null : Number(number.replace(",", ".")),
      unidade: number === undefined ? "" : sentence.includes("R$") ? "R$" : "unidades",
    });
  }
  return evidences;
}

/** Ids e afirmações do bloco de evidências do prompt (`[E1] (tipo) afirmação — trecho: ...`). */
function promptEvidences(user: string): Array<{ id: string; claim: string }> {
  return [...user.matchAll(/^\[(E\d+)\] \(\w+\) (.+?) — trecho: /gm)].map((match) => ({
    id: match[1] as string,
    claim: match[2] as string,
  }));
}

/**
 * Citação simulada: até três evidências recebidas, cada uma com o id entre colchetes. Sem bloco de
 * evidências no prompt (chamada antiga), nada muda; bloco vazio vira a marca de [INFERENCE].
 */
function mockCitations(user: string, title: string): string {
  if (!user.includes("EVIDÊNCIAS DA PESQUISA")) return "";
  const cited = promptEvidences(user).slice(0, 3);
  if (cited.length === 0)
    return `\n${title}\n\n- Sem evidência pesquisada: as premissas acima são [INFERENCE].\n`;
  return `\n${title}\n\n${cited.map((item) => `- ${item.claim} [${item.id}]`).join("\n")}\n`;
}

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
    const trimmed = line.trim();
    if (
      trimmed.startsWith("premissa:") ||
      trimmed.startsWith("perda mensal:") ||
      trimmed.startsWith("ganho mensal:") ||
      trimmed.startsWith("saldo mensal:") ||
      trimmed.startsWith("setup:") ||
      trimmed.startsWith("payback:") ||
      trimmed.startsWith("retorno em 12 meses:")
    )
      continue;
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
  const valorLines = rawData
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.startsWith("premissa:") ||
        line.startsWith("perda mensal:") ||
        line.startsWith("ganho mensal:") ||
        line.startsWith("saldo mensal:") ||
        line.startsWith("setup:") ||
        line.startsWith("payback:") ||
        line.startsWith("retorno em 12 meses:"),
    );
  const premiseRows = rawData
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("premissa:"))
    .map((line) => {
      const body = line.slice("premissa:".length).trim();
      const source = (/\[(E\d+|INFERENCE)\]/.exec(body)?.[1] ?? "INFERENCE").trim();
      const left = body.replace(/\[.*?\]/, "").trim();
      const name = beforeFirst(left, "=").trim() || "premissa";
      const rest = afterFirst(left, "=")?.trim() ?? "";
      const value = beforeFirst(rest, " ").trim() || rest;
      const unit = afterFirst(rest, " ")?.trim() ?? "";
      return `| ${name} | ${value} | ${unit} | ${source} |`;
    });
  const accountLine = (prefix: string): string => {
    const found = valorLines.find((line) => line.startsWith(prefix));
    return found ?? `${prefix} -`;
  };
  const lossLine = accountLine("perda mensal:");
  const gainLine = accountLine("ganho mensal:");
  const balanceLine = accountLine("saldo mensal:");
  const setupLine = accountLine("setup:");
  const paybackLine = accountLine("payback:");
  const returnLine = accountLine("retorno em 12 meses:");
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
mercado é gerado pelo modelo: ou vem de uma evidência citada, ou é marcado \`[INFERENCE]\`.
${mockCitations(user, "Âncoras pesquisadas:")}
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

## 11. Proposta de valor e retorno

### 11.1 Proposta em uma frase

Automação que reduz a perda mensal do dono, com conta aberta.

### 11.2 Premissas com fonte

| Premissa | Valor | Unidade | Fonte |
|---|---|---|---|
${premiseRows.length > 0 ? premiseRows.join("\n") : "| - | - | - | INFERENCE |"}

### 11.3 Escopo de entrega

Consultor solo implanta automação com n8n, WhatsApp e IA em até 2 semanas.

### 11.4 Conta do retorno

${lossLine}
${gainLine}
${balanceLine}
${setupLine}
${paybackLine}
${returnLine}

Os números acima repetem o bloco VALOR calculado pelo código a partir das premissas. Sem evidência, a conta inteira é estimativa a confirmar.

### 11.5 Primeira mensagem

Mensagem de abordagem ao dono com a dor quantificada e o payback.

### 11.6 Critério de descarte

Se as premissas não se confirmarem na conversa, descarte a ideia.
`;
}

/**
 * Premissas do mock: determinísticas por ideia (a partir do nome), com fonte INFERENCE.
 * A task 1.13 completa o mock com fontes em evidências e seção 11; aqui o mínimo para o
 * pipeline pedir premissas uma vez por ideia sem quebrar os testes legados.
 */
function mockPremises(user: string): {
  fatores: Array<{ nome: string; valor: number; unidade: string; fonte: string }>;
  recuperacao: number;
} {
  const ideaName = (/^Ideia: (.+)$/m.exec(user)?.[1] ?? "ideia").trim();
  let seed = 0;
  for (const char of ideaName) seed = (seed * 31 + char.charCodeAt(0)) % 1000;
  const first = 10 + (seed % 20);
  const second = 100 + ((seed * 7) % 100);
  const cited = [...user.matchAll(/\b(E\d+)\b/g)]
    .map((match) => match[1] as string)
    .filter((id, index, all) => all.indexOf(id) === index);
  const firstSource = cited[0] ?? "INFERENCE";
  const secondSource = cited[1] ?? "INFERENCE";
  return {
    fatores: [
      { nome: "ocorrências por mês", valor: first, unidade: "ocorrências/mês", fonte: firstSource },
      { nome: "custo por ocorrência", valor: second, unidade: "R$", fonte: secondSource },
    ],
    recuperacao: 0.5,
  };
}

/**
 * Ideias do mock respeitando o que o prompt proibe repetir.
 *
 * O pipeline de adicao lista as ideias que o estudo ja tem e pede outras. Um mock que devolvesse
 * `MOCK_IDEAS` inteiro faria o teste da adicao medir um cenario que nenhum provedor real produz -- e
 * ainda criaria nomes duplicados, que a UI resolve por nome.
 */
function distinctIdeas(user: string): Idea[] {
  const forbidden = new Set(
    (user.match(/Ideias que já existem e NÃO podem ser repetidas: ([^\n]+)\./)?.[1] ?? "")
      .split(";")
      .map((name) => name.trim())
      .filter((name) => name !== ""),
  );
  const wanted = Number(user.match(/Gere exatamente (\d+) ideias/)?.[1] ?? String(MOCK_IDEAS.length));
  const ideas = MOCK_IDEAS.filter((idea) => !forbidden.has(idea.name));
  // O conjunto fixo acaba: completa com nomes proprios para o mock cobrir pedidos grandes.
  for (let position = 1; ideas.length < wanted; position += 1) {
    ideas.push({
      name: `Ideia Extra ${position}`,
      sector: "operacao",
      description: "ideia adicional do modo simulado, distinta das que ja existem",
    });
  }
  return ideas.slice(0, wanted);
}

export class LlmMock implements LlmClient {
  private calls = 0;

  /** Consumo do modo simulado: só as chamadas (o mock não usa provedor nem tokens). */
  usage(): ProviderUsage {
    return { calls: this.calls, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  }

  generateText(system: string, user: string): Promise<string> {
    this.calls += 1;
    if (system.includes("PALAVRA-CHAVE: IDEIAS") || system.includes("KEYWORD: IDEAS")) {
      return Promise.resolve(JSON.stringify(distinctIdeas(user)));
    }
    if (system.includes("PALAVRA-CHAVE: BRIEF") || system.includes("KEYWORD: BRIEF")) {
      return Promise.resolve(`${MOCK_BRIEF}${mockCitations(user, "## Evidências da pesquisa")}`);
    }
    if (system.includes("PALAVRA-CHAVE: BUSCAS")) return Promise.resolve(JSON.stringify(mockQueries(user)));
    if (system.includes("PALAVRA-CHAVE: EVIDENCIAS"))
      return Promise.resolve(JSON.stringify(mockEvidences(user)));
    if (system.includes("PALAVRA-CHAVE: PREMISSAS"))
      return Promise.resolve(JSON.stringify(mockPremises(user)));
    return Promise.resolve(documentFixture(user));
  }
}
