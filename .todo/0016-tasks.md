# Tasks: Cada ideia vira uma proposta de valor com a conta do retorno aberta

**Contract version:** 3
**Work ID:** 0016

## Execution contract

| Component | Purpose |
|-----------|---------|
| `value-engine` | Módulo de cálculo: perda, ganho, saldo, payback e retorno em 12 meses |
| `premises-pipeline` | Chamada de premissas por ideia, validação de fontes e cache próprio |
| `prompts-section` | Enquadramento do consultor solo, bloco VALOR e seção 11 |
| `guardrail` | Extração de números sem fonte e regeração única no estudo e na adição |
| `setup-param` | Parâmetro setupFee na CLI, na API, no formulário, no banco e na chave de cache |
| `value-artifacts` | Perda mensal e payback no tabelão, no CSV, no dados.json e no ranking |
| `mock-docs` | Modo simulado determinístico, README, seção 11 e reconciliação da spec |

## Global gates
- [ ] `bun test` — a suíte completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.
- [ ] `bunx eslint . && bunx prettier --check .` — lint e formatação passam nos arquivos do work.

### [x] [1.1] O módulo de valor calcula perda, ganho, saldo e retorno

**Requirement:** FR-002
**Depends on:** none
**Behavior:** o módulo novo recebe os fatores, a recuperação, o setup e a mensalidade e devolve perda mensal (produto dos fatores), ganho mensal (perda vezes recuperação), saldo (ganho menos mensalidade) e retorno em 12 meses (12 vezes ganho menos setup menos 12 mensalidades)
**Components:** value-engine
**Files:** `src/application/value.ts`, `tests/value.test.ts`, `tests/value-cases.test.ts`
**Implementation files:** `src/application/value.ts`
**Test files:** `tests/value-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/value-cases.test.ts -t "FR-002"` — sem o módulo de valor a perda de 20, 4 e 35 não existe e a asserção dos 2800 falha

**Implementation:**
1. Escrever o teste que falha (RED): fatores 20, 4 e 35 com recuperação 0.5, setup 1500 e mensalidade 350 dão perda 2800, ganho 1400, saldo 1050 e retorno 11100
2. Criar value.ts com o cálculo puro e determinístico (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/value-cases.test.ts -t "FR-002"` — a perda é o produto dos fatores, o ganho é a perda vezes a recuperação e o saldo é o ganho menos a mensalidade

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.2] O payback fica nulo quando a solução não se paga

**Requirement:** FR-003
**Depends on:** none
**Behavior:** o payback é o setup dividido pelo saldo mensal com 2 casas, fica nulo quando o saldo é menor ou igual a zero e o setup zero com saldo positivo dá payback zero
**Components:** value-engine
**Files:** `src/application/value.ts`, `tests/value-payback.test.ts`, `tests/value-payback-cases.test.ts`
**Implementation files:** `src/application/value.ts`
**Test files:** `tests/value-payback-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/value-payback-cases.test.ts -t "FR-003"` — sem a regra do saldo o payback de um ganho abaixo da mensalidade sai positivo e a asserção do nulo falha

**Implementation:**
1. Escrever o teste que falha (RED): ganho menor ou igual à mensalidade devolve payback nulo, setup 1500 com saldo 1050 dá 1.43 e setup zero com saldo positivo dá zero
2. Calcular o payback com 2 casas e o nulo no value.ts (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/value-payback.test.ts -t "FR-003"` — o payback sai com 2 casas, é nulo com saldo não positivo e zero com setup zero e saldo positivo

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.3] A chamada de premissas valida fatores, recuperação e fonte

