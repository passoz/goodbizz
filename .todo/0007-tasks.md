# Tasks: O 500 do formulário e os testes que faltavam

**Contract version:** 3
**Work ID:** 0007

## Execution contract

| Component | Purpose |
|-----------|---------|
| `http-error-mapping` | Status real de uma recusa de middleware: o `HTTPException` do Hono deixa de virar 500 |
| `ui-csrf` | Mesma origem aceita por `Origin`, `Referer` ou `Sec-Fetch-Site`, sempre com token, sem o middleware embutido |

## Global gates
- [ ] `bun test` — a suite completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.
- [ ] `bunx eslint . && bunx prettier --check .` — lint e formatacao passam.

### [x] [1.1] Preservar o status do HTTPException de middleware

**Requirement:** FR-002
**Depends on:** none
**Behavior:** o handler de erro reconhece `HTTPException` e devolve o status e a resposta dela, entao uma recusa de middleware deixa de virar 500 com corpo generico
**Components:** http-error-mapping
**Files:** `src/infrastructure/http/errors.ts`, `tests/smoke.test.ts`
**Implementation files:** `src/infrastructure/http/errors.ts`
**Test files:** `tests/smoke.test.ts`

**RED:**
- `bun test tests/smoke.test.ts` — com o handler atual o `HTTPException` cai no ramo generico, entao a assercao que exige o status 403 do middleware falha

**Implementation:**
1. Escrever o teste que falha (RED): o app composto responde o status do `HTTPException` lancado por uma rota, e nao 500
2. Acrescentar o ramo do `HTTPException` ao `buildErrorHandler`, registrando o status no log (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com a assercao do status preservado
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/errors.ts tests/smoke.test.ts && bunx prettier --check src/infrastructure/http/errors.ts tests/smoke.test.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.2] Aceitar os sinais de mesma origem do navegador e cobrir a jornada com e2e

**Requirement:** FR-001
**Depends on:** none
**Behavior:** o `requireCsrf` aceita mesma origem por `Origin`, `Referer` ou `Sec-Fetch-Site: same-origin`, o sub-app da UI nao instala mais o `csrf()` do Hono, e um e2e sobre socket real percorre a jornada do operador
**Components:** ui-csrf
**Files:** `src/infrastructure/http/ui/routes.tsx`, `src/infrastructure/http/ui/security.ts`, `tests/ui.test.ts`, `tests/e2e.test.ts`
**Implementation files:** `src/infrastructure/http/ui/routes.tsx`, `src/infrastructure/http/ui/security.ts`
**Test files:** `tests/ui.test.ts`, `tests/e2e.test.ts`

**RED:**
- `bun test tests/ui.test.ts tests/e2e.test.ts` — sem o sinal novo o POST so com `Sec-Fetch-Site` bate em 403 e o e2e da adicao pelo formulario falha

**Implementation:**
1. Escrever os testes que falham (RED): os sinais de mesma origem no sub-app e a jornada e2e sobre socket real
2. Remover o `csrf()` do Hono da montagem da UI e aceitar `Sec-Fetch-Site: same-origin` no `requireCsrf` (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os testes de sinal de origem e o e2e
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/ui/routes.tsx src/infrastructure/http/ui/security.ts tests/ui.test.ts tests/e2e.test.ts && bunx prettier --check src/infrastructure/http/ui/routes.tsx src/infrastructure/http/ui/security.ts tests/ui.test.ts tests/e2e.test.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A
