# PROMPT: O formulário aceita cliente sem sinal de origem

**Status:** Pronto para planejamento
**Work ID:** 0008
**Origem:** relato do operador (2026-10-02) — `POST /ui/studies/:id/ideas` devolvendo `{"error":"CSRF_ORIGIN_INVALID"}` no navegador dele
**System spec:** `.specs/system.json`
**Baseline:** system spec versao 1, status "Baseline parcial" (2026-09-29), commit `1831fcf`

## Delta da system spec

- **Capacidades afetadas:** CAP-014 (interface web).
- **Regras preservadas:** BR-018 continua exigindo token CSRF em tempo constante; BR-021 (a API pública não entra no filtro) não muda.
- **Regras alteradas:** nenhuma regra vigente muda; o Work acrescenta regras novas à spec do Work.
- **Contratos afetados:** CON-003 (interface web).
- **Qualidades, entidades e integrações relacionadas:** nenhuma.
- **Gaps tocados:** nenhum.
- **Reconciliação esperada após implementação:** CON-003 passa a dizer que um sinal de origem presente que diverge é veto, e que a ausência de sinal não recusa o formulário — a defesa passa a ser o token do double-submit sobre cookie `SameSite=Lax`.

## Problema e resultado

**Problema:** depois do Work 0007, o formulário continuava recusado com `CSRF_ORIGIN_INVALID` no navegador do operador. Medido com `curl --resolve vps:3000`: quando o cliente manda `Origin: http://vps:3000` a origem casa e a recusa seguinte é de token; portanto o cliente do operador não manda `Origin`, nem `Referer` (o `Referrer-Policy: no-referrer` suprime), nem `Sec-Fetch-Site: same-origin`. Exigir um sinal que o cliente não emite deixava o formulário inutilizável e, pior, o diagnóstico era impossível: a recusa não registrava o que o cliente mandou.

**Resultado esperado:** um sinal de origem presente que diverge recusa a requisição; sem sinal nenhum, o token do double-submit decide, porque o cookie é `SameSite=Lax` e um POST cross-site não chega com ele. Toda recusa passa a registrar os sinais e a presença do token, para o próximo relato ser diagnosticável.

## Contexto confirmado

- **A origem do host do operador casa.** `curl --resolve vps:3000:100.79.151.31 -H 'Origin: http://vps:3000'` responde `CSRF_TOKEN_INVALID`, ou seja, passou pela checagem de origem.
- **Sem sinal nenhum ele era recusado.** O mesmo POST sem `Origin`/`Referer`/`Sec-Fetch-Site` respondia `CSRF_ORIGIN_INVALID`.
- **A captura do operador é o visualizador de JSON do Firefox.** As abas "JSON/Dados brutos/Cabeçalhos" identificam o cliente, e nenhum dos três sinais chegou ao servidor.
- **O cookie é `SameSite=Lax` e o token tem 32 bytes.** Um POST cross-site não carrega o cookie, e o token não é adivinhável nem legível por outra origem.
- **A recusa não deixava rastro.** Nem os sinais do cliente nem a presença do token apareciam no log.

## Atores e valor

- **ACT-001 Usuário da interface web:** usa o formulário no navegador que ele tem, sem receber 403.
- **ACT-003 Operador/consultor:** diagnostica uma recusa pelo log, sem reproduzir no escuro.

## Escopo

### Inclui

- Veto quando um sinal de origem presente diverge.
- Aceitar a ausência de sinal, mantendo o token obrigatório.
- Registrar os sinais do cliente e a presença do cookie/token em cada recusa.

### Não inclui

- Remover a exigência do token ou trocar o esquema de cookie.
- Proteger a API pública com CSRF.
- Mudar rotas, corpos de erro aceitos ou o caminho sem JavaScript.

## Cenários de usuário

### US-001 — Navegador sem sinal de origem usa o formulário (P1)

**Ator:** usuário da interface web.
**Valor independente:** o operador consegue adicionar ideias no navegador dele.
**Verificação independente:** POST sem nenhum sinal, com o token do cookie, responde 303.

1. **Given** um estudo, **When** o POST chega sem `Origin`, `Referer` e `Sec-Fetch-Site` mas com o token, **Then** o formulário é aceito (FR-001).

### US-002 — Recusa explica a si mesma (P2)

**Ator:** operador/consultor.
**Valor independente:** o próximo relato de 403 chega com os sinais do cliente no log.
**Verificação independente:** a recusa por origem divergente registra `origin`, `referer`, `secFetchSite` e `host`.

1. **Given** um POST cross-site, **When** ele é recusado, **Then** o log traz os sinais recebidos (FR-002).

## Contrato observável

- **Entradas:** as mesmas rotas de hoje.
- **Saídas e efeitos:** os POSTs de formulário respondem 303 quando o token confere e nenhum sinal diverge; `Origin` de outro host ou `Sec-Fetch-Site: cross-site` respondem 403.
- **Erros:** `CSRF_ORIGIN_INVALID` só para sinal divergente; `CSRF_TOKEN_INVALID` para token ausente ou divergente.

## Requisitos

### Funcionais

- **FR-001:** o `requireCsrf` veta sinal de origem divergente e aceita a ausência de sinal, exigindo sempre o token.
- **FR-002:** toda recusa de CSRF registra os sinais recebidos e a presença do cookie e do token.

### Qualidade e restrições

- **QR-001:** a suíte cobre os dois resultados por sinal e o e2e reproduz o cliente sem sinal.
- **QR-002:** a API pública e o caminho sem JavaScript continuam iguais.
- **QR-003:** nenhum teste antigo é apagado para acomodar a mudança; os que fixavam "sem sinal = 403" passam a fixar o contrato novo.

## Casos de borda

- **EC-001:** `Origin` de outro host com token válido responde 403 (FR-001).
- **EC-002:** `Sec-Fetch-Site: cross-site` com token válido responde 403 (FR-001).
- **EC-003:** sem sinal e sem token responde 403 de token (FR-001).

## Critérios de sucesso

- **SC-001:** `bun test` prova os dois resultados por sinal e o caminho sem sinal com token (FR-001).
- **SC-002:** o log da recusa traz os sinais do cliente (FR-002).

## Premissas

- **A-001:** o cookie `SameSite=Lax` somado ao token assinado é defesa suficiente quando o cliente não oferece sinal de origem.
- **A-002:** um sinal presente é confiável, porque `Origin`, `Referer` e `Sec-Fetch-*` são controlados pelo navegador.

## Componentes afetados

- `src/infrastructure/http/ui/security.ts` — `requireCsrf` e o log de recusa.
- `src/infrastructure/http/ui/routes.tsx` — repasse do logger.
- `src/index.ts` — composição.
- `tests/ui.test.ts`, `tests/e2e.test.ts`.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
|---|---|---|
| `FR-001` | US-001, EC-001, EC-002, EC-003, SC-001 | asserções de 303/403 por sinal e o e2e sem sinal |
| `FR-002` | US-002, SC-002 | asserção do log de recusa com os sinais |
| `QR-001` | SC-001 | `bun test` |
| `QR-002` | SC-001 | e2e cria e executa pelas mesmas rotas |
| `QR-003` | SC-001 | suíte completa verde |
