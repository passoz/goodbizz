# Tasks: Titulo curto e descricao do estudo, cache por estudo e configuracoes agrupadas

**Contract version:** 3
**Work ID:** 0004

## Execution contract

| Component | Purpose |
|-----------|---------|
| `naming-title` | Titulo do estudo como funcao pura de dominio: capitalizacao por palavra, acentos preservados e limite de 50 caracteres digitados |
| `study-description` | Descricao de contexto no contrato, na configuracao resolvida, no registro persistido e nos textos enviados aos provedores |
| `cache-scope` | Chave de cache com semente por estudo, purga escopada na exclusao e retomada do estudo incompleto |
| `surfaces` | Superficies que expoem o titulo e a descricao: API HTTP, interface web e CLI |
| `settings-ui` | Pagina de configuracoes agrupada por provedor, com legenda e ajuda associada ao campo |

## Global gates
- [ ] `bun test` — a suite completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.
- [ ] `bunx eslint . && bunx prettier --check .` — lint e formatacao passam.

### [x] [1.1] Normalizar o titulo e acrescentar descricao e semente ao contrato do estudo

**Requirement:** FR-001
**Depends on:** none
**Behavior:** titleCase capitaliza cada palavra preservando espacos, acentos e o restante do texto; uma funcao pura valida o limite de 50 caracteres digitados; e o StudyConfig ganha os campos description e cacheSeed, resolvidos com default vazio
**Components:** naming-title, study-description
**Files:** `src/domain/naming.ts`, `src/domain/types.ts`, `src/config/runtime.ts`, `tests/naming.test.ts`
**Implementation files:** `src/domain/naming.ts`, `src/domain/types.ts`, `src/config/runtime.ts`
**Test files:** `tests/naming.test.ts`

**RED:**
- `bun test tests/naming.test.ts` — src/domain/naming.ts ainda nao existe, entao a assercao que exige o titulo capitalizado com acentos preservados nao compila e o teste falha

**Implementation:**
1. Escrever os testes que falham (RED): capitalizacao de cada palavra, acentos e pontuacao preservados, recusa acima de 50 caracteres e sujeito igual ao titulo quando a descricao e vazia
2. Criar src/domain/naming.ts, acrescentar description e cacheSeed ao StudyConfig e resolve-los em resolveStudyConfig aplicando a validacao do titulo (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de normalizacao do titulo e do limite
- [ ] `bun run check` — o typecheck estrito passa com os campos novos do StudyConfig
- [ ] `bunx eslint src/domain/naming.ts src/domain/types.ts src/config/runtime.ts && bunx prettier --check src/domain/naming.ts src/domain/types.ts src/config/runtime.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.2] Persistir a descricao na tabela studies

**Requirement:** FR-002
**Depends on:** 1.1
**Behavior:** a tabela studies ganha a coluna description por migracao aditiva com default vazio, e o repositorio grava e devolve a descricao junto do registro
**Components:** study-description
**Files:** `src/infrastructure/schema.ts`, `drizzle/0004_study_description.sql`, `src/infrastructure/repositories.ts`, `tests/repositories.test.ts`
**Implementation files:** `src/infrastructure/schema.ts`, `drizzle/0004_study_description.sql`, `src/infrastructure/repositories.ts`
**Test files:** `tests/repositories.test.ts`

**RED:**
- `bun test tests/repositories.test.ts` — a coluna description ainda nao existe na tabela, entao o teste de round-trip que grava e le a descricao falha

**Implementation:**
1. Escrever os testes que falham (RED): round-trip da descricao e linha migrada lida com descricao vazia
2. Acrescentar a coluna ao schema, gerar a migracao aditiva e gravar e ler a descricao no repositorio (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de round-trip e de migracao aditiva
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/schema.ts src/infrastructure/repositories.ts && bunx prettier --check src/infrastructure/schema.ts src/infrastructure/repositories.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.3] Gravar titulo normalizado e descricao na criacao e na renomeacao

**Requirement:** FR-009
**Depends on:** 1.1, 1.2
**Behavior:** create grava o titulo normalizado e a descricao no registro do estudo; rename normaliza o titulo e recusa titulo acima do limite com ValidationError
**Components:** study-description
**Files:** `src/application/study-service.ts`, `tests/study-service.test.ts`
**Implementation files:** `src/application/study-service.ts`
**Test files:** `tests/study-service.test.ts`

**RED:**
- `bun test tests/study-service.test.ts` — o registro criado nao carrega a descricao nem normaliza o titulo, entao a assercao que le o estudo criado e espera o titulo capitalizado falha

**Implementation:**
1. Escrever os testes que falham (RED): estudo criado com titulo normalizado e descricao gravada, e rename recusando titulo acima do limite
2. Passar a descricao e o titulo normalizado ao registro em create e normalizar o titulo em rename (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de criacao e de renomeacao
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/application/study-service.ts && bunx prettier --check src/application/study-service.ts` — o lint e a formatacao do arquivo tocado passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.4] Concatenar a descricao ao titulo nos textos enviados aos provedores

