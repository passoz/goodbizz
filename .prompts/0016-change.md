# PROMPT: Cada ideia vira uma proposta de valor com a conta do retorno aberta

**Status:** Pronto para planejamento
**Work ID:** 0016
**Origem:** `.sources/0006-propostas-de-valor.md`
**System spec:** `.specs/system.json`
**Baseline:** system spec versão 1, status "Baseline parcial", última reconciliação em 2026-09-29, commit de entrada depois do Work 0015

## Delta da system spec

- **Capacidades afetadas:** CAP-001 (parâmetro de setup no estudo), CAP-007 (premissas por ideia, seção nova e enquadramento do consultor solo), CAP-008 (guardrail que recusa número sem fonte e regera o documento), CAP-009 (colunas de perda mensal e payback no tabelão, no CSV e no `dados.json`), CAP-012, CAP-013 e CAP-014 (campo de setup na CLI, na API e no formulário), CAP-015 (coluna `setup_fee`).
- **Regras preservadas:** BR-001 a BR-010, BR-013 a BR-023.
- **Regras alteradas:** BR-011 passa a dizer que todo valor em R$, percentual ou quantidade de tempo do documento precisa estar no bloco DADOS MEDIDOS (medido, calculado ou de evidência) ou na mesma linha de `[INFERENCE]`, e que o documento que viola é regerado uma vez; BR-012 passa de 10 para 11 títulos obrigatórios.
- **Contratos afetados:** CON-001 (flag `--setup`/`--implantacao`), CON-002 (`setupFee` na criação e no detalhe; `value` por avaliação), CON-003 (campo de setup em `/new`; perda mensal e payback no ranking), CON-006 (seção 11 no README da ideia; colunas `perda_mes` e `payback_meses` no tabelão e no CSV; chave aditiva `valor` por ideia no `dados.json`).
- **Qualidades, entidades e integrações relacionadas:** SQR-002 passa a ser verificada também na ausência de número inventado; ENT-001 ganha `setupFee`; ENT-003 ganha o bloco de valor (premissas e números calculados); INT-001 ganha uma chamada por ideia para as premissas.
- **Gaps tocados:** nenhum.
- **Reconciliação esperada após implementação:** a spec descreve as premissas com fonte, o cálculo de perda, ganho e payback pelo código, a seção 11, o guardrail com regeração, o parâmetro de setup e as regras BR-011 e BR-012 com o texto novo; o Work aplica essa reconciliação em `.specs/system.json` antes de fechar.

## Problema e resultado

**Problema:** o plano de cada ideia não é uma proposta que o operador leve ao dono do negócio. Em `~/dev/ideias/bebidas/estudo-2/01-combo-certo-por-evento/README.md` ele inventa "aumenta 15% sua margem" (linha 65), "de 30 para 5 minutos" (linha 67) e "ROI: 2 meses" (linha 104), e diz R$ 3.000 por ano na linha 97 e R$ 3.500 por ano na linha 153. `checkDocument` só confere se os números medidos aparecem; ele não recusa número novo, e o documento é gravado com a falha em `issues`. O plano também trata a ideia como startup de SaaS ("Desenvolvimento do MVP", "equipe de vendas", "Presença em 3 novas regiões", "LTV/CAC"), enquanto o operador é consultor solo que implanta automação e cobra setup mais mensalidade. Não existe conta de quanto o dono perde hoje, quanto a solução recupera e em quantos meses ela se paga.

**Resultado esperado:** para cada ideia, o LLM devolve premissas estruturadas com fonte (`E#` de uma evidência do Work 0015 ou `INFERENCE`), e o código calcula perda mensal, ganho mensal, saldo, payback e retorno em 12 meses com o setup e a mensalidade do estudo. O plano mantém as 10 seções e ganha a seção 11 com a proposta de valor, a tabela de premissas, o escopo de entrega, a conta do retorno, a primeira mensagem ao dono e o critério de descarte. Um número sem fonte faz o documento ser regerado uma vez com a lista do que violou.

## Contexto confirmado

