# Tasks: Adicionar e remover ideias de um estudo, com ranking e artefatos regerados

**Contract version:** 3
**Work ID:** 0003

## Execution contract

| Component | Purpose |
|-----------|---------|
| `idea-identity` | Identidade estavel por ideia: id gerado na avaliacao, persistido em coluna propria e preservado por reordenacao |
| `idea-removal` | Remocao de uma ideia com recalculo de ranking, reconciliacao de disco e regeracao dos agregados |
| `idea-addition` | Geracao incremental de N ideias: prompt distinto, avaliacao e documento so das novas, ranking recalculado |
| `api-surface` | Rotas DELETE /api/studies/:id/ideas/:ideaId e POST /api/studies/:id/ideas com validacao e codigos de erro |
| `ui-actions` | Botao de excluir por linha da tabela de ranking e controle para pedir mais ideias no cabecalho |

## Global gates
- [ ] `bun test` — a suite completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.
- [ ] `bunx eslint . && bunx prettier --check .` — lint e formatacao passam.

### [x] [1.1] Declarar StudyIdea e gerar o id na avaliacao

**Requirement:** FR-001
**Depends on:** none
**Behavior:** evaluateIdea devolve StudyIdea com id preenchido e distinto a cada chamada, e o pipeline exp oe esse tipo sem alterar nada do que ja era serializado em dados.json
**Components:** idea-identity
**Files:** `src/domain/types.ts`, `src/application/evaluate.ts`, `src/application/generate-study.ts`, `tests/study-service.test.ts`, `tests/generation.test.ts`
**Implementation files:** `src/domain/types.ts`, `src/application/evaluate.ts`, `src/application/generate-study.ts`
**Test files:** `tests/study-service.test.ts`, `tests/generation.test.ts`

**RED:**
- `bun test` — StudyIdea nao existe e evaluateIdea nao devolve id, entao o teste que exige id preenchido e distinto em avaliacoes reais falha

**Implementation:**
1. Escrever os testes que falham (RED): id preenchido, distinto entre avaliacoes e presente no resultado do pipeline
2. Declarar StudyIdea como subtipo de IdeaEvaluation com id obrigatorio, gerar o id em evaluateIdea e tipar o resultado do pipeline (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de identidade em evaluateIdea e no pipeline
- [ ] `bun run check` — o typecheck estrito passa sem alterar evaluationFromJson nem a forma do dados.json
- [ ] `bunx eslint src/domain/types.ts src/application/evaluate.ts src/application/generate-study.ts && bunx prettier --check src/domain/types.ts src/application/evaluate.ts src/application/generate-study.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.2] Criar a coluna idea_id e o backfill das linhas legadas

**Requirement:** FR-008
**Depends on:** 1.1
**Behavior:** a tabela evaluations ganha a coluna idea_id e a migracao preenche um id deterministico nas linhas gravadas antes da mudanca, sem reescrever payload_json
**Components:** idea-identity
**Files:** `src/infrastructure/schema.ts`, `drizzle.config.ts`, `drizzle/0003_idea_id.sql`, `tests/repositories.test.ts`
**Implementation files:** `src/infrastructure/schema.ts`, `drizzle.config.ts`, `drizzle/0003_idea_id.sql`
**Test files:** `tests/repositories.test.ts`

**RED:**
- `bun test` — a coluna idea_id nao existe, entao o teste que espera um id em studies gravados antes da migracao falha

**Implementation:**
1. Escrever os testes que falham (RED): coluna ausente, linhas legadas sem id, payload_json intacto e segunda execucao sem efeito
2. Adicionar a coluna idea_id, corrigir drizzle.config.ts para rodar no drizzle-kit, gerar a migracao e acrescentar o backfill deterministico (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de migracao e de backfill das linhas legadas
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/schema.ts && bunx prettier --check src/infrastructure/schema.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.3] Propagar a identidade pelo port, pelo repositorio e pelo resumo

**Requirement:** FR-011
**Depends on:** 1.2
**Behavior:** saveEvaluations grava o id na coluna, a leitura o devolve junto da ideia, a reordenacao por indice mantem cada id com a sua ideia, e ordered passa a expor StudyIdea para o consumidor da UI
**Components:** idea-identity
**Files:** `src/domain/ports.ts`, `src/infrastructure/repositories.ts`, `src/application/summary.ts`, `tests/repositories.test.ts`, `tests/study-service.test.ts`, `tests/artifacts.test.ts`, `tests/cache.test.ts`, `tests/reports.test.ts`, `tests/ui.test.ts`
**Implementation files:** `src/domain/ports.ts`, `src/infrastructure/repositories.ts`, `src/application/summary.ts`
**Test files:** `tests/repositories.test.ts`, `tests/study-service.test.ts`, `tests/artifacts.test.ts`, `tests/cache.test.ts`, `tests/reports.test.ts`, `tests/ui.test.ts`

**RED:**
- `bun test` — o port e o repositorio recebem IdeaEvaluation, entao o teste que espera o id gravado e devolvido, e preservado apos reordenar, falha

**Implementation:**
1. Escrever os testes que falham (RED): round-trip do id, dois nomes iguais com ids distintos e id preservado apos reordenar
2. Trocar o port e o repositorio para StudyIdea, gravar e ler idea_id, anexar o id na leitura e tipar ordered como StudyIdea (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de persistencia, de nomes homonimos e de reordenacao
- [ ] `bun run check` — o typecheck estrito passa e evaluationFromJson continua lendo o baseline sem id
- [ ] `bunx eslint src/domain/ports.ts src/infrastructure/repositories.ts src/application/summary.ts && bunx prettier --check src/domain/ports.ts src/infrastructure/repositories.ts src/application/summary.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.4] Remover uma ideia e reconciliar ranking e disco

