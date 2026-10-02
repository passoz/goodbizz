# Tasks: Editar provedor abre o modal com o tipo certo

**Contract version:** 3
**Work ID:** 0012

## Execution contract

| Component | Purpose |
|-----------|---------|
| `provider-modal` | Script do modal de provedor: o provedor selecionado carrega o tipo da propria lista |

## Global gates
- [ ] `bun test` — a suite completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.
- [ ] `bunx eslint . && bunx prettier --check .` — lint e formatacao passam.

### [ ] [1.1] Ler o tipo do provedor no formulário da lista

**Requirement:** FR-001
**Depends on:** none
**Behavior:** o script monta o provedor selecionado lendo o tipo do formulario da lista, entao o modal do Editar leva esse tipo para o Testar e o Salvar
**Components:** provider-modal
**Files:** `src/infrastructure/http/ui/pages.tsx`, `tests/ui.test.ts`
**Implementation files:** `src/infrastructure/http/ui/pages.tsx`
**Test files:** `tests/ui.test.ts`

**RED:**
- `bun test tests/ui.test.ts` — o script servido ainda le o tipo do `select`, entao a assercao nova falha

**Implementation:**
1. Escrever o teste que falha (RED): o HTML servido mostra o `selectedProfile` lendo o tipo do formulario da lista
2. Montar o provedor selecionado a partir do formulario (tipo) e da opcao (nome, URL, modelo, chave), removendo o leitor intermediario (GREEN)

**ACs:**
- [ ] `bun test` — a suite passa com a assercao do tipo lido do formulario
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/http/ui/pages.tsx tests/ui.test.ts && bunx prettier --check src/infrastructure/http/ui/pages.tsx tests/ui.test.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A