**Requirement:** FR-003
**Depends on:** 1.1
**Behavior:** generateBrief, generateIdeas e dataBlock passam a usar o sujeito concatenado; studyContext e scopeNotice tambem usam o sujeito, e com descricao vazia o texto permanece igual ao atual
**Components:** study-description
**Files:** `src/application/generation.ts`, `src/config/runtime.ts`, `src/application/reports.ts`, `tests/generation.test.ts`, `tests/reports.test.ts`
**Implementation files:** `src/application/generation.ts`, `src/config/runtime.ts`, `src/application/reports.ts`
**Test files:** `tests/generation.test.ts`, `tests/reports.test.ts`

**RED:**
- `bun test tests/generation.test.ts tests/reports.test.ts` — os prompts e o aviso de escopo continuam usando apenas o titulo, entao a assercao que procura a descricao concatenada no texto enviado falha

**Implementation:**
1. Escrever os testes que falham (RED): prompt com a descricao concatenada, contexto do decisor com a descricao e texto igual ao atual quando a descricao e vazia
2. Trocar o uso direto do titulo pelo sujeito concatenado em generation, studyContext e scopeNotice (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de concatenacao e de texto inalterado sem descricao
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/application/generation.ts src/application/reports.ts && bunx prettier --check src/application/generation.ts src/application/reports.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.5] Dar escopo ao cache no port e no adaptador SQLite

**Requirement:** FR-004
**Depends on:** 1.1
**Behavior:** o port de cache ganha purge por prefixo; o adaptador SQLite remove por prefixo com o query builder; a aplicacao compoe a chave com escopo e concatena a semente ao hash
**Components:** cache-scope
**Files:** `src/domain/ports.ts`, `src/infrastructure/cache-repository.ts`, `src/application/cache.ts`, `tests/cache.test.ts`
**Implementation files:** `src/domain/ports.ts`, `src/infrastructure/cache-repository.ts`, `src/application/cache.ts`
**Test files:** `tests/cache.test.ts`

**RED:**
- `bun test tests/cache.test.ts` — o port de cache nao tem purge e a chave nao carrega escopo, entao a assercao que pede chaves distintas para sementes distintas falha

**Implementation:**
1. Escrever os testes que falham (RED): chave com escopo distinto por semente e purga removendo apenas o prefixo pedido
2. Acrescentar purge ao port, implementar a remocao por prefixo no adaptador e compor a chave com escopo na aplicacao (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de escopo da chave e de purga por prefixo
- [ ] `bun run check` — o typecheck estrito passa com o metodo novo do port
- [ ] `bunx eslint src/domain/ports.ts src/infrastructure/cache-repository.ts src/application/cache.ts && bunx prettier --check src/domain/ports.ts src/infrastructure/cache-repository.ts src/application/cache.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.6] Usar o id do estudo como semente e purgar o cache na exclusao

**Requirement:** FR-005
**Depends on:** 1.5
**Behavior:** as chaves de brief, ideias, avaliacao e documento passam a ser compostas com a semente do estudo; excluir o estudo purga as entradas daquele id e nenhuma entrada de outro estudo e removida
**Components:** cache-scope
**Files:** `src/application/generate-study.ts`, `src/application/study-service.ts`, `tests/generate-study.test.ts`, `tests/study-service.test.ts`
**Implementation files:** `src/application/generate-study.ts`, `src/application/study-service.ts`
**Test files:** `tests/generate-study.test.ts`, `tests/study-service.test.ts`

**RED:**
- `bun test tests/generate-study.test.ts tests/study-service.test.ts` — a geracao ainda nao usa semente e a exclusao nao purga, entao a assercao que exige duas chaves distintas para os estudos A e B falha

**Implementation:**
1. Escrever os testes que falham (RED): dois estudos de mesmo titulo com chaves distintas e exclusao purgando apenas o prefixo do estudo excluido
2. Compor as chaves com a semente do estudo e disparar a purga na exclusao (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de semente por estudo e de purga na exclusao
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/application/generate-study.ts src/application/study-service.ts && bunx prettier --check src/application/generate-study.ts src/application/study-service.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.7] Provar a retomada do estudo incompleto e corrigir o texto do painel de falha

**Requirement:** FR-006
**Depends on:** 1.6
**Behavior:** retomar um estudo que falhou no passo 5 chama o provedor de texto apenas para o documento que faltava, termina com state done e nao limpa o cache do proprio estudo; o painel de falha passa a informar que a reexecucao retoma de onde parou
**Components:** cache-scope
**Files:** `src/infrastructure/http/ui/pages.tsx`, `tests/study-service.test.ts`, `tests/ui.test.ts`
**Implementation files:** `src/infrastructure/http/ui/pages.tsx`
**Test files:** `tests/study-service.test.ts`, `tests/ui.test.ts`

**RED:**
- `bun test tests/study-service.test.ts tests/ui.test.ts` — o teste de retomada ainda nao existe e o painel de falha promete refazer o pipeline do comeco, entao a assercao que espera o texto de retomada falha

**Implementation:**
1. Escrever os testes que falham (RED): estudo que falha no passo 5 retomado com uma unica chamada de documento, e painel de falha citando a retomada
2. Corrigir o texto do painel de falha (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com o teste de retomada e o texto novo do painel
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/ui/pages.tsx tests/study-service.test.ts tests/ui.test.ts && bunx prettier --check src/infrastructure/http/ui/pages.tsx tests/study-service.test.ts tests/ui.test.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.8] Expor a descricao e o limite do titulo na API e na CLI

**Requirement:** FR-008
**Depends on:** 1.1, 1.2
**Behavior:** POST /api/studies aceita description, recusa nicho acima de 50 caracteres com mensagem que cita o limite e devolve description no payload publico; a CLI ganha --description e a ajuda anuncia o limite
**Components:** surfaces
**Files:** `src/infrastructure/http/api.ts`, `src/cli.ts`, `README.md`, `tests/api.test.ts`, `tests/cli.test.ts`
**Implementation files:** `src/infrastructure/http/api.ts`, `src/cli.ts`, `README.md`
**Test files:** `tests/api.test.ts`, `tests/cli.test.ts`

**RED:**
- `bun test tests/api.test.ts tests/cli.test.ts` — o schema da borda ainda nao aceita description e a CLI nao tem a flag, entao a assercao que cria estudo com descricao pela API falha

**Implementation:**
1. Escrever os testes que falham (RED): criacao pela API com descricao, recusa acima de 50 caracteres e ajuda da CLI citando o limite
2. Acrescentar description ao schema da borda e ao payload publico, criar a flag --description e documentar no README (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de API e de CLI
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/api.ts src/cli.ts && bunx prettier --check src/infrastructure/http/api.ts src/cli.ts README.md` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.9] Acrescentar o campo de descricao e o limite do titulo no formulario de criacao

