# Tasks: Port do goodbizz para Bun: CLI, API, Web e imagem Docker

**Contract version:** 3
**Work ID:** 0001

## Execution contract

| Component | Purpose |
|-----------|---------|
| `ops` | Toolchain, empacotamento, pipeline e ambiente |
| `config` | Configuracao validada e redacao de segredos |
| `domain` | Tipos, portas, erros e regras puras de dor |
| `llm` | Adapter do provedor LLM e extracao de JSON |
| `decider` | Adapter do decisor System One |
| `application` | Casos de uso que orquestram dominio e portas |
| `reports` | Relatorios deterministas e render |
| `verification` | Guardrail estrutural e normalizacao |
| `persistence` | Esquema Drizzle, repositorios e cache |
| `http` | API Hono, interface web e seguranca de sessao |
| `cli` | Interface de linha de comando |

## Global gates
- [ ] `bun test` — a suite completa passa com exit 0.
- [ ] `bun run check` — o typecheck estrito passa com exit 0.
- [ ] `bunx eslint .` — o lint passa sem erro.
- [ ] `bunx prettier --check .` — a formatacao esta conforme.

### [ ] [1.1] Toolchain, tipo estrito e gates locais

**Requirement:** QR-006
**Depends on:** none
**Behavior:** O projeto passa a ter scripts unicos de check, lint, format e teste sobre a stack fixada, com tsconfig estrito e JSX do Hono
**Components:** ops
**Files:** `package.json`, `tsconfig.json`, `bunfig.toml`, `tests/toolchain.test.ts`, `eslint.config.js`, `.prettierrc.json`, `.editorconfig`, `.env.example`, `.gitignore`, `.dockerignore`
**Implementation files:** `package.json`, `tsconfig.json`, `bunfig.toml`
**Test files:** `tests/toolchain.test.ts`

**RED:**
- `bun test tests/toolchain.test.ts` — o teste que exige as quatro chaves canonicas no .env.example acusa a ausencia

**Implementation:**
1. Instalar as dependencias da stack e fixar os scripts de check, lint, format e teste
2. Fixar o tsconfig estrito com jsxImportSource hono/jsx

