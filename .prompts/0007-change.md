# PROMPT: O 500 do formulário e os testes que faltavam

**Status:** Pronto para planejamento
**Work ID:** 0007
**Origem:** relato do operador (2026-10-02) — `POST /ui/studies/:id/ideas` devolvendo `{"error":"INTERNAL_SERVER_ERROR","message":"Erro interno"}`
**System spec:** `.specs/system.json`
**Baseline:** system spec versao 1, status "Baseline parcial" (2026-09-29), commit `a82ce48`

## Delta da system spec

- **Capacidades afetadas:** CAP-014 (interface web) e CAP-015 (serviço HTTP) pela borda de erro. Nenhuma outra muda: as rotas e os corpos de erro continuam iguais.
- **Regras preservadas:** BR-001 a BR-023 permanecem intactas. Toda rota de UI que muda estado continua exigindo mesma origem e token.
- **Regras alteradas:** nenhuma regra vigente muda; o Work acrescenta regras novas à spec do Work.
- **Contratos afetados:** CON-003 (interface web). O contrato de erro ganha o ramo do `HTTPException` de middleware.
- **Qualidades, entidades e integrações relacionadas:** nenhuma. Não há chamada a provedor nem artefato novo.
- **Gaps tocados:** nenhum.
- **Reconciliação esperada após implementação:** CON-003 passa a dizer que o status de uma recusa de middleware é preservado e que a mesma origem é aceita por `Origin`, `Referer` ou `Sec-Fetch-Site: same-origin`.

## Problema e resultado

**Problema:** o `POST` de qualquer formulário da interface respondia `{"error":"INTERNAL_SERVER_ERROR","message":"Erro interno"}` em 1 ms. A interface instala o middleware `csrf()` do Hono além do `requireCsrf` próprio; quando ele rejeita, lança `HTTPException`, e o `errorHandler` do serviço só reconhece `DomainError` — o 403 dela virava 500 e o motivo sumia. Além disso o `secureHeaders()` manda `Referrer-Policy: no-referrer`, então o fallback por `Referer` do `requireCsrf` nunca existia no navegador, e o middleware do Hono recusa POST de mesma origem de clientes que omitem `Origin` e `Sec-Fetch-Site`. Não havia nenhum teste de ponta a ponta pelo HTTP real: os testes usavam `app.request` no sub-app da UI, sem o `onError` do app composto e sem socket.

**Resultado esperado:** nenhuma recusa de middleware vira 500 — ela chega ao operador com o status real; a mesma origem é aceita por `Origin`, `Referer` ou `Sec-Fetch-Site: same-origin`, sempre com o token exigido; e existe um e2e que sobe o serviço completo num socket real e percorre a jornada do operador pelo caminho sem JavaScript.

## Contexto confirmado

- **O 500 é reproduzível.** `curl -X POST http://vps:3000/ui/studies/<id>/ideas -d count=1` (sem `Origin`) responde 500 com o corpo genérico; com `Sec-Fetch-Site: same-origin` responde 403 do `requireCsrf`.
- **A origem do erro é o middleware do Hono.** `ui.use(csrf())` lança `HTTPException(403, {res})`; `String(err)` vira `"Error"` porque ela vai sem mensagem, que é exatamente o que o log registrou.
- **As sete rotas mutantes da UI já usam `requireCsrf`.** O middleware embutido é redundante e mais fraco (não olha o token).
- **O `Referrer-Policy: no-referrer` está no ar.** Verificado com `curl -D-`: o fallback por `Referer` não vale para navegador.
- **Os testes atuais não pegam isso.** `tests/ui.test.ts` exercita o sub-app da UI por `app.request`, sem o `onError` do app composto, e nenhum teste sobe um socket real.

## Atores e valor

- **ACT-001 Usuário da interface web:** usa qualquer formulário sem receber "Erro interno" e sem o servidor esconder o motivo.
- **ACT-003 Operador/consultor:** tem evidência mecânica de que o caminho real do navegador funciona.

## Escopo

### Inclui

