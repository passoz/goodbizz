# Tasks: A exclusao precisa dizer por que falhou

**Contract version:** 3
**Work ID:** 0005

## Execution contract

| Component | Purpose |
|-----------|---------|
| `delete-feedback` | Aviso proprio de falha nos dialogos de exclusao de estudo e de ideia, separado do texto da pergunta |

## Global gates
- [ ] `bun test` — a suite completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.
- [ ] `bunx eslint . && bunx prettier --check .` — lint e formatacao passam.

### [ ] [1.1] Mostrar a falha da exclusao do estudo num aviso proprio

**Requirement:** FR-001
**Depends on:** none
**Behavior:** o dialogo de exclusao do estudo separa pergunta e falha: o erro vai para um paragrafo proprio com role alert, vazio no HTML servido, e a recusa por estudo em execucao vira uma frase em portugues que cita o estudo rodando
**Components:** delete-feedback
**Files:** `src/infrastructure/http/ui/pages.tsx`, `tests/ui.test.ts`
**Implementation files:** `src/infrastructure/http/ui/pages.tsx`
**Test files:** `tests/ui.test.ts`

**RED:**
- `bun test tests/ui.test.ts` — o dialogo do estudo so tem `delete-modal-text`, entao a assercao que procura o aviso proprio de erro falha

**Implementation:**
1. Escrever o teste que falha (RED): o HTML da lista e do detalhe contem `delete-error` vazio e com `role="alert"`, distinto de `delete-modal-text`
2. Acrescentar o paragrafo de aviso ao dialogo e passar a escrever a falha nele, traduzindo 409 para uma frase em portugues que diz que o estudo esta rodando (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com a assercao do aviso de erro no dialogo do estudo
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/ui/pages.tsx tests/ui.test.ts && bunx prettier --check src/infrastructure/http/ui/pages.tsx tests/ui.test.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.2] Mostrar a falha da exclusao de ideia num aviso proprio

**Requirement:** FR-002
**Depends on:** 1.1
**Behavior:** o dialogo de exclusao de ideia ganha um paragrafo de aviso, vazio no HTML servido, e o script passa a escrever o motivo da falha nele em vez de so registrar no console
**Components:** delete-feedback
**Files:** `src/infrastructure/http/ui/pages.tsx`, `tests/ui.test.ts`
**Implementation files:** `src/infrastructure/http/ui/pages.tsx`
**Test files:** `tests/ui.test.ts`

**RED:**
- `bun test tests/ui.test.ts` — o dialogo de ideia so tem `idea-delete-text`, entao a assercao que procura o aviso proprio de erro falha

**Implementation:**
1. Escrever o teste que falha (RED): o HTML do detalhe contem `idea-delete-error` vazio e com `role="alert"`, distinto de `idea-delete-text`
2. Acrescentar o paragrafo de aviso ao dialogo de ideia e escrever o motivo da falha nele quando a exclusao nao conclui (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com a assercao do aviso de erro no dialogo de ideia
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/ui/pages.tsx tests/ui.test.ts && bunx prettier --check src/infrastructure/http/ui/pages.tsx tests/ui.test.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A