**ACs:**
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint .` — o lint passa sem erro

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.2] Dominio: tipos, portas e erros

**Requirement:** QR-005
**Depends on:** 1.1
**Behavior:** Existem tipos de dominio, portas de LLM, decisor, repositorio e cache, e erros tipados, todos sem dependencia de infraestrutura
**Components:** domain
**Files:** `src/domain/types.ts`, `src/domain/ports.ts`, `src/domain/errors.ts`, `tests/domain.test.ts`
**Implementation files:** `src/domain/types.ts`, `src/domain/ports.ts`, `src/domain/errors.ts`
**Test files:** `tests/domain.test.ts`

**RED:**
- `bun test tests/domain.test.ts` — o teste que importa os tipos de dominio acusa a falta dos modulos

**Implementation:**
1. Modelar os tipos de dominio e o mapeamento de erro para HTTP
2. Declarar as portas de LLM, decisor, repositorio e cache

**ACs:**
- [ ] `bun test tests/domain.test.ts` — os tipos e o mapeamento de erro se comportam como declarado

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.3] Configuracao de ambiente validada

**Requirement:** QR-001
**Depends on:** 1.2
**Behavior:** As chaves LLM_API_URL, LLM_API_KEY, DECISION_API_URL, DECISION_API_KEY, PORT, DATABASE_URL, LOG_LEVEL, APP_ENV e SESSION_SECRET sao validadas no startup e a CLI pode sobrepor o ambiente
**Components:** config
**Files:** `src/config/env.ts`, `src/config/runtime.ts`, `tests/env.test.ts`
**Implementation files:** `src/config/env.ts`, `src/config/runtime.ts`
**Test files:** `tests/env.test.ts`

**RED:**
- `bun test tests/env.test.ts` — o teste de validacao de ambiente acusa a falta do modulo de configuracao

**Implementation:**
1. Validar o ambiente com Zod e resolver a configuracao da CLI
2. Abortar no startup quando uma chave obrigatoria do modo real falta

**ACs:**
- [ ] `bun test tests/env.test.ts` — chave obrigatoria ausente aborta com mensagem que nao expoe o segredo

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.4] Redacao de segredos em erro e log

**Requirement:** QR-002
**Depends on:** 1.3
**Behavior:** Chaves e tokens sao redigidos de qualquer mensagem de erro ou linha de log antes de sairem do processo
**Components:** config
**Files:** `src/config/redact.ts`, `tests/redaction.test.ts`
**Implementation files:** `src/config/redact.ts`
**Test files:** `tests/redaction.test.ts`

**RED:**
- `bun test tests/redaction.test.ts` — o teste que exige a chave redigida na mensagem acusa a falta do redator

**Implementation:**
1. Implementar a redacao por lista de segredos conhecidos
2. Aplicar a redacao nas mensagens de erro de provedor

**ACs:**
- [ ] `bun test tests/redaction.test.ts` — a chave usada na requisicao nao aparece na mensagem resultante

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.5] Cliente LLM e extracao de JSON tolerante

**Requirement:** EC-002
**Depends on:** 1.2
**Behavior:** O cliente LLM fala chat completions compativel com OpenAI, repete com backoff e extrai JSON de respostas cercadas por texto ou cerca de codigo
**Components:** llm
**Files:** `src/infrastructure/llm.ts`, `src/infrastructure/json.ts`, `tests/llm.test.ts`
**Implementation files:** `src/infrastructure/llm.ts`, `src/infrastructure/json.ts`
**Test files:** `tests/llm.test.ts`

**RED:**
- `bun test tests/llm.test.ts` — o teste de extracao de array cercado por texto acusa a falta da extracao

**Implementation:**
1. Implementar a chamada HTTP com backoff e a mensagem de erro redigida
2. Implementar a extracao tolerante de JSON

**ACs:**
- [ ] `bun test tests/llm.test.ts` — a extracao recupera array cercado por texto e por cerca de codigo

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.6] Adaptadores mock deterministas

**Requirement:** FR-002
**Depends on:** 1.5
**Behavior:** Os adaptadores mock de LLM e de decisor produzem a mesma saida para a mesma entrada, sem tocar a rede
**Components:** llm, decider, domain
**Files:** `src/infrastructure/llm-mock.ts`, `src/infrastructure/decider-mock.ts`, `src/domain/hash.ts`, `tests/mock-determinism.test.ts`
**Implementation files:** `src/infrastructure/llm-mock.ts`, `src/infrastructure/decider-mock.ts`, `src/domain/hash.ts`
**Test files:** `tests/mock-determinism.test.ts`

**RED:**
- `bun test tests/mock-determinism.test.ts` — o teste que compara duas respostas do mock acusa a falta dos adaptadores

**Implementation:**
1. Implementar o hash deterministico compartilhado
2. Implementar os fixtures de LLM e o decisor hash-based

**ACs:**
- [ ] `bun test tests/mock-determinism.test.ts` — a mesma entrada produz a mesma resposta nos dois mocks

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.7] Cliente do decisor System One

**Requirement:** FR-003
**Depends on:** 1.2
**Behavior:** O cliente do decisor normaliza a URL, envia state e questions tipadas, tolera envelopes variados e extrai probabilidade de noul, choice, score e numero
**Components:** decider
**Files:** `src/infrastructure/decider.ts`, `tests/decider.test.ts`
**Implementation files:** `src/infrastructure/decider.ts`
**Test files:** `tests/decider.test.ts`

**RED:**
- `bun test tests/decider.test.ts` — o teste de normalizacao de URL do decisor acusa a falta do cliente

**Implementation:**
1. Normalizar a URL para o endpoint System One
2. Extrair respostas e probabilidades tolerantes a envelopes

**ACs:**
- [ ] `bun test tests/decider.test.ts` — normalizacao, extracao e aborto em erro de autorizacao se comportam como declarado

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.8] Classificacao de dor com limiares

**Requirement:** FR-017
**Depends on:** 1.2
**Behavior:** Quatro sondas em tres parafrases produzem classificacao forte, fraca, indeterminada ou instavel com os limiares calibrados e exigem ao menos tres parafrases
**Components:** domain, application
**Files:** `src/domain/pain.ts`, `src/application/pain-algorithm.ts`, `tests/pain-algorithm.test.ts`
**Implementation files:** `src/domain/pain.ts`, `src/application/pain-algorithm.ts`
**Test files:** `tests/pain-algorithm.test.ts`

**RED:**
- `bun test tests/pain-algorithm.test.ts` — o autoteste de dor acusa a falta do classificador

**Implementation:**
1. Portar as sondas e os limiares calibrados
2. Portar a media, o desvio e o autoteste deterministico

**ACs:**
- [ ] `bun test tests/pain-algorithm.test.ts` — o autoteste classifica forte, fraca, cinzenta e ruidosa como esperado

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.9] Medicao da dor por escolha forcada

**Requirement:** FR-016
**Depends on:** 1.7, 1.8
**Behavior:** Tres redacoes independentes de escolha forcada entre dinheiro direto, reputacao e backoffice produzem probabilidades por opcao e um resultado com escore e rotulo
**Components:** application, decider
**Files:** `src/application/pain-choice.ts`, `tests/pain-choice.test.ts`
**Implementation files:** `src/application/pain-choice.ts`
**Test files:** `tests/pain-choice.test.ts`

**RED:**
- `bun test tests/pain-choice.test.ts` — o teste de agregacao por opcao acusa a falta do medidor

**Implementation:**
1. Portar as tres instrucoes e as opcoes de consequencia
2. Agregar as probabilidades por opcao e derivar o rotulo

**ACs:**
- [ ] `bun test tests/pain-choice.test.ts` — a agregacao por opcao soma uma unidade por opcao escolhida

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.10] Avaliacao de ideias, indice e tier

**Requirement:** FR-019
**Depends on:** 1.8, 1.9
**Behavior:** Cada ideia e avaliada em indicadores e negocio com confiancas, produzindo indice de acao, tier, agrupamento por natureza da dor e resumo com medias
**Components:** application
**Files:** `src/application/evaluate.ts`, `src/application/summary.ts`, `tests/evaluate.test.ts`
**Implementation files:** `src/application/evaluate.ts`, `src/application/summary.ts`
**Test files:** `tests/evaluate.test.ts`

**RED:**
- `bun test tests/evaluate.test.ts` — o teste do indice de acao acusa a falta do modulo de avaliacao

**Implementation:**
1. Portar as perguntas de indicador e de negocio e os extratores
2. Portar indice, tier, agrupamento e medias

**ACs:**
- [ ] `bun test tests/evaluate.test.ts` — indice, tier, grupos de dor e medias batem com os valores esperados

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.11] Prompts e bloco de dados medidos

**Requirement:** FR-013
**Depends on:** 1.5, 1.10
**Behavior:** Os prompts de brief, ideias e documento carregam o bloco de dados medidos com todos os numeros e proibem o modelo de criar numeros de mercado
**Components:** application, llm
**Files:** `src/application/prompts.ts`, `src/application/generation.ts`, `tests/generation.test.ts`
**Implementation files:** `src/application/prompts.ts`, `src/application/generation.ts`
**Test files:** `tests/generation.test.ts`

**RED:**
- `bun test tests/generation.test.ts` — o teste que exige todos os numeros no bloco acusa a falta da geracao

**Implementation:**
1. Portar os tres prompts e as escalas
2. Portar o bloco de dados medidos e as chamadas de geracao

**ACs:**
- [ ] `bun test tests/generation.test.ts` — o bloco contem todos os numeros e o mock gera documento com as dez secoes

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.12] Relatorios deterministas

**Requirement:** FR-014
**Depends on:** 1.10
**Behavior:** Indice, tabelao markdown e CSV sao deterministicos, ordenados pelo indice de acao, e os nomes de pasta seguem o ranking com slug estavel
**Components:** reports
**Files:** `src/application/reports.ts`, `tests/reports.test.ts`
**Implementation files:** `src/application/reports.ts`
**Test files:** `tests/reports.test.ts`

**RED:**
- `bun test tests/reports.test.ts` — o teste de alinhamento do tabelao acusa a falta dos relatorios

**Implementation:**
1. Portar slug, pasta e aviso de escopo
2. Portar o indice, o tabelao markdown e o CSV

**ACs:**
- [ ] `bun test tests/reports.test.ts` — o tabelao tem colunas alinhadas e o CSV e estavel entre execucoes

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.13] Artefatos do estudo em disco

**Requirement:** FR-020
**Depends on:** 1.12
**Behavior:** A arvore de artefatos do estudo e o dados.json com as chaves do baseline sao gravados de forma deterministica
**Components:** reports, application
**Files:** `src/application/artifacts.ts`, `src/application/dados.ts`, `tests/artifacts.test.ts`
**Implementation files:** `src/application/artifacts.ts`, `src/application/dados.ts`
**Test files:** `tests/artifacts.test.ts`

**RED:**
- `bun test tests/artifacts.test.ts` — o teste da arvore de artefatos acusa a falta do gravador

**Implementation:**
1. Gravar brief, tabelao, CSV e pastas por ideia
2. Serializar e ler o dados.json no esquema do baseline

**ACs:**
- [ ] `bun test tests/artifacts.test.ts` — a arvore esperada e as chaves do dados.json sao gravadas

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.14] Render de Markdown para HTML

**Requirement:** FR-015
**Depends on:** 1.2
**Behavior:** O renderizador converte markdown em HTML com titulos, listas, tabelas, citacao e sanitizacao de links perigosos
**Components:** reports
**Files:** `src/application/render.ts`, `tests/render.test.ts`
**Implementation files:** `src/application/render.ts`
**Test files:** `tests/render.test.ts`

**RED:**
- `bun test tests/render.test.ts` — o teste de sanitizacao de link acusa a falta do renderizador

**Implementation:**
1. Portar o conversor de blocos e inline
2. Portar a sanitizacao de links e o documento HTML completo

**ACs:**
- [ ] `bun test tests/render.test.ts` — link com esquema javascript e neutralizado e a tabela vira elemento HTML

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.15] PDF opcional via Chromium

**Requirement:** EC-005
**Depends on:** 1.14
**Behavior:** O PDF e gerado por Chromium headless quando disponivel; a ausencia do binario mantem o HTML e devolve mensagem explicativa
**Components:** reports
**Files:** `src/application/pdf.ts`, `tests/pdf.test.ts`
**Implementation files:** `src/application/pdf.ts`
**Test files:** `tests/pdf.test.ts`

**RED:**
- `bun test tests/pdf.test.ts` — o teste da mensagem de ausencia do Chromium acusa a falta do modulo de PDF

**Implementation:**
1. Detectar o binario do Chromium no sistema
2. Executar a impressao para PDF com timeout e mensagem de falha

**ACs:**
- [ ] `bun test tests/pdf.test.ts` — sem Chromium a mensagem explica a ausencia e o HTML permanece

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.16] Guardrail numerico dos documentos

**Requirement:** FR-008
**Depends on:** 1.2
**Behavior:** O guardrail confere os dez titulos obrigatorios, acentos, alinhamento de tabela, presenca dos numeros medidos e das frases exigidas
**Components:** verification
**Files:** `src/application/verification.ts`, `tests/verification.test.ts`
**Implementation files:** `src/application/verification.ts`
**Test files:** `tests/verification.test.ts`

**RED:**
- `bun test tests/verification.test.ts` — o teste de secao obrigatoria faltante acusa a falta do guardrail

**Implementation:**
1. Portar a lista de secoes e as variantes de numero
2. Portar a checagem de tabela, acento e frases

**ACs:**
- [ ] `bun test tests/verification.test.ts` — documento conforme passa e documento com defeitos acumula achados

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.17] Normalizacao de acentos

**Requirement:** EC-003
**Depends on:** 1.16
**Behavior:** A normalizacao remove diacriticos de cada texto e de cada arquivo markdown de uma arvore de saida
**Components:** verification
**Files:** `src/application/normalize.ts`, `tests/normalize.test.ts`
**Implementation files:** `src/application/normalize.ts`
**Test files:** `tests/normalize.test.ts`

**RED:**
- `bun test tests/normalize.test.ts` — o teste que exige texto sem diacriticos acusa a falta da normalizacao

**Implementation:**
1. Implementar a remocao de diacriticos
2. Aplicar a normalizacao aos arquivos markdown da arvore

**ACs:**
- [ ] `bun test tests/normalize.test.ts` — o texto normalizado nao contem diacriticos e os arquivos alterados sao listados

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.18] Esquema, cliente SQLite e migracoes

**Requirement:** FR-009
**Depends on:** 1.2
**Behavior:** O esquema Drizzle cobre estudos, ideias avaliadas e cache, e o cliente SQLite aplica as migracoes geradas sem SQL cru
**Components:** persistence
**Files:** `src/infrastructure/schema.ts`, `src/infrastructure/db.ts`, `drizzle.config.ts`, `tests/repository.test.ts`
**Implementation files:** `src/infrastructure/schema.ts`, `src/infrastructure/db.ts`, `drizzle.config.ts`
**Test files:** `tests/repository.test.ts`

**RED:**
- `bun test tests/repository.test.ts` — o teste de ida e volta do estudo acusa a falta do repositorio

**Implementation:**
1. Modelar o esquema e abrir o cliente SQLite
2. Aplicar as migracoes geradas de forma aditiva

**ACs:**
- [ ] `bun test tests/repository.test.ts` — as tres tabelas existem e as migracoes aplicam sem erro
- [ ] `bunx drizzle-kit generate` — a migracao e gerada sem erro

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.19] Repositorios de estudo e de cache

**Requirement:** FR-010
**Depends on:** 1.18
**Behavior:** O repositorio de estudos grava e le estudo com avaliacoes, e o cache deriva a chave do hash dos parametros, grava e reaproveita respostas tolerando cache corrompido
**Components:** persistence, application
**Files:** `src/infrastructure/repositories.ts`, `src/infrastructure/cache-repository.ts`, `src/application/cache.ts`, `tests/cache.test.ts`
**Implementation files:** `src/infrastructure/repositories.ts`, `src/infrastructure/cache-repository.ts`, `src/application/cache.ts`
**Test files:** `tests/cache.test.ts`

**RED:**
- `bun test tests/cache.test.ts` — o teste de reaproveitamento de chave acusa a falta do repositorio e do cache

**Implementation:**
1. Implementar o repositorio de estudos e o cache por chave hash
2. Tolerar cache ausente ou corrompido tratando como vazio

**ACs:**
- [ ] `bun test tests/cache.test.ts` — estudo e avaliacoes voltam do SQLite e a reexecucao reaproveita chaves gravadas

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.20] Pipeline completo de estudo

**Requirement:** FR-018
**Depends on:** 1.11, 1.13, 1.15, 1.17, 1.19
**Behavior:** O pipeline executa brief, ideias, avaliacao concorrente, documentos, relatorios e PDF opcional, gravando artefatos e persistindo o estudo com opcao de parar apos avaliar
**Components:** application, persistence
**Files:** `src/application/generate-study.ts`, `src/application/study-service.ts`, `tests/generate-study.test.ts`
**Implementation files:** `src/application/generate-study.ts`, `src/application/study-service.ts`
**Test files:** `tests/generate-study.test.ts`

**RED:**
- `bun test tests/generate-study.test.ts` — o teste que exige a arvore de artefatos acusa a falta do pipeline

**Implementation:**
1. Orquestrar as etapas com limite de concorrencia e cache
2. Persistir o estudo e gravar os artefatos

**ACs:**
- [ ] `bun test tests/generate-study.test.ts` — modo mock gera os seis artefatos e persiste as avaliacoes ordenadas

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.21] Diagnostico de sondas

**Requirement:** FR-006
**Depends on:** 1.7, 1.8
**Behavior:** O diagnostico mede afirmacao e negacao por sonda e parafrase, calcula media, desvio e contradicao e deriva o codigo de saida das sondas uteis
**Components:** application, decider
**Files:** `src/application/diagnose.ts`, `tests/diagnose.test.ts`
**Implementation files:** `src/application/diagnose.ts`
**Test files:** `tests/diagnose.test.ts`

**RED:**
- `bun test tests/diagnose.test.ts` — o teste de veredito por sonda acusa a falta do diagnostico

**Implementation:**
1. Portar as negacoes e o calculo de contradicao
2. Emitir o relatorio por sonda e o codigo de saida

**ACs:**
- [ ] `bun test tests/diagnose.test.ts` — sondas uteis, contraditorias e instaveis sao classificadas corretamente

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.22] Recalibracao de limiares

**Requirement:** FR-007
**Depends on:** 1.8, 1.13
**Behavior:** A recalibracao carrega dados.json rotulados com zona morta, avalia a grade de limiares e ordena por falso forte, acerto e escalonamento
**Components:** application, reports
**Files:** `src/application/recalibrate.ts`, `tests/recalibrate.test.ts`
**Implementation files:** `src/application/recalibrate.ts`
**Test files:** `tests/recalibrate.test.ts`

**RED:**
- `bun test tests/recalibrate.test.ts` — o teste da melhor combinacao de limiares acusa a falta da recalibracao

**Implementation:**
1. Portar o caso rotulado e a carga com zona morta
2. Implementar a busca em grade e a ordenacao

**ACs:**
- [ ] `bun test tests/recalibrate.test.ts` — a grade devolve o trio esperado e conta falso forte corretamente

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.23] API HTTP de estudos

**Requirement:** FR-004
**Depends on:** 1.20, 1.21, 1.22, 1.18
**Behavior:** A API cria, lista, detalha e serve artefatos de estudos, executa diagnostico e recalibracao e converte erros de dominio em respostas sem stack trace
**Components:** http, persistence
**Files:** `src/infrastructure/http/api.ts`, `src/infrastructure/http/app.ts`, `src/infrastructure/http/errors.ts`, `tests/api.test.ts`
**Implementation files:** `src/infrastructure/http/api.ts`, `src/infrastructure/http/app.ts`, `src/infrastructure/http/errors.ts`
**Test files:** `tests/api.test.ts`

**RED:**
- `bun test tests/api.test.ts` — o teste de criacao de estudo pela API acusa a falta das rotas

**Implementation:**
1. Montar o sub-app de API com validacao Zod na borda
2. Mapear erros de dominio e redigir detalhes internos

**ACs:**
- [ ] `bun test tests/api.test.ts` — criacao responde 201, detalhe 200 e payload invalido 422

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.24] Interface web

**Requirement:** FR-005
**Depends on:** 1.23
**Behavior:** A interface renderiza lista, formulario e detalhe de estudo consumindo a propria API na mesma origem
**Components:** http
**Files:** `src/infrastructure/http/ui/routes.tsx`, `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/layout.tsx`, `tests/ui.test.ts`
**Implementation files:** `src/infrastructure/http/ui/routes.tsx`, `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/layout.tsx`
**Test files:** `tests/ui.test.ts`

**RED:**
- `bun test tests/ui.test.ts` — o teste da pagina inicial acusa a falta das rotas de interface

**Implementation:**
1. Montar o layout e as paginas de lista, formulario e detalhe
2. Consumir a API por fetch na mesma origem

**ACs:**
- [ ] `bun test tests/ui.test.ts` — a pagina inicial responde 200 com o formulario e o detalhe mostra o ranking

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.25] CSRF e sessao na interface

**Requirement:** QR-003
**Depends on:** 1.24
**Behavior:** Toda rota de interface que muda estado exige mesma origem e token CSRF double-submit assinado, comparado em tempo constante
**Components:** http
**Files:** `src/infrastructure/http/ui/security.ts`, `src/infrastructure/http/ui/context.d.ts`, `tests/csrf.test.ts`
**Implementation files:** `src/infrastructure/http/ui/security.ts`, `src/infrastructure/http/ui/context.d.ts`
**Test files:** `tests/csrf.test.ts`

**RED:**
- `bun test tests/csrf.test.ts` — o teste de origem invalida acusa a falta dos middlewares de seguranca

**Implementation:**
1. Emitir o cookie assinado e comparar o token em tempo constante
2. Recusar origem ou token invalido com 403

**ACs:**
- [ ] `bun test tests/csrf.test.ts` — POST sem mesma origem ou sem token valido responde 403

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.26] Health, readiness e imagem Docker

**Requirement:** FR-011
**Depends on:** 1.23, 1.24
**Behavior:** O servico sobe com liveness que ignora o banco e readiness que executa select 1, e a imagem Docker multi-stage o executa com usuario nao-root e healthcheck
**Components:** http, ops
**Files:** `src/infrastructure/http/health.ts`, `src/index.ts`, `Dockerfile`, `tests/health.test.ts`, `docker-compose.yml`
**Implementation files:** `src/infrastructure/http/health.ts`, `src/index.ts`, `Dockerfile`
**Test files:** `tests/health.test.ts`

**RED:**
- `bun test tests/health.test.ts` — o teste de readiness com banco indisponivel acusa a falta das rotas de saude

**Implementation:**
1. Implementar liveness, readiness e o shutdown gracioso
2. Escrever o Dockerfile multi-stage com healthcheck

**ACs:**
- [ ] `bun test tests/health.test.ts` — liveness responde ok e readiness responde 503 quando o banco falha
- [ ] `docker build -t goodbizz:test .` — a imagem constroi sem erro

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.27] Workflow de imagem no GitHub Actions

**Requirement:** FR-012
**Depends on:** 1.26
**Behavior:** O workflow cobre qualidade, teste, seguranca e build e constroi e publica a imagem em push para a branch principal e em tags
**Components:** ops
**Files:** `.github/workflows/ci.yml`, `.github/workflows/image.yml`, `tests/workflows.test.ts`
**Implementation files:** `.github/workflows/ci.yml`, `.github/workflows/image.yml`
**Test files:** `tests/workflows.test.ts`

**RED:**
- `bun test tests/workflows.test.ts` — o teste que exige os jobs do workflow acusa a falta dos arquivos de pipeline

**Implementation:**
1. Escrever o workflow de CI com os jobs de qualidade, teste e seguranca
2. Escrever o workflow de imagem com buildx e push condicional

**ACs:**
- [ ] `bun test tests/workflows.test.ts` — os workflows declaram os jobs exigidos e o push para o registry

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.28] CLI unificada

**Requirement:** FR-001
**Depends on:** 1.20, 1.21, 1.22
**Behavior:** A CLI expoe generate, diagnose, recalibrate, serve e help com as flags e aliases do baseline e retorna 0, 1, 2 ou 130 conforme o caso
**Components:** cli
**Files:** `src/cli.ts`, `bin/goodbizz`, `tests/cli.test.ts`
**Implementation files:** `src/cli.ts`, `bin/goodbizz`
**Test files:** `tests/cli.test.ts`

**RED:**
- `bun test tests/cli.test.ts` — o teste de subcomando desconhecido acusa a falta da CLI

**Implementation:**
1. Implementar o parser de subcomandos, flags e aliases
2. Mapear os codigos de saida e a ajuda

**ACs:**
- [ ] `bun test tests/cli.test.ts` — generate mock grava artefatos e subcomando desconhecido retorna 2

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.29] Suite e smoke end-to-end

**Requirement:** SC-001
**Depends on:** 1.20, 1.23, 1.24, 1.28
**Behavior:** A suite cobre dominio, adapters, casos de uso, persistencia, API e interface, incluindo um smoke em modo mock que gera o estudo e o consulta pela API
**Components:** application, http
**Files:** `tests/helpers.ts`, `tests/smoke.test.ts`
**Implementation files:** `tests/helpers.ts`
**Test files:** `tests/smoke.test.ts`

**RED:**
- `bun test tests/smoke.test.ts` — o smoke end-to-end acusa a falta dos helpers de teste

**Implementation:**
1. Criar os helpers de teste isolados por arquivo
2. Escrever o smoke end-to-end em modo mock

**ACs:**
- [ ] `bun test` — a suite completa passa com exit 0 sem rede
- [ ] `bun run check` — o typecheck estrito passa

**Visual:** N/A
**Documentation:** N/A