**Requirement:** FR-010
**Depends on:** 1.3, 1.8
**Behavior:** o formulario de criacao ganha o campo de descricao e o maxlength do titulo com o limite anunciado; o POST sem JavaScript le o campo e o envia ao servico; o dialogo de renomear anuncia o mesmo limite
**Components:** surfaces
**Files:** `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/routes.tsx`, `tests/ui.test.ts`
**Implementation files:** `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/routes.tsx`
**Test files:** `tests/ui.test.ts`

**RED:**
- `bun test tests/ui.test.ts` — o formulario nao tem o campo de descricao nem o maxlength do titulo, entao a assercao que procura os dois no HTML falha

**Implementation:**
1. Escrever os testes que falham (RED): campo de descricao no formulario, maxlength do titulo e envio sem JavaScript
2. Acrescentar o campo e o limite ao formulario e ler o campo no POST sem script (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de formulario e de envio sem JavaScript
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/ui/pages.tsx src/infrastructure/http/ui/routes.tsx && bunx prettier --check src/infrastructure/http/ui/pages.tsx src/infrastructure/http/ui/routes.tsx` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.10] Agrupar as configuracoes por provedor com legenda

**Requirement:** FR-007
**Depends on:** 1.9
**Behavior:** a pagina de configuracoes renderiza um grupo por provedor, com legenda que nomeia o provedor e ajuda associada ao input, mantendo os mesmos nomes de campo e o mesmo patch sem JavaScript
**Components:** settings-ui
**Files:** `src/config/providers.ts`, `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/layout.tsx`, `tests/ui.test.ts`
**Implementation files:** `src/config/providers.ts`, `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/layout.tsx`
**Test files:** `tests/ui.test.ts`

**RED:**
- `bun test tests/ui.test.ts` — a pagina renderiza uma grade unica sem legenda, entao a assercao que procura dois grupos nomeados por provedor falha

**Implementation:**
1. Escrever os testes que falham (RED): dois grupos com legenda, campo sob o grupo certo e ajuda associada ao input
2. Declarar os grupos em PROVIDER_GROUPS, renderizar um grupo por provedor e acrescentar o CSS dos grupos (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de agrupamento e de vinculo entre ajuda e campo
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/config/providers.ts src/infrastructure/http/ui/pages.tsx src/infrastructure/http/ui/layout.tsx && bunx prettier --check src/config/providers.ts src/infrastructure/http/ui/pages.tsx src/infrastructure/http/ui/layout.tsx` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A
