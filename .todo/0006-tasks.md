# Tasks: A falha da exclusão chega em português

**Contract version:** 3
**Work ID:** 0006

## Execution contract

| Component | Purpose |
|-----------|---------|
| `delete-feedback` | Frase em português, escolhida pelo status, no aviso de falha dos diálogos de exclusão de estudo e de ideia |

## Global gates
- [ ] `bun test` — a suite completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.
- [ ] `bunx eslint . && bunx prettier --check .` — lint e formatacao passam.

### [x] [1.1] Traduzir a falha da exclusão do estudo para uma frase acionável

**Requirement:** FR-001
**Depends on:** none
**Behavior:** o script do diálogo de estudo escolhe a frase pelo status — 404 pede para recarregar e o resto diz para tentar de novo — e manda o status e o texto cru do servidor para o console
**Components:** delete-feedback
**Files:** `src/infrastructure/http/ui/pages.tsx`, `tests/ui.test.ts`
**Implementation files:** `src/infrastructure/http/ui/pages.tsx`
**Test files:** `tests/ui.test.ts`

**RED:**
- `bun test tests/ui.test.ts` — o script do diálogo de estudo ainda monta o aviso com `message || "falha ao excluir o estudo"`, entao a assercao que procura a frase de recarregar no HTML servido falha

**Implementation:**
1. Escrever o teste que falha (RED): o HTML da lista e do detalhe contem a frase de 404 e a frase de falha generica do estudo, e a atribuicao do aviso nao cita a mensagem do servidor
2. Trocar o uso de `message` na atribuicao por uma escolha por status e acrescentar o `console.error` com o status e o texto cru (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com a assercao das frases do dialogo de estudo
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/ui/pages.tsx tests/ui.test.ts && bunx prettier --check src/infrastructure/http/ui/pages.tsx tests/ui.test.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [x] [1.2] Traduzir a falha da exclusão de ideia para uma frase acionável

**Requirement:** FR-002
**Depends on:** 1.1
**Behavior:** o script do diálogo de ideia escolhe a frase pelo status — 404 diz que a ideia nao esta mais no estudo e o resto diz para tentar de novo — e manda o status e o texto cru do servidor para o console
**Components:** delete-feedback
**Files:** `src/infrastructure/http/ui/pages.tsx`, `tests/ui.test.ts`
**Implementation files:** `src/infrastructure/http/ui/pages.tsx`
**Test files:** `tests/ui.test.ts`

**RED:**
- `bun test tests/ui.test.ts` — o script do dialogo de ideia ainda monta o aviso com `message || "falha ao excluir a ideia"`, entao a assercao que procura a frase de recarregar no HTML servido falha

**Implementation:**
1. Escrever o teste que falha (RED): o HTML do detalhe contem a frase de 404 e a frase de falha generica da ideia, e a atribuicao do aviso nao cita a mensagem do servidor
2. Trocar o uso de `message` na atribuicao por uma escolha por status e acrescentar o `console.error` com o status e o texto cru (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com a assercao das frases do dialogo de ideia
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/ui/pages.tsx tests/ui.test.ts && bunx prettier --check src/infrastructure/http/ui/pages.tsx tests/ui.test.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A