- `DOC_SYSTEM_PROMPT` e `DOC_SECTIONS` têm 10 seções (`src/application/prompts.ts:28-76`); `DOC_LITERALS` exige Tier, SWOT, Business Model Canvas, Porter e Próximos passos.
- `dataBlock` (`src/application/generation.ts:102-139`) é a única fonte de número do documento e não tem nenhum valor em R$ além do ticket.
- `checkDocument` recebe 8 números medidos e só verifica presença (`src/application/generate-study.ts:388-398`).
- O estudo só conhece o ticket mensal (`monthlyTicket`); o plano de renda do operador cobra setup de R$ 1.200 a 1.800 mais R$ 300 a 400 por mês.
- O Work 0015 entrega a lista de evidências do estudo e de cada ideia com `id`, `valor` e `unidade`.

## Atores e valor

- **ACT-001 Operador/consultor (CLI):** leva ao dono uma proposta com a conta aberta e sabe quais premissas confirmar na conversa.
- **ACT-003 Usuario da interface web:** compara as ideias por perda mensal e payback, além das notas.

## Escopo

### Inclui

- Parâmetro `setupFee` (padrão 1500, inteiro de 0 a 100000) no estudo, na CLI (`--setup`, `--implantacao`), na API, no formulário `/new`, no banco (migração aditiva `setup_fee`) e na chave de cache do documento.
- Chamada de premissas por ideia, com validação do JSON e cache próprio.
- Módulo de valor que calcula perda mensal, ganho mensal, saldo mensal, payback em meses e retorno em 12 meses.
- Bloco VALOR no `dataBlock` com premissas e números calculados.
- Seção "11. Proposta de valor e retorno" no prompt, em `DOC_SECTIONS` e no guardrail; resumo executivo abre com a proposta em uma frase, a perda mensal e o payback.
- Enquadramento do consultor solo nos prompts de ideias e de documento.
- Guardrail de números sem fonte com uma regeração.
- Colunas de perda mensal e payback no tabelão, no CSV, no `dados.json` e no ranking da interface; README atualizado.

### Não inclui

- Remover ou renomear as seções 1 a 10 (SWOT, BMC, Porter e 4 Ps ficam).
- Mudar a pesquisa web (Work 0015) ou a ordem do ranking (Work 0017).
- Taxa de setup diferente por ideia.
- Conversão de moeda além da já existente.

## Cenários de usuário

### US-001 — A conta do retorno sai do código (P1)

**Ator:** operador.
**Valor independente:** ele vê quanto o dono perde, quanto recupera e quando a solução se paga, com cada premissa marcada pela fonte.
**Verificação independente:** `bun test` do módulo de valor com premissas conhecidas.

1. **Given** premissas com fatores 20, 4 e 35 e recuperação 0.5, setup 1500 e mensalidade 350, **When** o código calcula o valor, **Then** a perda mensal é 2800, o ganho mensal é 1400, o saldo é 1050, o payback é 1.43 meses e o retorno em 12 meses é 11100 (FR-002, FR-003)
2. **Given** um ganho mensal menor ou igual à mensalidade, **When** o código calcula o valor, **Then** o payback fica nulo e o documento diz que a solução não se paga com esse preço (FR-003)

### US-002 — Premissa sem fonte válida não passa (P1)

**Ator:** operador.
**Valor independente:** toda premissa aponta para uma evidência real ou admite que é estimativa.
**Verificação independente:** `bun test` com premissas que citam evidência inexistente ou valor não positivo.

1. **Given** uma premissa com fonte `E42` e o estudo sem E42, **When** as premissas são validadas, **Then** a fonte vira `INFERENCE` e o estudo registra a correção em `issues` (FR-001)

### US-003 — Número inventado faz o documento ser regerado (P1)

**Ator:** operador.
**Valor independente:** o plano não mostra "15% de margem" nem "ROI de 2 meses" que nenhuma conta sustenta.
**Verificação independente:** `bun test` com um LLM simulado que inventa um valor na primeira resposta e corrige na segunda.

1. **Given** um documento com "R$ 3.000 por ano" fora do bloco e sem `[INFERENCE]` na linha, **When** o guardrail roda, **Then** o app pede um novo documento uma vez com a lista dos números sem fonte e grava a segunda versão (FR-006, FR-007)
2. **Given** um documento que continua com número sem fonte depois da regeração, **When** o guardrail roda de novo, **Then** o documento é gravado e cada número sem fonte entra em `issues` com o nome da ideia (FR-007)

