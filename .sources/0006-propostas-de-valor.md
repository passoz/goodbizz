# Snapshot da origem — propostas de valor reais (Works 0015, 0016 e 0017)

Capturado em 2026-10-25, a partir do pedido do operador e dos estudos reais que ele já rodou
(commit de entrada `743f52f`).

## Pedido do operador (verbatim)

> preciso de melhorias no projeto goodbizz para que me entregue realmente propostas de valor, nao
> brincadeiras

## Decisões do operador (2026-10-25)

1. **Evidência:** "nao quero trabalhar, quero que o app trabalhe pra mim. se precisar fazer uma
   pesquisa, que o app faca, se precisar analisar com llm, que o app faca. nao quero fornecer nada,
   quero que o app faca, senao nao teria nem feito o app". O app faz a pesquisa sozinho. O operador
   não anexa nada.
2. **Formato:** "continua como está, mas pode adicionar o que for relevante". As 10 seções atuais
   ficam (inclusive SWOT, BMC, Porter, 4 Ps); o que entra é acréscimo.
3. **Ranking:** comparação par a par no decisor.
4. **Ordem:** o operador quer valor antes de governança. A Fase 0 de `.sources/0005-plano-de-melhoria.md`
   (congelar o projeto se 3 estudos reais não mudassem decisão) foi recusada. Os Works 0015 a 0017
   vêm antes do Work 0014 (reconciliação da spec); cada um reconcilia na spec o que ele mesmo muda.

## Estudos reais usados como evidência

Rodados com o baseline Python em 2026-09, nicho "depósito e distribuidora de bebidas":

- `~/dev/ideias/bebidas/coleta/` (30 ideias), `~/dev/ideias/bebidas/estudo-2/` (5 ideias),
  `~/dev/ideias/bebidas/` (4 ideias com documento), `~/Downloads/dados.json` (20 ideias, região dos
  Lagos).

## O que torna a saída uma "brincadeira" (medido)

### 1. Nenhum dado real entra no estudo

O brief, as ideias e o plano saem só do LLM. O brief de `estudo-2/00-brief.md` diz "Região não
informada: tratar como padrão nacional" e marca toda faixa de preço como `[INFERENCE]`. Nenhuma URL,
nenhum concorrente com preço verificado, nenhuma reclamação real de cliente.

### 2. O plano inventa números e se contradiz

`estudo-2/01-combo-certo-por-evento/README.md`:

- "Aumenta 15% sua margem média por evento" (linha 65), "de 30 para 5 minutos" (linha 67),
  "Configuração em 15 minutos" (linha 66), "ROI: 2 meses" (linha 104), "Custo operacional: R$ 50/mês"
  (linha 102): nenhum desses números está no bloco DADOS MEDIDOS.
- Contrato anual de "R$ 3.000" (linha 97) e de "R$ 3.500/ano" (linha 153) no mesmo documento.

Causa no código: `checkDocument` (`src/application/verification.ts`) só confere se os números medidos
**aparecem** no texto; ele não recusa número novo. A divergência vira só uma linha em `issues` e o
documento é gravado assim mesmo (`src/application/generate-study.ts:398-402`).

### 3. O plano vende o produto errado

O mesmo documento planeja uma startup de SaaS: "Desenvolvimento do MVP" (linha 160), "treinamento
para equipe de vendas" (linha 176), "Expansão para novos bairros — Presença em 3 novas regiões"
(linha 165), "LTV/CAC (meta: >3)" (linha 171). O operador é um consultor solo que implanta automação
(n8n, WhatsApp, IA) e cobra setup mais mensalidade (`~/dev/eu/data/projetos/Renda própria.md`:
setup R$ 1.200 a 1.800 e R$ 300 a 400 por mês). Não existe no estudo uma conta de quanto o dono perde
hoje, quanto a solução recupera e em quantos meses ela se paga.

### 4. As notas absolutas do decisor não separam as ideias

Medido sobre 40 ideias reais (excluídas as sondas de controle fora do nicho):

| Indicador | p10 | mediana | p90 | desvio padrão |
| --- | --- | --- | --- | --- |
| `meta30` | 0,40 | 0,46 | 0,54 | 0,136 |
| `wtp` | 0,42 | 0,55 | 0,92 | 0,174 |
| `fit` | 1,04 | 1,53 | 1,91 | 0,318 |
| `venda` | 0,99 | 1,46 | 1,88 | 0,441 |

- Dor: `dinheiro_direto` em 29 de 40 ideias; rótulo `FORTE` em 26 de 40.
- `~/Downloads/00-tabelao.md`: 20 ideias, 18 com índice entre 1,615 e 1,92; WTP entre 0,45 e 0,58 em
  todas; `30/24m` entre 0,43 e 0,52 em todas.

O topo do ranking é decidido por diferenças de 0,01 a 0,03 em notas que o decisor dá quase iguais
para tudo.

## Desenho aprovado

| Work | O que muda | Depende de |
| --- | --- | --- |
| 0015 | Pesquisa web automática: o app gera as buscas, consulta um provedor de busca (Tavily por padrão; 1.000 créditos grátis por mês, sem cartão), extrai evidências com trecho literal e URL, e todo o estudo cita `[E#]` | — |
| 0016 | Proposta de valor com a conta aberta: premissas com fonte, perda mensal, ganho, setup, mensalidade e payback calculados pelo código; seção nova no plano; guardrail que recusa número sem fonte e regera o documento | 0015 (evidências) |
| 0017 | Ranking por torneio par a par no decisor, com as duas ordens de apresentação para anular o viés de posição | — |

Critério de aceite comum aos três Works, além dos gates do repositório: um estudo real com os
provedores do operador, no nicho de bebidas da região dos Lagos, comparado com
`~/Downloads/00-tabelao.md`.
