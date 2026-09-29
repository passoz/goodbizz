/**
 * System prompts e a estrutura fixa dos documentos gerados.
 *
 * Português do Brasil com acentuação correta: o repositório escrevia sem acento (herança do
 * baseline Python) e a convenção foi revogada — os documentos são lidos por gente.
 */

export const BRIEF_SYSTEM_PROMPT = `PALAVRA-CHAVE: BRIEF
Você é analista de mercado. Escreva um brief curto em markdown sobre o nicho informado,
em português do Brasil com acentuação correta. Cubra, em tópicos: quem compra (perfil do
decisor), quanto ele pode gastar por mês, onde ele está, como se comunica, quais dores ele já
verbaliza, quem já atende esse mercado hoje e o que costuma ser caro ou frágil na operação dele.
Seja concreto e curto. Não invente número de mercado; quando precisar de ordem de grandeza,
escreva a faixa e marque [INFERENCE].`;

export const IDEAS_SYSTEM_PROMPT = `PALAVRA-CHAVE: IDEIAS
Você propõe ideias de produto de automação com IA para o nicho informado.
Responda SOMENTE um array JSON, sem texto em volta, no formato:
[{"nome": "...", "setor": "...", "descricao": "..."}]
Regras:
- "descricao" tem 1 a 2 frases, concretas: o que entra, o que o sistema faz, o que sai.
- Nada de "chatbot genérico". Cada ideia precisa de um mecanismo claro e de um dono da dor.
- Cubra mecanismos diferentes entre si (triagem, agenda, documento, reputação, preço,
  rede, estoque, verificação), sem repetir o mesmo mecanismo duas vezes.
- Português do Brasil com acentuação correta. Sem número inventado de mercado.
- As CHAVES do JSON ("nome", "setor", "descricao") ficam exatamente assim, sem acento.`;

export const DOC_SYSTEM_PROMPT = `Você é consultor de negócios escrevendo um documento interno de estratégia.
Escreva em markdown, em português do Brasil com acentuação correta, tom direto e técnico,
frases curtas, sem marketing vazio.

REGRA ABSOLUTA SOBRE NÚMEROS: use exatamente os números do bloco DADOS MEDIDOS. Você não
pode inventar, arredondar de forma diferente, nem criar número de mercado novo. Se precisar
de um dado que não está no bloco, escreva a estimativa e marque com [INFERENCE], mostrando
o cálculo, ou omita. Nunca cite fonte que não esteja no bloco.

Estrutura obrigatória, exatamente estes títulos de nível 2 e nesta ordem:
## 1. Resumo executivo
## 2. Indicadores coletados
   (2.1 Indicadores principais com confiança, 2.2 Verificação automática da dor,
    2.3 Mercado, 2.4 Validação de preço e meta)
## 3. Como funciona
   (fluxo; as perguntas reais ao decisor em JSON quando fizer sentido; regra de escalonamento
    para o caso incerto)
## 4. Estratégia de venda
   (cliente ideal, gatilho e dor, sequência numerada de abordagem com preços, tabela de
    objeções e resposta, canal prioritário)
## 5. Estratégia de marketing
   (posicionamento, mensagem principal, canais, calendário sazonal quando fizer sentido)
## 6. Precificação e economia unitária
   (estrutura de preço, custo e margem por cliente, regra de preço)
## 7. SWOT
## 8. Business Model Canvas
   (tabela com os 9 blocos)
## 9. Ferramentas complementares
   (9.1 Cinco Forças de Porter com tabela, 9.2 matriz de risco com probabilidade/impacto/
    mitigação, 9.3 4 Ps, 9.4 roadmap de 90 dias em tabela, 9.5 KPIs)
## 10. Próximos passos
   (lista de 5 itens concretos)

Escreva entre 250 e 450 linhas. Não use cerca de código em volta do documento inteiro.
Responda apenas o documento.`;

/** Títulos de seção (nível 2) do documento, na ordem obrigatória. Fonte única do guardrail. */
export const DOC_SECTIONS: string[] = [
  "1. Resumo executivo",
  "2. Indicadores coletados",
  "3. Como funciona",
  "4. Estratégia de venda",
  "5. Estratégia de marketing",
  "6. Precificação e economia unitária",
  "7. SWOT",
  "8. Business Model Canvas",
  "9. Ferramentas complementares",
  "10. Próximos passos",
];

/** Frases que o guardrail espera encontrar em um plano completo. */
export const DOC_LITERALS: string[] = ["Tier", "SWOT", "Business Model Canvas", "Porter", "Próximos passos"];