### US-004 — O plano fala com o consultor solo (P2)

**Ator:** operador.
**Valor independente:** o plano propõe o que ele implanta e vende, não uma startup de software.
**Verificação independente:** `bun test` dos prompts e do documento simulado com a seção 11.

1. **Given** um estudo concluído, **When** o operador abre o plano de uma ideia, **Then** o documento tem as 11 seções, a seção 11 tem as subseções 11.1 a 11.6 e o resumo executivo cita a perda mensal e o payback calculados (FR-004, FR-005)

### US-005 — Setup configurável e visível (P2)

**Ator:** usuário da interface web.
**Valor independente:** ele informa o setup que cobra e compara ideias pela conta.
**Verificação independente:** `bun test` da API, do formulário e do ranking.

1. **Given** o formulário `/new` com setup 1800, **When** o usuário cria o estudo, **Then** o estudo grava `setupFee` 1800 e o ranking mostra perda mensal e payback de cada ideia (FR-008, FR-009)

## Contrato observável

- **Entradas:** `setupFee` em `POST /api/studies` e no formulário; `--setup`/`--implantacao` na CLI; evidências do Work 0015.
- **Saídas e efeitos:** chave `valor` por ideia no `dados.json` com `premissas` (nome, valor, unidade, fonte), `recuperacao`, `perda_mes`, `ganho_mes`, `saldo_mes`, `payback_meses` e `retorno_12m`; seção 11 no README da ideia; colunas `perda_mes` e `payback_meses` no tabelão e no CSV; `value` em cada avaliação de `GET /api/studies/:id`.
- **Erros:** `setupFee` fora de 0 a 100000 ou não inteiro responde `422` com o detalhe Zod; premissas em JSON inválido são pedidas de novo uma vez e, se falharem, a ideia segue sem bloco de valor e o estudo registra em `issues`.

## Requisitos

### Funcionais

- **FR-001:** a chamada de premissas devolve de 2 a 4 fatores positivos e uma recuperação entre 0 e 1, e cada fonte é um id de evidência existente no estudo ou `INFERENCE`.
- **FR-002:** a perda mensal é o produto dos fatores, o ganho mensal é a perda vezes a recuperação, e o saldo mensal é o ganho menos a mensalidade.
- **FR-003:** o payback é o setup dividido pelo saldo mensal com 2 casas, fica nulo quando o saldo é menor ou igual a zero, e o retorno em 12 meses é 12 vezes o ganho menos o setup menos 12 mensalidades.
- **FR-004:** o `dataBlock` traz o bloco VALOR com cada premissa, sua fonte e todos os números calculados, e o documento ganha a seção 11 com as subseções 11.1 a 11.6.
- **FR-005:** os prompts de ideias e de documento descrevem o operador como consultor solo que implanta automação com n8n, WhatsApp e IA em até 2 semanas e cobra setup mais mensalidade, e proíbem plano de software próprio, equipe de vendas, expansão regional e LTV/CAC.
- **FR-006:** o guardrail extrai do documento todo valor em R$, todo percentual e toda quantidade de minutos, horas, dias, semanas ou meses, e marca como sem fonte o que não está no conjunto permitido nem na mesma linha de `[INFERENCE]`.
- **FR-007:** um documento com número sem fonte é regerado uma vez com a lista dos números; se a segunda versão ainda violar, ela é gravada e cada número sem fonte entra em `issues`.
- **FR-008:** `setupFee` existe no estudo com padrão 1500, na CLI, na API com validação de 0 a 100000, no formulário `/new` e na coluna `setup_fee`.
- **FR-009:** o tabelão, o CSV, o `dados.json` e o ranking da interface mostram a perda mensal e o payback de cada ideia.

### Qualidade e restrições

- **QR-001:** o conjunto permitido do guardrail inclui os números medidos, os calculados, os valores das evidências, os das premissas, o ticket, o setup, os equivalentes anuais e o 90 do título do roadmap.
- **QR-002:** as chaves já existentes do `dados.json` e do CSV não mudam de nome nem de tipo, e o `recalibrate` continua lendo o arquivo.
- **QR-003:** o modo simulado produz premissas, valor e seção 11 determinísticos e coerentes com o guardrail.
- **QR-004:** estudo antigo sem `setup_fee` nem bloco de valor abre com o padrão 1500 e as colunas novas vazias.