**Requirement:** FR-001
**Depends on:** none
**Behavior:** o pipeline pede ao LLM de 2 a 4 fatores positivos com unidade e uma recuperação entre 0 e 1, aceita fonte que é id de evidência existente no estudo ou `INFERENCE`, converte fonte inexistente para `INFERENCE` com registro em `issues`, repete a chamada uma vez com JSON inválido e a ideia segue sem bloco de valor se a segunda falhar
**Components:** premises-pipeline
**Files:** `src/application/premises.ts`, `src/application/generate-study.ts`, `src/domain/types.ts`, `tests/premises.test.ts`, `tests/premises-cases.test.ts`
**Implementation files:** `src/application/premises.ts`, `src/application/generate-study.ts`, `src/domain/types.ts`
**Test files:** `tests/premises-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/premises-cases.test.ts -t "FR-001"` — sem a validação a premissa com fonte E42 inexistente passa adiante e a asserção da correção para INFERENCE falha

**Implementation:**
1. Escrever o teste que falha (RED): 2 a 4 fatores positivos, recuperação entre 0 e 1, fonte válida passa, E42 inexistente vira INFERENCE com issue e JSON inválido duas vezes deixa a ideia sem valor
2. Criar premises.ts com prompt, parse, validação e cache próprio por ideia e chamar no pipeline do estudo e da adição (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/premises.test.ts -t "FR-001"` — os fatores e a recuperação passam na faixa, a fonte órfã vira INFERENCE com issue e a falha dupla segue sem bloco de valor

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.4] O dataBlock traz o bloco VALOR e o plano ganha a seção 11

**Requirement:** FR-004
**Depends on:** none
**Behavior:** o `dataBlock` traz o bloco VALOR com cada premissa, sua fonte e os números calculados, o resumo executivo abre com a proposta em uma frase, a perda mensal e o payback, e o documento tem as 11 seções com a seção 11 nas subseções 11.1 a 11.6; sem evidência no estudo as premissas saem com fonte INFERENCE e o documento diz que a conta inteira é estimativa a confirmar
**Components:** prompts-section
**Files:** `src/application/prompts.ts`, `src/application/generation.ts`, `tests/value-block.test.ts`, `tests/value-block-cases.test.ts`
**Implementation files:** `src/application/prompts.ts`, `src/application/generation.ts`
**Test files:** `tests/value-block-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/value-block-cases.test.ts -t "FR-004"` — sem o bloco VALOR o texto enviado ao LLM não traz as premissas e a asserção da seção 11 falha

**Implementation:**
1. Escrever o teste que falha (RED): dataBlock com premissas e números, documento simulado com as 11 seções e as subseções 11.1 a 11.6, resumo com perda e payback, e estudo sem evidência com fonte INFERENCE em cada premissa
2. Estender o DOC_SYSTEM_PROMPT e o DOC_SECTIONS para 11 títulos e montar o bloco VALOR no dataBlock (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/value-block.test.ts -t "FR-004"` — o bloco VALOR lista premissas com fonte e números e o plano tem as 11 seções com as 6 subseções da seção 11

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.5] Os prompts enquadram o consultor solo e proíbem o plano de startup

**Requirement:** FR-005
**Depends on:** none
**Behavior:** os prompts de ideias e de documento descrevem o operador como consultor solo que implanta automação com n8n, WhatsApp e IA em até 2 semanas e cobra setup mais mensalidade, e proíbem plano de software próprio, equipe de vendas, expansão regional e LTV/CAC
**Components:** prompts-section
**Files:** `src/application/prompts.ts`, `tests/solo-framing.test.ts`, `tests/solo-framing-cases.test.ts`
**Implementation files:** `src/application/prompts.ts`
**Test files:** `tests/solo-framing-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/solo-framing-cases.test.ts -t "FR-005"` — sem o enquadramento o prompt de ideias não cita o consultor solo e a asserção da proibição falha

