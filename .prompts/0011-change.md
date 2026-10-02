# PROMPT: O modal de provedor testa e cancela corretamente

**Status:** Pronto para planejamento
**Work ID:** 0011
**Origem:** verificação em navegador real do operador (2026-10-02) sobre o Work 0010 — dois defeitos no script da página
**System spec:** `.specs/system.json`
**Baseline:** system spec versao 1, status "Baseline parcial" (2026-09-29), commit `9206b7a`

## Delta da system spec

- **Capacidades afetadas:** CAP-014 (interface web).
- **Regras preservadas:** BR-018, BR-021 e BR-022 continuam valendo.
- **Regras alteradas:** nenhuma regra vigente muda; o Work acrescenta regras novas à spec do Work.
- **Contratos afetados:** nenhum contrato de borda muda: `POST /api/settings/test` continua estrito.
- **Qualidades, entidades e integrações relacionadas:** nenhuma.
- **Gaps tocados:** nenhum.
- **Reconciliação esperada após implementação:** a spec da interface passa a dizer que o teste envia só os campos que a sonda usa e que cancelar o modal devolve a lista ao que estava escolhido.

## Problema e resultado

**Problema:** dois defeitos que só aparecem no navegador. (1) O botão **Testar** mandava o objeto inteiro do formulário, incluindo `name`; o `POST /api/settings/test` é `.strict()` e recusou o corpo com `payload invalido: (raiz): Unrecognized key(s) in object: 'name'`, então o botão nunca testava nada. (2) **Cancelar** não devolvia a lista ao provedor que estava escolhido: o `restore` indexava o mapa de valores anteriores pelo *elemento* do formulário, e a chave usada para guardar era o tipo (`llm`/`decider`), então o valor nunca era encontrado e a lista continuava mostrando "+ adicionar provedor".

**Resultado esperado:** o Testar envia só `kind`, `url`, `model` e `apiKey` — a sonda valida a configuração de verdade — e cancelar devolve cada lista ao que estava escolhido.

## Contexto confirmado

- **O Testar falhava com 422.** Veredito observado no navegador: `falhou: payload invalido: (raiz): Unrecognized key(s) in object: 'name'`.
- **O Cancelar deixava a lista em "+ adicionar provedor".** Observado no navegador: a lista voltava com `__new` selecionado em vez do provedor ativo.
- **A sonda funciona contra provedor real.** Depois da correção, o mesmo botão devolveu `falhou: a chave foi recusada (HTTP 401): Authentication Fails, Your api key: ****este is invalid` contra `api.deepseek.com`, provando que o teste fala com o provedor.
- **`/api/settings/test` é estrito de propósito.** Recusar campo desconhecido é o que impede o corpo de introduzir chaves fora do contrato.

## Atores e valor

- **ACT-003 Operador/consultor:** testa a credencial antes de salvar e não perde a escolha da lista ao desistir.

## Escopo

### Inclui

- Enviar ao teste apenas os campos que a sonda usa.
- Restaurar a escolha da lista ao cancelar o modal.

### Não inclui

- Afrouxar o contrato de `POST /api/settings/test`.
- Mudar o CRUD do catálogo ou a migração do formato antigo.

## Cenários de usuário

### US-001 — Testar valida a credencial (P1)

**Ator:** operador.
**Valor independente:** ele descobre na hora se a URL, o modelo e a chave funcionam.
**Verificação independente:** no navegador, o Testar contra um provedor real devolve veredito (ok ou o motivo da recusa).

1. **Given** o modal preenchido, **When** o operador clica Testar, **Then** o corpo enviado tem só os campos da sonda e a resposta traz o veredito (FR-001).

### US-002 — Cancelar não muda a escolha (P2)

**Ator:** operador.
**Valor independente:** desistir de cadastrar não troca o provedor em uso.
**Verificação independente:** abrir o modal pelo "adicionar provedor" e cancelar devolve a lista ao valor anterior.

1. **Given** uma lista com o provedor ativo, **When** o operador abre "adicionar provedor" e cancela, **Then** a lista volta a mostrar o provedor que estava escolhido (FR-002).

## Contrato observável

- **Entradas:** `POST /api/settings/test` (inalterado).
- **Saídas e efeitos:** o corpo do teste tem `kind`, `url`, `model` e `apiKey`; cancelar restaura o `select`.
- **Erros:** 422 continua sendo a resposta para campo fora do contrato.

## Requisitos

### Funcionais

- **FR-001:** o script da página envia ao teste só os campos da sonda, sem o nome do provedor.
- **FR-002:** o script da página restaura a escolha da lista ao fechar o modal por cancelamento.

### Qualidade e restrições

- **QR-001:** a suíte cobre as duas regras no HTML servido; a verificação em navegador prova o comportamento.
- **QR-002:** o contrato de `/api/settings/test` continua estrito e a API pública não muda.

## Casos de borda

- **EC-001:** cancelar depois de escolher "+ adicionar provedor" devolve a lista ao provedor ativo (FR-002).
- **EC-002:** testar com a chave errada devolve `falhou: a chave foi recusada` (FR-001).

## Critérios de sucesso

- **SC-001:** `bun test` prova que o script envia o corpo da sonda e restaura a lista (FR-001, FR-002).
- **SC-002:** a verificação em navegador prova o teste contra um provedor real e o cancelamento (FR-001, FR-002).

## Premissas

- **A-001:** o nome do provedor é rótulo da tela e não participa da sonda.

## Componentes afetados

- `src/infrastructure/http/ui/pages.tsx` — `SETTINGS_SCRIPT`.
- `tests/ui.test.ts` — asserções do script servido.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
|---|---|---|
| `FR-001` | US-001, EC-002, SC-001, SC-002 | asserção do corpo da sonda e verificação no navegador |
| `FR-002` | US-002, EC-001, SC-001, SC-002 | asserção do restore por tipo e verificação no navegador |
| `QR-001` | SC-001 | `bun test` |
| `QR-002` | SC-001 | suíte completa verde |
