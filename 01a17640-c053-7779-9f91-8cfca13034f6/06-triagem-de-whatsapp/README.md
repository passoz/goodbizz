# Triagem de WhatsApp (setor: atendimento)

**Índice de Ação:** 0.65 · **Tier:** C
**Dor verificada:** FRACA · escore de dor 0 · dor interna 1 · margem -1.00 · desvio 0

> Documento gerado em modo `--mock`. O texto abaixo é sintético e existe apenas para
> exercitar o pipeline de ponta a ponta. Não use como estudo real.

## 1. Resumo executivo

Esta é uma saída de exemplo. Em execução real, o LLM escreve aqui o veredito da ideia,
as duas ou três fraquezas que o plano precisa resolver e o alerta de preço.

O índice de ação medido foi 0.65, com Tier C. A dor foi classificada como FRACA · escore de dor 0 · dor interna 1 · margem -1.00 · desvio 0.

## 2. Indicadores coletados

### 2.1 Indicadores principais

| Indicador | Valor |
|---|---|
| Aderência ao mercado (fit) | 0.86/2.00 (confiança 0.70) |
| Facilidade de venda | 0.44/2.00 (confiança 0.70) |
| Disrupção | 0.82/2.00 (confiança 0.70) |
| Suporte solo | 0.96 |
| Tipo de dor | backoffice (confiança 0.80) · distribuição: backoffice=1.00, dinheiro_direto=0.00, reputacao=0.00 |

### 2.2 Verificação automática da dor

FRACA · escore de dor 0 · dor interna 1 · margem -1.00 · desvio 0

### 2.3 Mercado

Em execução real, esta seção recebe as âncoras de mercado do brief. Nenhum número de
mercado é gerado pelo modelo: ou vem de uma evidência citada, ou é marcado `[INFERENCE]`.

Âncoras pesquisadas:

- Achado da busca "preço de sistema para cafés de bairro": Guia 1 sobre preço de sistema para cafés de bairro [E1]
- Achado da busca "preço de sistema para cafés de bairro": Guia 2 sobre preço de sistema para cafés de bairro [E2]
- Achado da busca "concorrentes de automação para cafés de bairro": Guia 1 sobre concorrentes de automação para cafés de bairro [E3]

### 2.4 Validação de preço e meta

pagaria R$ 300/mês = 0.47 · 30 clientes em 24 meses = 0.47 · preço vs valor = 1.42/2.00 (confiança 0.70)

O ticket de R$ 300 por mês é **teto, não piso**, e a meta de clientes é de 10 a 15 em
24 meses.

## 3. Como funciona

Fluxo de exemplo: a mensagem entra, o decisor classifica, o código decide e o dono recebe
apenas o que precisa de ação humana. Toda classificação abaixo do limiar de confiança vai
para revisão em vez de ser executada.

```json
{
  "intencao": {
    "type": "choice",
    "instructions": "Classifique a intenção do cliente",
    "criteria": {"duvida": "...", "compra": "...", "problema": "..."}
  },
  "urgencia": {"type": "bool", "instructions": "O cliente demonstra pressa?"}
}
```

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
| ocorrências por mês | 16 | ocorrências/mês | E1 |
| custo por ocorrência | 142 | R$ | E2 |

### 11.3 Escopo de entrega

Consultor solo implanta automação com n8n, WhatsApp e IA em até 2 semanas.

### 11.4 Conta do retorno

perda mensal: R$ 2272
ganho mensal: R$ 1136
saldo mensal: R$ 836 (se paga)
setup: R$ 1800 | mensalidade: R$ 300/mês
payback: 2.15 meses
retorno em 12 meses: R$ 8232

Os números acima repetem o bloco VALOR calculado pelo código a partir das premissas. Sem evidência, a conta inteira é estimativa a confirmar.

### 11.5 Primeira mensagem

Mensagem de abordagem ao dono com a dor quantificada e o payback.

### 11.6 Critério de descarte

Se as premissas não se confirmarem na conversa, descarte a ideia.

---

_Gerada em 26/10/2026, 03:28_

## Fontes

- **[E1]** Achado da busca "preço de sistema para cafés de bairro": Guia 1 sobre preço de sistema para cafés de bairro — “[QR-001] Resultado 1 para "preço de sistema para cafés de bairro".” — <https://mock.busca.test/preco-de-sistema-para-cafes-de-bairro/snrcxx-1>
- **[E2]** Achado da busca "preço de sistema para cafés de bairro": Guia 2 sobre preço de sistema para cafés de bairro — “[QR-001] Resultado 2 para "preço de sistema para cafés de bairro".” — <https://mock.busca.test/preco-de-sistema-para-cafes-de-bairro/snrcxx-2>
- **[E3]** Achado da busca "concorrentes de automação para cafés de bairro": Guia 1 sobre concorrentes de automação para cafés de bairro — “[QR-001] Resultado 1 para "concorrentes de automação para cafés de bairro".” — <https://mock.busca.test/concorrentes-de-automacao-para-cafes-de-bairro/1vuo2m3-1>