**Requirement:** FR-002
**Depends on:** 1.3
**Behavior:** remover uma ideia por id zera o ranking a partir de 1, recalcula summary.ordered, apaga a pasta da ideia removida, renomeia as demais para os indices novos e nao deixa orfao em disco
**Components:** idea-removal
**Files:** `src/application/study-service.ts`, `tests/study-service.test.ts`
**Implementation files:** `src/application/study-service.ts`
**Test files:** `tests/study-service.test.ts`

**RED:**
- `bun test` — removeIdea nao existe, entao o teste que remove a ideia do meio e exige as pastas 01 e 02 sem a 03 falha

**Implementation:**
1. Escrever os testes que falham (RED): remocao do meio zera o ranking, ConflictError em execucao e NotFoundError em id desconhecido
2. Implementar removeIdea com reconciliacao do disco por id, remocao da pasta orfa, renomeacao das seguintes e ConflictError/NotFoundError (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de remocao, renomeacao e ausencia de orfaos
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/application/study-service.ts && bunx prettier --check src/application/study-service.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.5] Gerar apenas as ideias novas no pipeline incremental

**Requirement:** FR-003
**Depends on:** 1.1
**Behavior:** o pipeline incremental (FR-007) reaproveita o brief gravado, nao reavalia as ideias existentes e pede ao LLM nomes distintos dos que ja existem, com chave de cache diferente da do estudo original e da de um segundo pedido
**Components:** idea-addition
**Files:** `src/application/generate-study.ts`, `src/application/generation.ts`, `tests/generation.test.ts`
**Implementation files:** `src/application/generate-study.ts`, `src/application/generation.ts`
**Test files:** `tests/generation.test.ts`

**RED:**
- `bun test` — o pipeline so aceita o fluxo completo, entao o teste que exige brief reaproveitado e geracao apenas das novas falha

**Implementation:**
1. Escrever os testes que falham (RED): brief nao regerado, gerador de documento chamado so para as novas e prompt com os nomes existentes
2. Implementar o modo incremental com reutilizacao do brief, prompt anti-duplicata e chave de cache propria (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de incremental, anti-duplicata e cache
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/application/generate-study.ts src/application/generation.ts && bunx prettier --check src/application/generate-study.ts src/application/generation.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.6] Orquestrar addIdeas preservando as antigas e recalculando o ranking