## Casos de borda

- **EC-001:** sem nenhuma evidência no estudo, todas as premissas saem com fonte `INFERENCE` e o documento diz que a conta inteira é estimativa a confirmar (FR-001, FR-004).
- **EC-002:** "R$ 350" escrito como "R$ 350,00" ou "350 reais" conta como o mesmo valor permitido (FR-006, QR-001).
- **EC-003:** numeração de seção, de lista e de tabela ("11.4", "1.", "Mês 2") não é tratada como número a verificar (FR-006).
- **EC-004:** setup zero produz payback zero quando o saldo é positivo (FR-003, FR-008).

## Critérios de sucesso

- **SC-001:** `bun test` passa com as asserções do cálculo, da validação de premissas, do guardrail com regeração, da seção 11 e do setup (FR-001, FR-002, FR-003, FR-006, FR-007, FR-008).
- **SC-002:** `bun run cli generate "depositos de bebidas" --city "Cabo Frio" --ideas 3 --setup 1500 --mock` grava o tabelão com perda mensal e payback e cada README com a seção 11 sem número sem fonte em `issues` (FR-004, FR-005, FR-009, QR-003).
- **SC-003:** `bun run check`, `bunx eslint .` e `bunx prettier --check .` passam (QR-002, QR-004).
- **SC-004:** `pwn work gate --all --work 0016` aprovado e `.specs/system.json` reconciliada com BR-011 e BR-012 novas (FR-006, QR-001).

## Premissas

- **A-001:** o Work 0015 está integrado e expõe a lista de evidências com `id`, `valor` e `unidade` para o estudo e para cada ideia.
- **A-002:** 2 a 4 fatores multiplicados bastam para expressar a perda mensal das ideias do nicho de PME, e o LLM declara a unidade de cada fator.
- **A-003:** uma regeração por documento é o limite de custo aceito pelo operador.

## Componentes afetados

- `src/domain/types.ts` — `setupFee`, premissas e bloco de valor.
- `src/application/value.ts` (novo), `src/application/generation.ts`, `src/application/prompts.ts` — premissas, cálculo, `dataBlock` e prompts.
- `src/application/verification.ts`, `src/application/generate-study.ts` — guardrail com regeração no estudo e na adição de ideias.
- `src/application/reports.ts`, `src/application/artifacts.ts` — tabelão, CSV e `dados.json`.
- `src/config/runtime.ts`, `src/cli.ts`, `src/infrastructure/http/api.ts`, `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/schema.ts`, `src/infrastructure/repositories.ts`, `drizzle/` — parâmetro de setup ponta a ponta.
- `src/infrastructure/llm-mock.ts` — premissas e seção 11 simuladas.
- `README.md`, `.specs/system.json`, `tests/*` — documentação, reconciliação e testes.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
|---|---|---|
| `FR-001` | US-002, EC-001, SC-001 | teste da validação de fatores, recuperação e fonte |
| `FR-002` | US-001, SC-001 | teste do cálculo de perda, ganho e saldo com valores conhecidos |
| `FR-003` | US-001, EC-004, SC-001 | teste do payback, do caso que não se paga e do retorno em 12 meses |
| `FR-004` | US-004, EC-001, SC-002 | teste do bloco VALOR e das subseções 11.1 a 11.6 |
| `FR-005` | US-004, SC-002 | teste dos prompts com o enquadramento do consultor solo |
| `FR-006` | US-003, EC-002, EC-003, SC-001 | teste da extração de R$, percentual e tempo sem fonte |
| `FR-007` | US-003, SC-001 | teste da regeração única e do registro em issues |
| `FR-008` | US-005, EC-004, SC-001 | teste do setup na CLI, na API, no formulário e na coluna |
| `FR-009` | US-005, SC-002 | teste das colunas de perda mensal e payback no tabelão e na tela |
| `QR-001` | EC-002, SC-004 | teste do conjunto permitido com equivalentes e o título do roadmap |
| `QR-002` | SC-003 | teste do recalibrate lendo o dados.json com a chave nova |
| `QR-003` | SC-002 | teste do modo simulado com seção 11 e sem número sem fonte |
| `QR-004` | SC-003 | teste de estudo antigo aberto com setup padrão e colunas vazias |
