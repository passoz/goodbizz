# Tasks: Provedores trocam de verdade e a ideia carrega a data de geracao

**Contract version:** 3
**Work ID:** 0013

## Execution contract

| Component | Purpose |
|-----------|---------|
| `provider-catalog` | Impressao e rotulos dos provedores efetivos (catalogo ativo sobre ambiente) |
| `provider-probe` | Sonda do Testar: catalogo de modelos, chave guardada e veredito |
| `provider-modal` | Modal de provedor: ordem, dropdown de modelos, PATCH sem kind e dialogo de exclusao |
| `idea-dates` | Coluna generated_at, carimbo, rodape do plano e rotulo no ranking |

## Global gates
- [ ] `bun test` — a suite completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.
- [ ] `bunx eslint . && bunx prettier --check .` — lint e formatacao passam.

### [x] [1.1] Trocar de provedor invalida as respostas gravadas pelo anterior

**Requirement:** FR-001
**Depends on:** none
**Behavior:** a impressao dos provedores efetivos entra em toda chave de cache, entao reexecutar depois de trocar de provedor gera no provedor novo
**Components:** provider-catalog
**Files:** `src/config/providers.ts`, `src/domain/types.ts`, `src/config/runtime.ts`, `src/application/generate-study.ts`, `src/application/study-service.ts`, `src/cli.ts`, `src/index.ts`, `tests/generate-study.test.ts`, `tests/providers.test.ts`, `tests/decider.test.ts`, `tests/artifacts.test.ts`, `tests/evaluate.test.ts`, `tests/generation.test.ts`, `tests/llm.test.ts`, `tests/reports.test.ts`
**Implementation files:** `src/config/providers.ts`, `src/domain/types.ts`, `src/config/runtime.ts`, `src/application/generate-study.ts`, `src/application/study-service.ts`, `src/cli.ts`, `src/index.ts`
**Test files:** `tests/generate-study.test.ts`, `tests/providers.test.ts`, `tests/decider.test.ts`, `tests/artifacts.test.ts`, `tests/evaluate.test.ts`, `tests/generation.test.ts`, `tests/llm.test.ts`, `tests/reports.test.ts`

**RED:**
- `bun test tests/generate-study.test.ts -t "trocar de provedor invalida o cache"` — sem providerScope na chave, o segundo estudo acha a resposta do provedor anterior no cache e a assercao falha

**Implementation:**
1. Escrever o teste que falha (RED): trocar a impressao de provedor nao pode servir a resposta em cache
2. Adicionar cacheFingerprint em providers.ts e providerFingerprint em StudyConfig/overrides (GREEN parcial)
3. Passar a impressao em toda chave de scopedKey do pipeline e injetar providerConfig no StudyService/CLI (GREEN)

**ACs:**
- [ ] `bun test` — a suite completa passa com as assercoes novas
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint . && bunx prettier --check .` — o lint e a formatacao do repositorio passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.2] O rotulo do servico reflete o provedor ativo

**Requirement:** FR-002
**Depends on:** none
**Behavior:** os rotulos de texto/numeros reais vem do catalogo ativo e sao recalculados a cada pagina, sem foto do boot
**Components:** provider-catalog
**Files:** `src/index.ts`, `src/infrastructure/http/ui/routes.tsx`, `tests/providers.test.ts`, `tests/ui.test.ts`
**Implementation files:** `src/index.ts`, `src/infrastructure/http/ui/routes.tsx`
**Test files:** `tests/providers.test.ts`, `tests/ui.test.ts`

**RED:**
- `bun test tests/ui.test.ts -t "o rotulo dos provedores e recalculado a cada pagina"` — com o rotulo estatico do boot, as duas paginas mostram o mesmo texto e a assercao da segunda falha

**Implementation:**
1. Escrever o teste que falha (RED): duas paginas seguidas veem rotulos diferentes
2. Trocar o objeto do boot por uma funcao providerLabels(env, settings) avaliada na rota (GREEN)

**ACs:**
- [ ] `bun test` — a suite completa passa com as assercoes novas
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint . && bunx prettier --check .` — o lint e a formatacao do repositorio passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.3] O Testar devolve o catalogo de modelos e usa a chave guardada

**Requirement:** FR-003
**Depends on:** none
**Behavior:** a sonda devolve os ids de GET /models quando existem, e o editar manda o id para a API usar a chave guardada em vez do campo vazio
**Components:** provider-probe
**Files:** `src/infrastructure/provider-probe.ts`, `src/infrastructure/http/api.ts`, `tests/settings-api.test.ts`
**Implementation files:** `src/infrastructure/provider-probe.ts`, `src/infrastructure/http/api.ts`
**Test files:** `tests/settings-api.test.ts`