**Requirement:** FR-009
**Depends on:** 1.3, 1.5
**Behavior:** addIdeas (FR-004) preserva as avaliacoes e documentos anteriores, anexa as N novas, recalcula o ranking persistido junto de summary.ordered, recusa execucao em andamento ou excesso do teto de 40 antes de qualquer chamada de LLM, e consome o id definido nas tasks 1.1 a 1.3 sem redefini-lo
**Components:** idea-addition
**Files:** `src/application/study-service.ts`, `tests/study-service.test.ts`
**Implementation files:** `src/application/study-service.ts`
**Test files:** `tests/study-service.test.ts`

**RED:**
- `bun test` — addIdeas nao existe, entao o teste que preserva as 3 ideias antigas ao pedir 5 e o que excede o teto de 40 falham

**Implementation:**
1. Escrever os testes que falham (RED): 3 antigas preservadas com 5 novas, teto de 40 validado antes do LLM e ConflictError em execucao
2. Implementar addIdeas ligando o pipeline incremental, preservando os documentos antigos, reindexando o ranking e validando o teto (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de adicao incremental e de teto
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/application/study-service.ts && bunx prettier --check src/application/study-service.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.7] Expor remocao e adicao na API HTTP

**Requirement:** FR-005
**Depends on:** 1.4, 1.6
**Behavior:** DELETE /api/studies/:id/ideas/:ideaId responde 204 e POST /api/studies/:id/ideas com { count } responde 201 iniciando a execucao em background, com 422 para count invalido e 404 para ids inexistentes
**Components:** api-surface
**Files:** `src/infrastructure/http/api.ts`, `tests/api.test.ts`
**Implementation files:** `src/infrastructure/http/api.ts`
**Test files:** `tests/api.test.ts`

**RED:**
- `bun test` — as rotas de ideias nao existem, entao o teste que espera 204 na remocao e 201 na adicao falha com 404

**Implementation:**
1. Escrever os testes que falham (RED): 204 na remocao, 201 na adicao, 422 em count invalido e 404 em id inexistente
2. Registrar as duas rotas reaproveitando os guards de delete de estudo ja existentes e disparar a execucao sem bloquear a requisicao (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes das rotas de ideias
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/api.ts && bunx prettier --check src/infrastructure/http/api.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.8] Renderizar as acoes de remover e adicionar na tabela

**Requirement:** FR-006
**Depends on:** 1.7
**Behavior:** a tabela de ranking mostra um botao de excluir por linha com dialogo de confirmacao e um controle numerico para pedir N ideias, ambos ausentes enquanto o estudo esta em execucao
**Components:** ui-actions
**Files:** `src/infrastructure/http/ui/pages.tsx`, `tests/ui.test.ts`
**Implementation files:** `src/infrastructure/http/ui/pages.tsx`
**Test files:** `tests/ui.test.ts`

**RED:**
- `bun test` — a tabela nao tem os controles, entao o teste que procura o botao de excluir por linha e o campo numerico falha

**Implementation:**
1. Escrever os testes que falham (RED): botao de excluir por linha, dialogo de confirmacao, campo numerico e ausencia durante running
2. Renderizar o botao de exclusao com confirmacao e o formulario de N ideias, reaproveitando o padrao de Form e csrf dos formularios existentes (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de render das duas acoes
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/ui/pages.tsx && bunx prettier --check src/infrastructure/http/ui/pages.tsx` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.9] Tratar as rotas de UI das novas acoes

**Requirement:** FR-010
**Depends on:** 1.8
**Behavior:** as duas novas acoes de UI exigem token CSRF valido e respondem com redirect para a pagina do estudo, igual as demais acoes mutantes
**Components:** ui-actions
**Files:** `src/infrastructure/http/ui/routes.tsx`, `tests/ui.test.ts`
**Implementation files:** `src/infrastructure/http/ui/routes.tsx`
**Test files:** `tests/ui.test.ts`

**RED:**
- `bun test` — as rotas de UI das novas acoes nao existem, entao o teste que chama sem CSRF valido falha

**Implementation:**
1. Escrever os testes que falham (RED): recusa sem CSRF e redirect com CSRF valido nas duas acoes
2. Registrar as rotas de UI com verificacao de CSRF e redirect, reaproveitando o mesmo padrao de DeleteForm e RenameForm (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de CSRF e redirect das novas rotas
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/ui/routes.tsx && bunx prettier --check src/infrastructure/http/ui/routes.tsx` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A
