# PROMPT: A falha da exclusão chega em português

**Status:** Pronto para planejamento
**Work ID:** 0006
**Origem:** observação do operador (2026-10-02) — captura de tela do diálogo "Excluir ideia" exibindo `idea undefined not found in study 01a0efeb-2dde-75f5-a182-420d255f937a`
**System spec:** `.specs/system.json`
**Baseline:** system spec versao 1, status "Baseline parcial" (2026-09-29), commit `ce577d3`

## Delta da system spec

- **Capacidades afetadas:** CAP-014 (interface web). Nenhuma outra capacidade muda: a API HTTP (CAP-013) continua devolvendo `{error, message}` e o serviço (CAP-001/CAP-011) continua lançando `NotFoundError` e `ConflictError` com os mesmos corpos.
- **Regras preservadas:** BR-001 a BR-023 permanecem intactas. As rotas de exclusão, o CSRF e o caminho sem JavaScript não mudam.
- **Regras alteradas:** nenhuma regra vigente muda; o Work acrescenta regras novas à spec do Work.
- **Contratos afetados:** CON-003 (interface web). CON-002 não muda: o corpo dos erros continua `{error, message}`.
- **Qualidades, entidades e integrações relacionadas:** nenhuma. Não há chamada a provedor nem artefato novo.
- **Gaps tocados:** nenhum.
- **Reconciliação esperada após implementação:** CON-003 passa a documentar que a tela do operador nunca recebe o texto cru do servidor: falhas conhecidas viram frases em português com o que fazer, e o texto cru fica no console para diagnóstico.

## Problema e resultado

**Problema:** o Work 0005 fez a falha da exclusão aparecer na tela, mas o que aparece é o texto cru do servidor. Quando a página está obsoleta e a ideia já não existe, o 404 do serviço (`NotFoundError`) chega como `idea undefined not found in study <uuid>`: inglês, com um id cru e sem instrução. O operador não sabe se deve recarregar, tentar de novo ou desistir — e o `undefined` do exemplo só existe porque o `summary_json` de estudos antigos perdia a identidade, o que já foi corrigido no commit `ce577d3`, mas o texto cru continua sendo o que qualquer 404 mostraria.

**Resultado esperado:** toda exclusão que falha mostra uma frase em português que diz o que fazer, escolhida pelo status — estudo em execução (409), item que já não existe (404) ou falha genérica —; o texto cru do servidor vai só para o console, para diagnóstico.

## Contexto confirmado

- **O texto cru chega à tela pelos dois diálogos.** `DELETE_MODAL_SCRIPT` usa `message || "falha ao excluir o estudo"` e `IDEA_DELETE_SCRIPT` usa `message || "falha ao excluir a ideia"`, onde `message` é o `body.message` do servidor.
- **A recusa por estudo em execução já é traduzida.** Os dois scripts já trocam o 409 por uma frase em português; o que falta é o 404 e o resto.
- **Os status são conhecidos e finitos.** `StudyService.delete` e `StudyService.removeIdea` só lançam `ConflictError` (409) e `NotFoundError` (404); as rotas de UI devolvem esses dois status ou deixam o erro subir.
- **O texto cru é útil para diagnóstico.** Ele identifica o id e o motivo técnico; por isso vai para o `console.error`, não para o lixo.
- **Os avisos já existem e são distintos da pergunta.** `#delete-error` e `#idea-delete-error`, ambos `role="alert"`, criados no Work 0005.

## Atores e valor

- **ACT-001 Usuário da interface web:** entende o que aconteceu com a exclusão e o que fazer, em vez de ler um erro técnico em inglês.
- **ACT-003 Operador/consultor:** continua com o texto cru no console quando precisa diagnosticar.

## Escopo

### Inclui

- Frase em português para o 404 ("o item não está mais lá; recarregue a página") nos dois diálogos.
- Frase em português para a falha genérica (rede ou status desconhecido) nos dois diálogos.
- Manutenção da frase de 409 já existente e do texto cru no `console.error`.

### Não inclui

- Mudar as rotas, os status ou os corpos de erro da API.
- Mudar a tradução do 409, feita no Work 0005.
- Mudar o caminho sem JavaScript, que posta nas mesmas rotas e redireciona.
- Tratar falhas de outras ações da página (renomear, executar).