- Preservar o status do `HTTPException` de middleware no handler de erro.
- Remover o `csrf()` do Hono do sub-app da UI, mantendo o `requireCsrf` como única barreira e documentando por quê.
- Aceitar `Sec-Fetch-Site: same-origin` como sinal de mesma origem quando faltam `Origin` e `Referer`.
- Teste e2e com socket real cobrindo criação, execução, adição pelo formulário, exclusão de ideia e de estudo.

### Não inclui

- Mudar rotas, corpos de erro ou o esquema de token.
- Proteger a API pública com CSRF (ela não tem formulários e continua igual).
- Trocar o `requireCsrf` por um middleware de terceiro.

## Cenários de usuário

### US-001 — Formulário sem `Origin` continua funcionando (P1)

**Ator:** usuário da interface web.
**Valor independente:** o operador adiciona ideias num navegador que omite `Origin`, em vez de receber um erro.
**Verificação independente:** com `Sec-Fetch-Site: same-origin` e o token, o POST responde 303 e o estudo ganha a ideia.

1. **Given** um estudo concluído, **When** o operador adiciona uma ideia pelo formulário, **Then** a resposta é 303 e a ideia entra no estudo (FR-001).

### US-002 — Recusa de middleware não vira 500 (P1)

**Ator:** operador/consultor.
**Valor independente:** quando algo recusa a requisição, o operador vê o status real.
**Verificação independente:** um POST sem nenhum sinal de mesma origem responde 403 com `CSRF_ORIGIN_INVALID`, nunca 500.

1. **Given** um POST de formulário sem `Origin`, `Referer` e `Sec-Fetch-Site`, **When** ele chega ao app, **Then** a resposta é 403 e não 500 (FR-002).

## Contrato observável

- **Entradas:** as mesmas rotas de hoje.
- **Saídas e efeitos:** os POSTs de formulário respondem 303 quando aceitos; a recusa responde 403 com corpo JSON; nenhum `HTTPException` de middleware produz 500.
- **Erros:** `HTTPException` preserva o próprio status e a própria resposta.

## Requisitos

### Funcionais

- **FR-001:** o POST de formulário da UI é aceito com `Origin` exato, `Referer` do próprio host ou `Sec-Fetch-Site: same-origin`, sempre exigindo o token.
- **FR-002:** o handler de erro preserva o status do `HTTPException`, e nenhuma recusa de middleware vira 500.

### Qualidade e restrições

- **QR-001:** um e2e sobre socket real percorre criação, execução, adição pelo formulário e exclusões.
- **QR-002:** a API pública e o caminho sem JavaScript continuam com as mesmas rotas e status.
- **QR-003:** a suíte existente permanece verde e nenhum teste antigo é reescrito para acomodar a mudança.

## Casos de borda

- **EC-001:** `Origin` de outro host com token válido responde 403 (FR-001).
- **EC-002:** `Sec-Fetch-Site: cross-site` com token válido responde 403 (FR-001).
- **EC-003:** POST sem token responde 403 e não cria estudo (FR-001).

## Critérios de sucesso

- **SC-001:** `bun test tests/e2e.test.ts` prova a jornada completa por HTTP real (QR-001).
- **SC-002:** o teste de composição prova que um `HTTPException` de middleware mantém o status (FR-002).

## Premissas

- **A-001:** o `requireCsrf` (mesma origem + token) é barreira suficiente para as rotas mutantes da UI, o que dispensa o middleware embutido.
- **A-002:** `Sec-Fetch-Site` é cabeçalho controlado pelo navegador e, junto do token, não enfraquece a checagem.

## Componentes afetados

- `src/infrastructure/http/errors.ts` — `buildErrorHandler`.
- `src/infrastructure/http/ui/routes.tsx` — montagem do sub-app.
- `src/infrastructure/http/ui/security.ts` — `requireCsrf`.
- `tests/smoke.test.ts`, `tests/ui.test.ts`, `tests/e2e.test.ts`.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
|---|---|---|
| `FR-001` | US-001, EC-001, EC-002, EC-003, SC-001 | asserções de 303/403 por sinal de origem e o e2e do formulário |
| `FR-002` | US-002, SC-002 | teste de composição com `HTTPException` |
| `QR-001` | SC-001 | `bun test tests/e2e.test.ts` |
| `QR-002` | SC-001 | e2e cria, executa e exclui pelas mesmas rotas |
| `QR-003` | SC-002 | suíte completa verde |
