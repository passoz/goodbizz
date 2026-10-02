# PROMPT: Origem opaca não veta o formulário

**Status:** Pronto para planejamento
**Work ID:** 0009
**Origem:** relato do operador (2026-10-02) — `POST /ui/studies/:id/ideas` devolvendo `{"error":"CSRF_ORIGIN_INVALID"}` mesmo depois do Work 0008
**System spec:** `.specs/system.json`
**Baseline:** system spec versao 1, status "Baseline parcial" (2026-09-29), commit `54fe45a`

## Delta da system spec

- **Capacidades afetadas:** CAP-014 (interface web).
- **Regras preservadas:** BR-018 continua exigindo token em tempo constante; BR-021 não muda.
- **Regras alteradas:** nenhuma regra vigente muda; o Work acrescenta regras novas à spec do Work.
- **Contratos afetados:** CON-003 (interface web).
- **Qualidades, entidades e integrações relacionadas:** nenhuma.
- **Gaps tocados:** nenhum.
- **Reconciliação esperada após implementação:** CON-003 passa a dizer que o token é conferido antes do sinal de origem e que só um sinal que aponta inequivocamente para outro site veta.

## Problema e resultado

**Problema:** o cliente do operador manda `Origin: null` — origem opaca, como extensão de navegador ou iframe sandbox. A regra do Work 0008 vetava qualquer sinal presente que não fosse exatamente o próprio host, então `null` vetava e o formulário seguia inutilizável. O log do próprio Work 0008 entregou o campo (`origin: "null"`), o que não existia antes.

**Resultado esperado:** o token é conferido primeiro e é ele quem decide; os sinais de origem só vetam quando apontam inequivocamente para outro site (`Origin` presente, diferente de `null` e do próprio host, ou `Sec-Fetch-Site: cross-site`).

## Contexto confirmado

- **O cliente manda `Origin: null`.** Extraído do log de produção: `{"path":"/ui/studies/.../ideas","host":"vps:3000","origin":"null"}`.
- **O host do operador casa com a origem do app.** Com `Origin: http://vps:3000` a requisição passa da checagem de origem.
- **A defesa real é o token.** O cookie é `SameSite=Lax`, então um POST cross-site não chega com ele; o token é assinado e tem 32 bytes.
- **Um ataque com `Origin: null` não passa.** Sem o cookie `SameSite=Lax` ele morre na conferência do token, que agora vem primeiro.

## Atores e valor

- **ACT-001 Usuário da interface web:** usa o formulário em clientes de origem opaca (extensão, navegador embutido).
- **ACT-003 Operador/consultor:** lê no log qual sinal vetou e se o cookie/token estavam presentes.

## Escopo

### Inclui

- Conferir o token antes do sinal de origem.
- Tratar `Origin: null`, `Sec-Fetch-Site: none` e `same-site` como não decisivos.
- Vetar apenas `Origin` presente diferente do próprio host e de `null`, ou `Sec-Fetch-Site: cross-site`.

### Não inclui

- Remover a exigência do token ou trocar o esquema de cookie.
- Proteger a API pública com CSRF.
- Mudar rotas, corpos de erro aceitos ou o caminho sem JavaScript.

## Cenários de usuário

### US-001 — Cliente de origem opaca usa o formulário (P1)

**Ator:** usuário da interface web.
**Valor independente:** o operador volta a adicionar ideias.
**Verificação independente:** POST com `Origin: null` e o token do cookie responde 303.

1. **Given** um estudo, **When** o POST chega com `Origin: null` e o token, **Then** o formulário é aceito (FR-001).

### US-002 — O ataque continua barrado (P1)

**Ator:** operador/consultor.
**Valor independente:** abrir a exceção não abre a porta.
**Verificação independente:** POST com `Origin` de outro host ou `Sec-Fetch-Site: cross-site` responde 403 mesmo com token válido.

1. **Given** um POST cross-site, **When** ele traz `Origin` de outro host, **Then** a resposta é 403 `CSRF_ORIGIN_INVALID` (FR-001).

## Contrato observável

- **Entradas:** as mesmas rotas de hoje.
- **Saídas e efeitos:** 303 quando o token confere e nenhum sinal aponta para outro site; 403 `CSRF_TOKEN_INVALID` sem token; 403 `CSRF_ORIGIN_INVALID` para `Origin` de outro host ou `cross-site`.
- **Erros:** a ordem passa a ser token e depois origem.

## Requisitos

### Funcionais

- **FR-001:** o `requireCsrf` confere o token primeiro e só veta origem quando o sinal aponta inequivocamente para outro site, tratando `Origin: null` e `Sec-Fetch-Site` não cross-site como não decisivos.

### Qualidade e restrições

- **QR-001:** a suíte cobre `Origin: null` com token, o veto de host estranho e o veto de `cross-site`.
- **QR-002:** a API pública e o caminho sem JavaScript continuam iguais.
- **QR-003:** nenhum teste antigo é apagado; os que fixavam veto amplo passam a fixar o contrato novo.

## Casos de borda

- **EC-001:** `Origin: null` sem token responde 403 de token (FR-001).
- **EC-002:** `Origin` de outro host com token responde 403 de origem (FR-001).
- **EC-003:** `Sec-Fetch-Site: cross-site` com token responde 403 de origem (FR-001).

## Critérios de sucesso

- **SC-001:** `bun test` prova o caminho com `Origin: null` e os dois vetos (FR-001).

## Premissas

- **A-001:** `Origin: null` não identifica o autor da requisição, então não pode ser tratado como "outro site".
- **A-002:** o token sobre cookie `SameSite=Lax` é suficiente como defesa principal.

## Componentes afetados

- `src/infrastructure/http/ui/security.ts` — `requireCsrf`.
- `tests/ui.test.ts`, `tests/e2e.test.ts`.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
|---|---|---|
| `FR-001` | US-001, US-002, EC-001, EC-002, EC-003, SC-001 | asserções de `Origin: null` com token, veto de host estranho e veto de `cross-site` |
| `QR-001` | SC-001 | `bun test` |
| `QR-002` | SC-001 | e2e cria e executa pelas mesmas rotas |
| `QR-003` | SC-001 | suíte completa verde |