**Implementation:**
1. Escrever o teste que falha (RED): os dois prompts citam consultor solo, n8n, WhatsApp, 2 semanas e setup mais mensalidade e vetam software próprio, equipe de vendas, expansão regional e LTV/CAC
2. Reescrever IDEAS_SYSTEM_PROMPT e DOC_SYSTEM_PROMPT com o enquadramento (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/solo-framing.test.ts -t "FR-005"` — os prompts trazem o enquadramento do consultor solo e as quatro proibições

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.6] O guardrail extrai cada número sem fonte do documento

**Requirement:** FR-006
**Depends on:** none
**Behavior:** o guardrail extrai do documento os valores em R$, os percentuais e as quantidades de minutos, horas, dias, semanas ou meses, marca como sem fonte o que não está no conjunto permitido nem na mesma linha de `[INFERENCE]`, e o conjunto permitido inclui os medidos, os calculados, os valores das evidências, os das premissas, o ticket, o setup, os equivalentes anuais e o 90 do título do roadmap
**Components:** guardrail
**Files:** `src/application/verification.ts`, `tests/value-guardrail.test.ts`, `tests/value-guardrail-cases.test.ts`
**Implementation files:** `src/application/verification.ts`
**Test files:** `tests/value-guardrail-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/value-guardrail-cases.test.ts -t "FR-006"` — sem a extração o "R$ 3.000 por ano" fora do bloco passa e a asserção da marcação falha

**Implementation:**
1. Escrever o teste que falha (RED): R$ fora do bloco é marcado, "R$ 350,00" e "350 reais" contam como o permitido 350, numeração de seção, lista e tabela não é verificada e o 90 do roadmap passa
2. Criar a extração de R$, percentual e tempo com normalização de formato e a lista de exclusões estruturais (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/value-guardrail.test.ts -t "FR-006"` — o número inventado é marcado, o equivalente de formato passa e a numeração estrutural não é verificada

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.7] O documento com número sem fonte é regerado uma vez

**Requirement:** FR-007
**Depends on:** none
**Behavior:** o pipeline pede um documento novo uma vez com a lista dos números sem fonte, grava a segunda versão mesmo que ainda viole e registra cada número sem fonte restante em `issues` com o nome da ideia, no estudo e na adição de ideias
**Components:** guardrail
**Files:** `src/application/generate-study.ts`, `src/application/verification.ts`, `tests/value-regen.test.ts`, `tests/value-regen-cases.test.ts`
**Implementation files:** `src/application/generate-study.ts`
**Test files:** `tests/value-regen-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/value-regen-cases.test.ts -t "FR-007"` — sem a regeração o LLM simulado que inventa na primeira resposta tem o texto gravado e a asserção da segunda chamada falha

**Implementation:**
1. Escrever o teste que falha (RED): primeira versão com número sem fonte pede uma segunda com a lista, a segunda é gravada e a violação restante entra em issues com o nome da ideia
2. Ligar o guardrail ao pipeline de documentos do estudo e da adição com uma única repetição (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/value-regen.test.ts -t "FR-007"` — a regeração acontece uma vez com a lista e a violação restante é gravada com issue nomeada

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.8] O setupFee existe no domínio, no config e na CLI

**Requirement:** FR-008
**Depends on:** none
**Behavior:** o estudo conhece `setupFee` com padrão 1500 e validação de inteiro de 0 a 100000 e a CLI aceita `--setup` e `--implantacao` com a mesma validação
**Components:** setup-param
**Files:** `src/domain/types.ts`, `src/config/runtime.ts`, `src/cli.ts`, `tests/setup-cli.test.ts`, `tests/setup-cli-cases.test.ts`
**Implementation files:** `src/domain/types.ts`, `src/config/runtime.ts`, `src/cli.ts`
**Test files:** `tests/setup-cli-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/setup-cli-cases.test.ts -t "FR-008"` — sem o parâmetro o config resolvido não traz `setupFee` e a asserção do padrão 1500 falha

**Implementation:**
1. Escrever o teste que falha (RED): padrão 1500, inteiro de 0 a 100000 recusado fora da faixa e CLI com os dois aliases
2. Declarar `setupFee` no StudyConfig, validar no resolveStudyConfig e ler as flags na CLI (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/setup-cli.test.ts -t "FR-008"` — o setup padrão é 1500, fora de 0 a 100000 é recusado e os dois aliases chegam ao config

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.9] O setupFee existe na API e no formulário de novo estudo

