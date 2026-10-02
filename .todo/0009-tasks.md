# Tasks: Origem opaca não veta o formulário

**Contract version:** 3
**Work ID:** 0009

## Execution contract

| Component | Purpose |
|-----------|---------|
| `ui-csrf` | Ordem do CSRF do formulario: o token decide primeiro e o sinal de origem so veta quando aponta inequivocamente para outro site |

## Global gates
- [ ] `bun test` — a suite completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.
- [ ] `bunx eslint . && bunx prettier --check .` — lint e formatacao passam.

### [x] [1.1] Conferir o token antes do sinal e tratar origem opaca como não decisiva

**Requirement:** FR-001
**Depends on:** none
**Behavior:** o `requireCsrf` confere o token primeiro, aceita `Origin: null` e `Sec-Fetch-Site` nao cross-site como nao decisivos, e veta apenas `Origin` de outro host ou `cross-site`
**Components:** ui-csrf
**Files:** `src/infrastructure/http/ui/security.ts`, `tests/ui.test.ts`, `tests/e2e.test.ts`
**Implementation files:** `src/infrastructure/http/ui/security.ts`
**Test files:** `tests/ui.test.ts`, `tests/e2e.test.ts`

**RED:**
- `bun test tests/ui.test.ts tests/e2e.test.ts` — com a regra atual `Origin: null` veta, entao as assercoes que exigem 303 com token falham

**Implementation:**
1. Escrever os testes que falham (RED): `Origin: null` com token aceito, e os dois vetos com token valido
2. Conferir o token antes do sinal de origem e reduzir o veto a `Origin` de outro host e `cross-site` (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com o caminho de origem opaca e os dois vetos
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/ui/security.ts tests/ui.test.ts tests/e2e.test.ts && bunx prettier --check src/infrastructure/http/ui/security.ts tests/ui.test.ts tests/e2e.test.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A
