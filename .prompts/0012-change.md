# PROMPT: Editar provedor abre o modal com o tipo certo

**Status:** Pronto para planejamento
**Work ID:** 0012
**Origem:** verificação em navegador do operador (2026-10-02) sobre o Work 0011 — o Editar não preenchia o tipo
**System spec:** `.specs/system.json`
**Baseline:** system spec versao 1, status "Baseline parcial" (2026-09-29), commit `778cd4c`

## Delta da system spec

- **Capacidades afetadas:** CAP-014 (interface web).
- **Regras preservadas:** BR-018, BR-021 e BR-022 continuam valendo.
- **Regras alteradas:** nenhuma regra vigente muda; o Work acrescenta regras novas à spec do Work.
- **Contratos afetados:** nenhum contrato de borda muda: `POST|PATCH /api/settings/providers` continua exigindo `kind` válido.
- **Qualidades, entidades e integrações relacionadas:** nenhuma.
- **Gaps tocados:** nenhum.
- **Reconciliação esperada após implementação:** a spec da interface passa a dizer que o modal herdado da lista carrega o tipo do provedor selecionado.

## Problema e resultado

**Problema:** clicar em **Editar** abria o modal preenchido com nome, URL e modelo, mas sem o tipo: `readProfile` lia `data-kind` do `<select>`, e o atributo está no `<form>` da lista. O `kind` ia vazio e tanto o Testar quanto o Salvar respondiam `payload invalido: kind: Invalid enum value. Expected 'llm' | 'decider', received ''`.

**Resultado esperado:** o modal aberto pelo Editar leva o tipo do provedor selecionado, então Testar e Salvar funcionam no caminho de edição — não só no de criação.

## Contexto confirmado

- **O caminho de criação funcionava.** "Adicionar provedor" passa `kind` explicitamente e o teste no navegador contra `api.deepseek.com` devolveu veredito real.
- **O caminho de edição não.** No navegador: `falhou: payload invalido: kind: Invalid enum value. Expected 'llm' | 'decider', received ''`.
- **O atributo está no formulário.** Cada lista é um `<form data-provider-picker data-kind="llm|decider">`; o `<select>` não tem `data-kind`.

## Atores e valor

- **ACT-003 Operador/consultor:** edita um provedor já cadastrado (trocar modelo ou chave) sem recomeçar o cadastro.

## Escopo

### Inclui

- Ler o tipo do provedor selecionado do formulário da lista.

### Não inclui

- Afrouxar o contrato de `kind` na API.
- Mudar o caminho de criação ou o CRUD.

## Cenários de usuário

### US-001 — Editar leva o tipo (P1)

**Ator:** operador.
**Valor independente:** ele ajusta um provedor existente e o Testar responde com o veredito, em vez de erro de validação.
**Verificação independente:** no navegador, abrir o modal pelo Editar, clicar Testar e receber `ok:` ou `falhou: a chave…`.

1. **Given** uma lista com o provedor ativo, **When** o operador clica em Editar e depois em Testar, **Then** o corpo leva o tipo da lista e a resposta é um veredito da sonda (FR-001).

## Contrato observável

- **Entradas:** `POST /api/settings/test` e `PATCH /api/settings/providers/:id` (inalterados).
- **Saídas e efeitos:** o modal do Editar carrega `kind`, `name`, `url` e `model` do provedor selecionado.
- **Erros:** 422 continua sendo a resposta para `kind` inválido.

## Requisitos

### Funcionais

- **FR-001:** o script da página lê o tipo do formulário da lista ao montar o provedor selecionado, e o modal do Editar leva esse tipo.

### Qualidade e restrições

- **QR-001:** a suíte cobre a leitura do tipo no HTML servido; a verificação em navegador prova o Editar.
- **QR-002:** o contrato da API não muda e o caminho de criação continua igual.

## Casos de borda

- **EC-001:** Editar sem nenhum provedor selecionado (padrão do ambiente) avisa e não abre o modal (FR-001).

## Critérios de sucesso

- **SC-001:** `bun test` prova que o script lê o tipo do formulário (FR-001).
- **SC-002:** a verificação em navegador prova o Editar com Testar respondendo veredito (FR-001).

## Premissas

- **A-001:** o tipo é propriedade da lista, não da opção escolhida.

## Componentes afetados

- `src/infrastructure/http/ui/pages.tsx` — `SETTINGS_SCRIPT`.
- `tests/ui.test.ts` — asserção do script servido.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
|---|---|---|
| `FR-001` | US-001, EC-001, SC-001, SC-002 | asserção da leitura do tipo e verificação no navegador |
| `QR-001` | SC-001 | `bun test` |
| `QR-002` | SC-001 | suíte completa verde |