**Requirement:** EC-004
**Depends on:** 1.8
**Behavior:** a API valida `setupFee` com 422 e detalhe Zod na criação, devolve o valor no detalhe do estudo e o formulário `/new` tem o campo com padrão 1500
**Components:** setup-param
**Files:** `src/infrastructure/http/api.ts`, `src/infrastructure/http/ui/routes.tsx`, `src/infrastructure/http/ui/pages.tsx`, `tests/setup-form.test.ts`, `tests/setup-form-cases.test.ts`
**Implementation files:** `src/infrastructure/http/api.ts`, `src/infrastructure/http/ui/routes.tsx`, `src/infrastructure/http/ui/pages.tsx`
**Test files:** `tests/setup-form-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/setup-form-cases.test.ts -t "FR-008"` — sem o campo a criação com setup 1800 não grava o valor e a asserção do detalhe falha

**Implementation:**
1. Escrever o teste que falha (RED): API com setup 1800 grava e devolve, valor fora da faixa responde 422 e o formulário traz o campo com 1500
2. Estender o schema da API, a rota de criação e o formulário `/new` (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/setup-form.test.ts -t "FR-008"` — a API grava e devolve o setup, recusa fora da faixa com 422 e o formulário mostra o campo

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.10] O setupFee persiste no banco com migração aditiva

**Requirement:** QR-004
**Depends on:** 1.8
**Behavior:** a coluna `setup_fee` guarda o valor com migração aditiva, o estudo antigo abre com 1500 e a chave de cache do documento inclui o setup
**Components:** setup-param
**Files:** `src/infrastructure/schema.ts`, `src/infrastructure/repositories.ts`, `src/application/study-service.ts`, `drizzle/0007_study_setup_fee.sql`, `drizzle/meta/0007_snapshot.json`, `drizzle/meta/_journal.json`, `tests/setup-persist.test.ts`, `tests/setup-persist-cases.test.ts`
**Implementation files:** `src/infrastructure/schema.ts`, `src/infrastructure/repositories.ts`, `src/application/study-service.ts`
**Test files:** `tests/setup-persist-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/setup-persist-cases.test.ts -t "FR-008"` — sem a coluna o estudo gravado volta sem setup e a asserção do 1800 persistido falha

**Implementation:**
1. Escrever o teste que falha (RED): estudo com setup 1800 persiste e volta, estudo antigo sem a coluna abre com 1500 e a chave do documento muda com o setup
2. Adicionar a coluna com migração gerada, gravar e ler o valor e incluir o setup na chave de cache (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/setup-persist.test.ts -t "FR-008"` — o setup persiste, o estudo antigo abre com 1500 e a troca de setup invalida o documento em cache

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.11] O tabelão, o CSV e o dados.json mostram perda e payback

**Requirement:** FR-009
**Depends on:** none
**Behavior:** o tabelão markdown e o CSV ganham as colunas de perda mensal e payback, o `dados.json` ganha a chave aditiva `valor` por ideia com premissas, recuperação, perda, ganho, saldo, payback e retorno, as chaves já existentes não mudam de nome nem de tipo e o `recalibrate` continua lendo o arquivo com a chave nova
**Components:** value-artifacts
**Files:** `src/application/reports.ts`, `src/application/dados.ts`, `src/application/artifacts.ts`, `tests/value-artifacts.test.ts`, `tests/value-artifacts-cases.test.ts`
**Implementation files:** `src/application/reports.ts`, `src/application/dados.ts`, `src/application/artifacts.ts`
**Test files:** `tests/value-artifacts-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/value-artifacts-cases.test.ts -t "FR-009"` — sem as colunas o tabelão não traz perda mensal e a asserção do CSV com `perda_mes` falha

