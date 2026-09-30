# Tasks: Tratar erro do provedor LLM como falha tipada em vez de erro de parsing

**Contract version:** 3
**Work ID:** 0002

## Execution contract

| Component | Purpose |
|-----------|---------|
| `llm` | Cliente HTTP de chat/completions: politica de erro por classe de status e reenvio |

## Global gates
- [ ] `bun test` — a suíte completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.

### [ ] [1.1] Checar response.ok, classificar o status e preservar a mensagem do provedor

**Requirement:** FR-001
**Depends on:** none
**Behavior:** com um provedor que responde 402 e corpo JSON de erro, o cliente LLM levanta LlmError(LLM_FAILED, 502) em uma unica chamada, e a mensagem contem o status HTTP mais o texto devolvido; status deterministico aborta sem reenvio, enquanto 429 e 5xx sao, com o status citado na falha final quando as tentativas acabam
**Components:** llm
**Files:** `src/infrastructure/llm.ts`, `tests/llm.test.ts`
**Implementation files:** `src/infrastructure/llm.ts`
**Test files:** `tests/llm.test.ts`

**RED:**
- `bun test` — o cliente nao checa response.ok, entao a mensagem do provedor se perde e o teste que exige 'Insufficient Balance' falha com 'response missing choices[0].message.content'

**Implementation:**
1. Escrever os testes que falham (RED): 402 com mensagem do provedor, corpo nao-JSON, contagem de chamadas em 402 e 401, 429 persistente e segredo no corpo de erro
2. Checar response.ok antes do extrator, ler o corpo com guarda de parse, classificar o status retentavel no adapter e montar a mensagem com status mais texto do provedor depois de scrub (GREEN), preservando o backoff para transitorio e erro de rede

**ACs:**
- [ ] `bun test` — a suite completa passa com os novos testes de status, reenvio e segredo
- [ ] `bun run check` — o typecheck estrito passa
- [ ] `bunx eslint src/infrastructure/llm.ts tests/llm.test.ts && bunx prettier --check src/infrastructure/llm.ts tests/llm.test.ts` — o lint e a formatacao dos arquivos tocados passam

**Visual:** N/A
**Documentation:** N/A
