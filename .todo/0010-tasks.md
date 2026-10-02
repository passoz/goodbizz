# Tasks: Catálogo nomeado de provedores na tela de configurações

**Contract version:** 3
**Work ID:** 0010

## Execution contract

| Component | Purpose |
|-----------|---------|
| `provider-catalog` | Catalogo nomeado de provedores por funcao, com escolha do ativo, teste de conexao e migracao do formato antigo |

## Global gates
- [ ] `bun test` — a suite completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.
- [ ] `bunx eslint . && bunx prettier --check .` — lint e formatacao passam.

### [x] [1.1] Trocar os campos soltos por um catálogo nomeado, com teste de conexão

**Requirement:** FR-001
**Depends on:** none
**Behavior:** o catalogo guarda provedores nomeados por tipo e o ativo de cada um, a tela mostra duas listas com editar, excluir e adicionar, o modal testa a configuracao contra o provedor, e o formato antigo e migrado para perfis Padrao
**Components:** provider-catalog
**Files:** `src/domain/types.ts`, `src/domain/ports.ts`, `src/config/providers.ts`, `src/application/settings.ts`, `src/application/study-service.ts`, `src/infrastructure/settings-repository.ts`, `src/infrastructure/provider-probe.ts`, `src/infrastructure/http/api.ts`, `src/infrastructure/http/ui/routes.tsx`, `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/layout.tsx`, `src/cli.ts`, `tests/settings.test.ts`, `tests/settings-api.test.ts`, `tests/providers.test.ts`, `tests/routing.test.ts`, `tests/ui.test.ts`, `tests/helpers.ts`, `tests/e2e.test.ts`
**Implementation files:** `src/domain/types.ts`, `src/domain/ports.ts`, `src/config/providers.ts`, `src/application/settings.ts`, `src/application/study-service.ts`, `src/infrastructure/settings-repository.ts`, `src/infrastructure/provider-probe.ts`, `src/infrastructure/http/api.ts`, `src/infrastructure/http/ui/routes.tsx`, `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/layout.tsx`, `src/cli.ts`
**Test files:** `tests/settings.test.ts`, `tests/settings-api.test.ts`, `tests/providers.test.ts`, `tests/routing.test.ts`, `tests/ui.test.ts`, `tests/helpers.ts`, `tests/e2e.test.ts`

**RED:**
- `bun test` — o catalogo ainda nao existe: o store nao tem `create`, as rotas `/api/settings/providers` respondem 404 e a pagina nao tem as listas, entao as assercoes novas falham

**Implementation:**
1. Escrever os testes que falham (RED): migracao do formato antigo, CRUD com ativo, chave preservada na edicao, vereditos do teste contra um provedor local, pagina com as duas listas e o e2e do catalogo
2. Introduzir `ProviderProfile`/`ProviderSettings`, o store com CRUD, o repositorio com migracao, o modulo de teste de provedor, as rotas da API, a pagina com as listas e o modal (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes do catalogo e do teste de conexao
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint . && bunx prettier --check .` — o lint e a formatacao passam

**Visual:** N/A
**Documentation:** N/A