**RED:**
- `bun test tests/settings-api.test.ts -t "testar provedor salvo usa a chave guardada"` — sem o campo id no schema do teste, o corpo estrito responde 422 e o veredito esperado nao vem

**Implementation:**
1. Escrever o teste que falha (RED): o editar manda id + chave vazia e espera veredito com a lista de modelos
2. Devolver models no veredito da sonda e aceitar id no ProviderTestInput, buscando a chave guardada (GREEN)

**ACs:**
- [ ] `bun test` — a suite completa passa com as assercoes novas
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint . && bunx prettier --check .` — o lint e a formatacao do repositorio passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.4] Modal do provedor com ordem, dropdown e exclusao em dialogo

**Requirement:** FR-004
**Depends on:** none
**Behavior:** o modal segue a ordem nome, URL, chave, modelo; o Testar vira o Modelo em dropdown; salvar a edicao nao manda kind; excluir confirma em dialogo do app, sem alert/confirm nativos
**Components:** provider-modal
**Files:** `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/layout.tsx`, `tests/ui.test.ts`
**Implementation files:** `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/layout.tsx`
**Test files:** `tests/ui.test.ts`

**RED:**
- `bun test tests/ui.test.ts -t "excluir provedor confirma em dialogo"` — sem o dialogo proprio o script ainda chama window.confirm e a pagina nao tem o modal de exclusao

**Implementation:**
1. Escrever os testes que falham (RED): ordem dos campos, select de modelos, PATCH sem kind e dialogo de exclusao sem alert nativo
2. Reordenar os campos, criar o select preenchido pelo Testar, tirar kind do PATCH e trocar alert/confirm pelo dialogo (GREEN)

**ACs:**
- [ ] `bun test` — a suite completa passa com as assercoes novas
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint . && bunx prettier --check .` — o lint e a formatacao do repositorio passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.5] A ideia carrega a data de geracao em coluna propria

**Requirement:** FR-005
**Depends on:** none
**Behavior:** evaluateIdea carimba generatedAt (ISO) e a leitura/gravacao passa pela coluna generated_at, fora do payload_json
**Components:** idea-dates
**Files:** `src/domain/types.ts`, `src/application/evaluate.ts`, `src/infrastructure/schema.ts`, `src/infrastructure/repositories.ts`, `drizzle/0005_tan_giant_man.sql`, `drizzle/meta/0005_snapshot.json`, `drizzle/meta/_journal.json`, `tests/evaluate.test.ts`, `tests/repositories.test.ts`
**Implementation files:** `src/domain/types.ts`, `src/application/evaluate.ts`, `src/infrastructure/schema.ts`, `src/infrastructure/repositories.ts`, `drizzle/0005_tan_giant_man.sql`, `drizzle/meta/0005_snapshot.json`, `drizzle/meta/_journal.json`
**Test files:** `tests/evaluate.test.ts`, `tests/repositories.test.ts`

**RED:**
- `bun test tests/repositories.test.ts -t "a coluna generated_at existe depois das migracoes"` — sem a migracao 0005 a coluna generated_at nao existe e a assercao falha

**Implementation:**
1. Escrever os testes que falham (RED): coluna generated_at apos as migracoes, round-trip da data e payload_json intacto
2. Carimbar generatedAt em evaluateIdea, adicionar a coluna com a migracao 0005 e gravar/ler pela coluna (GREEN)

**ACs:**
- [ ] `bun test` — a suite completa passa com as assercoes novas
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint . && bunx prettier --check .` — o lint e a formatacao do repositorio passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.6] O plano e a lista mostram a data de geracao

**Requirement:** FR-006
**Depends on:** none
**Behavior:** o README do plano fecha com o rodape da data de geracao e a linha do ranking mostra a data pequena dentro da celula do nome, sem coluna nova
**Components:** idea-dates
**Files:** `src/application/artifacts.ts`, `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/layout.tsx`, `README.md`, `tests/artifacts.test.ts`, `tests/ui.test.ts`
**Implementation files:** `src/application/artifacts.ts`, `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/layout.tsx`, `README.md`
**Test files:** `tests/artifacts.test.ts`, `tests/ui.test.ts`

**RED:**
- `bun test tests/artifacts.test.ts -t "o plano assina a data de geracao"` — sem o rodape no buildArtifactFiles o README do plano termina sem a linha de data

**Implementation:**
1. Escrever os testes que falham (RED): rodape do plano com a data e rotulo pequeno no ranking
2. Assinar o rodape em buildArtifactFiles, renderizar o rotulo na celula do nome e documentar no README (GREEN)

**ACs:**
- [ ] `bun test` — a suite completa passa com as assercoes novas
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint . && bunx prettier --check .` — o lint e a formatacao do repositorio passam

**Visual:** N/A
**Documentation:** N/A
