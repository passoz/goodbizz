# Tasks: O modal de provedor testa e cancela corretamente

**Contract version:** 3
**Work ID:** 0011

## Execution contract

| Component | Purpose |
|-----------|---------|
| `provider-modal` | Script do modal de provedor: corpo do teste restrito aos campos da sonda e cancelamento que devolve a escolha da lista |

## Global gates
- [ ] `bun test` — a suite completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.
- [ ] `bunx eslint . && bunx prettier --check .` — lint e formatacao passam.

### [x] [1.1] Restringir o corpo do teste e restaurar a lista ao cancelar

**Requirement:** FR-001
**Depends on:** none
**Behavior:** o botao Testar envia so `kind`, `url`, `model` e `apiKey` para a sonda, e fechar o modal devolve cada lista ao provedor que estava escolhido
**Components:** provider-modal
**Files:** `src/infrastructure/http/ui/pages.tsx`, `tests/ui.test.ts`
**Implementation files:** `src/infrastructure/http/ui/pages.tsx`
**Test files:** `tests/ui.test.ts`

**RED:**
- `bun test tests/ui.test.ts` — o script servido ainda manda o objeto inteiro do formulario no teste e restaura a lista pelo elemento, entao as assercoes novas falham

**Implementation:**
1. Escrever os testes que falham (RED): o HTML servido contem o corpo da sonda sem o nome e o `restore` indexado por `data-kind`
2. Acrescentar `probePayload()` ao script e trocar a indexacao do `restore` pelo tipo da lista (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com as assercoes do script servido
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/ui/pages.tsx tests/ui.test.ts && bunx prettier --check src/infrastructure/http/ui/pages.tsx tests/ui.test.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A
