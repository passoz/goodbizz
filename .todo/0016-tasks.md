# Tasks: Cada ideia vira uma proposta de valor com a conta do retorno aberta

**Contract version:** 3
**Work ID:** 0016

## Execution contract

| Component | Purpose |
|-----------|---------|
| `core` | Componente principal de "Cada ideia vira uma proposta de valor com a conta do retorno aberta" |

## Global gates
- [ ] `bun test` — a suíte completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.

### [ ] [1.1] Cada ideia vira uma proposta de valor com a conta do retorno aberta

**Requirement:** FR-001
**Depends on:** none
**Behavior:** implementa "Cada ideia vira uma proposta de valor com a conta do retorno aberta" com o resultado observável declarado nos critérios de aceite
**Components:** core
**Files:** `src/cada-ideia-vira-uma-proposta-de-valor-com-a-cont.ts`, `tests/cada-ideia-vira-uma-proposta-de-valor-com-a-cont.test.ts`
**Implementation files:** `src/cada-ideia-vira-uma-proposta-de-valor-com-a-cont.ts`
**Test files:** `tests/cada-ideia-vira-uma-proposta-de-valor-com-a-cont.test.ts`

**RED:**
- `bun test tests/cada-ideia-vira-uma-proposta-de-valor-com-a-cont.test.ts` — a asserção do novo comportamento falha antes da implementação de src/cada-ideia-vira-uma-proposta-de-valor-com-a-cont.ts

**Implementation:**
1. Escrever o teste que falha (RED) para o comportamento declarado
2. Implementar o mínimo para o teste passar (GREEN) e refatorar preservando a suíte verde

**ACs:**
- [ ] `bun test tests/cada-ideia-vira-uma-proposta-de-valor-com-a-cont.test.ts` — o comportamento declarado é observado pelo teste focado da task

**Visual:** N/A
**Documentation:** N/A
