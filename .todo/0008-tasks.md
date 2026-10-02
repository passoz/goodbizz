# Tasks: O formulário aceita cliente sem sinal de origem

**Contract version:** 3
**Work ID:** 0008

## Execution contract

| Component | Purpose |
|-----------|---------|
| `ui-csrf` | Regra do CSRF do formulario: sinal de origem divergente veta, ausencia de sinal nao recusa (o token decide), e toda recusa registra o que o cliente mandou |

## Global gates
- [ ] `bun test` — a suite completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.
- [ ] `bunx eslint . && bunx prettier --check .` — lint e formatacao passam.

### [x] [1.1] Deixar o token decidir quando o cliente não oferece sinal de origem

**Requirement:** FR-001
**Depends on:** none
**Behavior:** o `requireCsrf` veta qualquer sinal de origem presente que diverja, aceita o POST sem sinal quando o token confere, e registra os sinais recebidos e a presenca do token em cada recusa
**Components:** ui-csrf
**Files:** `src/infrastructure/http/ui/security.ts`, `src/infrastructure/http/ui/routes.tsx`, `src/index.ts`, `tests/ui.test.ts`, `tests/e2e.test.ts`
**Implementation files:** `src/infrastructure/http/ui/security.ts`, `src/infrastructure/http/ui/routes.tsx`, `src/index.ts`
**Test files:** `tests/ui.test.ts`, `tests/e2e.test.ts`

**RED:**
- `bun test tests/ui.test.ts tests/e2e.test.ts` — com a regra atual o POST sem nenhum sinal de origem responde 403, entao as assercoes que exigem 303 falham

**Implementation:**
1. Escrever os testes que falham (RED): 303 no POST sem sinal com token, 403 de token sem token, veto para `Origin` de outro host e para `Sec-Fetch-Site: cross-site`, e o log da recusa com os sinais
2. Trocar a exigencia de sinal pela regra "sinal presente e veto", repassar o logger ao `createCsrf` e registrar as recusas (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com os dois resultados por sinal e o caminho sem sinal
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/ui/security.ts src/infrastructure/http/ui/routes.tsx src/index.ts tests/ui.test.ts tests/e2e.test.ts && bunx prettier --check src/infrastructure/http/ui/security.ts src/infrastructure/http/ui/routes.tsx src/index.ts tests/ui.test.ts tests/e2e.test.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A