## Cenários de usuário

### US-001 — Estudo que já não existe pede recarregar (P1)

**Ator:** usuário da interface web.
**Valor independente:** o operador entende que a lista está obsoleta e recarrega, em vez de ler um id cru.
**Verificação independente:** com o servidor respondendo 404, o diálogo mostra a frase de recarregar e mantém a pergunta.

1. **Given** uma página obsoleta, **When** o operador confirma a exclusão do estudo, **Then** o aviso diz que o estudo não está mais disponível e pede para recarregar (FR-001).

### US-002 — Ideia que já não existe pede recarregar (P1)

**Ator:** usuário da interface web.
**Valor independente:** o operador entende que a tabela está obsoleta e recarrega, em vez de ler `idea <id> not found in study <id>`.
**Verificação independente:** com o servidor respondendo 404, o diálogo de ideia mostra a frase de recarregar.

1. **Given** uma página obsoleta, **When** a exclusão de uma ideia falha com 404, **Then** o aviso diz que a ideia não está mais no estudo e pede para recarregar (FR-002).

## Contrato observável

- **Entradas:** as mesmas rotas de hoje — `DELETE /api/studies/:id` e `DELETE /api/studies/:id/ideas/:ideaId`.
- **Saídas e efeitos:** o HTML servido passa a carregar os scripts com as frases de 404 e de falha genérica; nenhuma rota, cabeçalho ou artefato muda.
- **Erros:** o aviso da tela deixa de receber o texto do servidor; o `console.error` recebe o status e o texto cru.

## Requisitos

### Funcionais

- **FR-001:** o diálogo de exclusão do estudo traduz o 404 e a falha genérica para frases em português com o que fazer, mantendo o texto cru no console.
- **FR-002:** o diálogo de exclusão de ideia traduz o 404 e a falha genérica para frases em português com o que fazer, mantendo o texto cru no console.

### Qualidade e restrições

- **QR-001:** a exclusão que funciona continua idêntica: 204 do servidor, volta para a lista no estudo e recarga da página na ideia.
- **QR-002:** a mudança vive em `src/infrastructure/http/ui`, é HTML e script de página, sem tocar em domínio, casos de uso ou API.
- **QR-003:** a suíte existente permanece verde e o caminho sem JavaScript continua postando nas mesmas rotas.

## Casos de borda

- **EC-001:** exclusão do estudo com 404, o aviso pede para recarregar e o diálogo não fecha (FR-001).
- **EC-002:** falha de rede na exclusão da ideia, o aviso diz para tentar de novo e o diálogo não fecha (FR-002).
- **EC-003:** recusa por estudo em execução (409), o aviso continua sendo a frase já existente (FR-001, FR-002).

## Critérios de sucesso

- **SC-001:** o teste de UI prova que o HTML servido carrega as frases de 404 e de falha genérica nos dois diálogos (FR-001, FR-002).
- **SC-002:** a verificação em navegador prova que um 404 no `fetch` escreve a frase de recarregar no aviso e não o texto do servidor (FR-002).

## Premissas

- **A-001:** o operador prefere uma instrução curta em português ao texto técnico, que ele não consegue acionar.
- **A-002:** o `console.error` é meio suficiente para o diagnóstico, porque quem depura abre o console.

## Componentes afetados

- `src/infrastructure/http/ui/pages.tsx` — `DELETE_MODAL_SCRIPT` e `IDEA_DELETE_SCRIPT`.
- `tests/ui.test.ts` — asserções das frases no HTML servido.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
|---|---|---|
| `FR-001` | US-001, EC-001, EC-003, SC-001 | asserção das frases no HTML do detalhe e da lista |
| `FR-002` | US-002, EC-002, EC-003, SC-001, SC-002 | asserção das frases no HTML do detalhe e verificação em navegador |
| `QR-001` | SC-002 | teste existente de exclusão com token continua verde |
| `QR-002` | SC-001 | typecheck estrito e diff restrito a `src/infrastructure/http/ui` e `tests` |
| `QR-003` | SC-001 | suíte completa verde e rota sem JS inalterada |