**Implementation:**
1. Escrever o teste que falha (RED): tabelão e CSV com as duas colunas novas, dados.json com a chave `valor` aditiva e recalibrate lendo o arquivo novo
2. Estender `StudyIdea` com o valor calculado, o tabelão, o CSV e o dados.json (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/value-artifacts.test.ts -t "FR-009"` — a perda e o payback aparecem no tabelão, no CSV e no dados.json sem mudar as chaves antigas

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.12] A API e o ranking mostram perda mensal e payback

**Requirement:** QR-002
**Depends on:** 1.11
**Behavior:** o detalhe da API traz `value` por avaliação, o ranking mostra perda mensal e payback por ideia, as chaves já existentes não mudam de nome nem de tipo e o `recalibrate` continua lendo o arquivo com a chave nova
**Components:** value-artifacts
**Files:** `src/infrastructure/http/api.ts`, `src/infrastructure/http/ui/pages.tsx`, `src/domain/types.ts`, `tests/value-ranking.test.ts`, `tests/value-ranking-cases.test.ts`
**Implementation files:** `src/infrastructure/http/api.ts`, `src/infrastructure/http/ui/pages.tsx`, `src/domain/types.ts`
**Test files:** `tests/value-ranking-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/value-ranking-cases.test.ts -t "FR-009"` — sem o campo a avaliação da API não traz `value` e a asserção da coluna no ranking falha

**Implementation:**
1. Escrever o teste que falha (RED): API com `value` por avaliação e ranking com as duas colunas
2. Expor o valor calculado na API e desenhar as colunas no ranking (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/value-ranking.test.ts -t "FR-009"` — a API devolve perda e payback por ideia e o ranking mostra as duas colunas

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.13] O modo simulado produz premissas, valor e seção 11 sem número sem fonte

**Requirement:** QR-003
**Depends on:** none
**Behavior:** o LLM simulado devolve premissas determinísticas com fontes existentes ou INFERENCE, números de valor coerentes com o cálculo e a seção 11 completa, e nenhum documento simulado deixa número sem fonte em `issues`
**Components:** mock-docs
**Files:** `src/infrastructure/llm-mock.ts`, `tests/mock-value.test.ts`, `tests/mock-value-cases.test.ts`
**Implementation files:** `src/infrastructure/llm-mock.ts`
**Test files:** `tests/mock-value-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/mock-value-cases.test.ts -t "QR-003"` — sem o mock de valor o documento simulado não tem a seção 11 e a asserção da conta coerente falha

**Implementation:**
1. Escrever o teste que falha (RED): duas execuções simuladas dão as mesmas premissas e a conta do bloco VALOR confere com o módulo de valor
2. Ensinar o LLM simulado a responder premissas e documentos com valor e seção 11 determinísticos (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/mock-value.test.ts -t "QR-003"` — o modo simulado repete premissas e seção 11 e a conta confere com o cálculo

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.14] O README documenta o setup, a seção 11 e a spec é reconciliada

**Requirement:** SC-004
**Depends on:** none
**Behavior:** o README ganha a seção 11, o parâmetro de setup e o guardrail com regeração, e a `.specs/system.json` descreve as premissas com fonte, o cálculo de perda, ganho e payback pelo código, a seção 11, o guardrail com regeração, o parâmetro de setup e as regras BR-011 e BR-012 com o texto novo
**Components:** mock-docs
**Files:** `README.md`, `.specs/system.json`, `tests/readme-value.test.ts`, `tests/readme-value-cases.test.ts`
**Implementation files:** `README.md`, `.specs/system.json`
**Test files:** `tests/readme-value-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/readme-value-cases.test.ts -t "SC-004"` — sem a documentação o README não cita a seção 11 e a asserção da spec com BR-011 nova falha

**Implementation:**
1. Escrever o teste que falha (RED): README com seção 11, setup e guardrail e spec válida com as regras novas
2. Documentar no README e reconciliar a system.json com `pwn validate` limpo (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/readme-value.test.ts -t "SC-004"` — o README cobre a seção 11, o setup e o guardrail e a spec passa na validação

**Visual:** N/A
**Documentation:** N/A
