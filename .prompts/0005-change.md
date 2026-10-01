# PROMPT: A exclusão precisa dizer por que falhou

**Status:** Pronto para planejamento
**Work ID:** 0005
**Origem:** relato do operador (2026-10-01) — `entrei num estudo. cliquei em excluir. nada aconteceu`
**System spec:** `.specs/system.json`
**Baseline:** system spec versao 1, status "Baseline parcial" (2026-09-29), commit `d6fc7bf`

## Delta da system spec

- **Capacidades afetadas:** CAP-014 (interface web). Nenhuma outra capacidade muda: a API HTTP (CAP-013) já responde 409 com o motivo, e o serviço (CAP-001/CAP-011) não muda.
- **Regras preservadas:** BR-001 a BR-023 permanecem intactas. O serviço continua recusando excluir um estudo em execução com `ConflictError`; a mudança é só de apresentação.
- **Regras alteradas:** nenhuma regra vigente muda; o Work acrescenta regras novas à spec do Work.
- **Contratos afetados:** CON-003 (interface web). CON-002 não muda: o corpo do 409 continua `{error, message}`.
- **Qualidades, entidades e integrações relacionadas:** nenhuma. Não há chamada a provedor nem artefato novo.
- **Gaps tocados:** nenhum.
- **Reconciliação esperada após implementação:** CON-003 passa a documentar que os diálogos de exclusão separam pergunta e falha, e que a exclusão recusada permanece na tela até o operador decidir.

## Problema e resultado

**Problema:** as duas exclusões da interface falham em silêncio ou de forma ilegível. Na exclusão do estudo, o diálogo troca a pergunta pela mensagem de erro no mesmo parágrafo: quando a recusa chega, o texto vira `study <id> is still running`, em inglês e sem instrução, e o diálogo continua aberto com o mesmo botão "Excluir". Na exclusão de ideia, o erro só vai para o `console.error` — a tela não muda em nada. Nos dois casos o operador conclui que o clique não fez nada, que foi exatamente o relato registrado.

**Resultado esperado:** toda exclusão que falha mostra, na própria tela, um aviso com o motivo em português e o que fazer; a pergunta do diálogo continua visível e distinta do aviso; e a exclusão que funciona continua idêntica.

## Contexto confirmado

- **A exclusão funciona quando o estudo não está rodando.** Verificado em navegador real: `DELETE /api/studies/:id` responde 204 e a página volta para a lista; `DELETE /api/studies/:id/ideas/:ideaId` responde 204 e a ideia some da tabela.
- **A recusa dedicada é o caso `inFlight`.** `StudyService.delete` e `StudyService.removeIdea` lançam `ConflictError` (409) enquanto o pipeline do estudo roda; o corpo é `{error:"CONFLICT", message:"study <id> is still running"}`.
- **O texto do diálogo de estudo é sobrescrito pela falha.** `DELETE_MODAL_SCRIPT` escreve o erro em `#delete-modal-text`, o mesmo elemento da pergunta.
- **A falha da exclusão de ideia não chega à tela.** `IDEA_DELETE_SCRIPT` só registra no console e reabilita o botão.
- **O diálogo de ideia já é um componente próprio.** Existe `IdeaDeleteDialog` com `#idea-delete-modal`, `#idea-delete-text`, `#idea-delete-confirm` e `#idea-delete-cancel`; falta um lugar para o aviso.

## Atores e valor

- **ACT-001 Usuário da interface web:** clica em excluir e, quando o servidor recusa, lê o motivo na tela em vez de concluir que o clique não funcionou.
- **ACT-003 Operador/consultor:** distingue "não deu para excluir agora" de "o estudo já foi embora".

## Escopo

### Inclui

- Um aviso próprio de erro nos dois diálogos de exclusão (estudo e ideia), com `role="alert"` e separado do texto da pergunta.
- Tradução da recusa por estudo em execução (409) para uma frase em português que diz o que fazer.
- Exibição do motivo de qualquer outra falha da exclusão de ideia na tela, em vez de só no console.

### Não inclui

- Cancelar ou interromper um estudo em execução: a recusa do serviço continua valendo.
- Esconder o botão de excluir enquanto o estudo roda (um estudo preso em `running` depois de um reinicio continuaria excluível).
- Mudar o corpo do 409 da API, o texto do domínio ou o contrato CON-002.
- Qualquer mudança na exclusão aplicada no servidor para o caminho sem JavaScript.

## Cenários de usuário

### US-001 — Exclusão do estudo recusada mostra o motivo (P1)

**Ator:** usuário da interface web.
**Valor independente:** o operador entende que o estudo não foi apagado e por quê, e não repete o clique às cegas.
**Verificação independente:** com o servidor respondendo 409, o diálogo mostra um aviso com o motivo e mantém a pergunta.

1. **Given** um estudo em execução, **When** o operador confirma a exclusão, **Then** o diálogo permanece aberto com a pergunta intacta e um aviso visível dizendo que o estudo ainda está rodando (FR-001).

### US-002 — Exclusão de ideia recusada mostra o motivo (P1)

**Ator:** usuário da interface web.
**Valor independente:** o operador vê que a ideia continua no estudo, em vez de achar que o clique se perdeu.
**Verificação independente:** com o servidor respondendo 409, o diálogo de ideia mostra um aviso com o motivo.

1. **Given** um estudo com ideias, **When** a exclusão de uma ideia falha, **Then** o diálogo mostra o aviso com o motivo e a ideia continua na tabela (FR-002).

## Contrato observável

- **Entradas:** as mesmas rotas de hoje — `DELETE /api/studies/:id` e `DELETE /api/studies/:id/ideas/:ideaId`.
- **Saídas e efeitos:** a página do estudo passa a renderizar `#delete-error` dentro do diálogo de estudo e `#idea-delete-error` dentro do diálogo de ideia, ambos vazios no HTML servido e preenchidos pelo script quando a exclusão falha; nenhuma rota, cabeçalho ou artefato muda.
- **Erros:** a recusa por estudo em execução passa a aparecer como uma frase em português que cita a execução em andamento; as demais falhas aparecem com a mensagem devolvida pelo servidor.

## Requisitos

### Funcionais

- **FR-001:** o diálogo de exclusão do estudo mostra a falha num aviso próprio, separado do texto da pergunta, e traduz a recusa por estudo em execução para uma frase em português.
- **FR-002:** o diálogo de exclusão de ideia mostra o motivo da falha num aviso próprio, em vez de apenas registrar no console.

### Qualidade e restrições

- **QR-001:** a exclusão que funciona continua idêntica: 204 do servidor, volta para a lista no estudo e recarga da página na ideia.
- **QR-002:** a mudança vive em `src/infrastructure/http/ui`, é HTML e um script de página, sem tocar em domínio, casos de uso ou API.
- **QR-003:** a suíte existente permanece verde e o caminho sem JavaScript continua postando nas mesmas rotas.

## Casos de borda

- **EC-001:** exclusão do estudo recusada com 409, o aviso cita a execução em andamento e o diálogo não fecha (FR-001).
- **EC-002:** falha genérica (500 ou rede) na exclusão do estudo, o aviso mostra a mensagem recebida e o diálogo não fecha (FR-001).
- **EC-003:** exclusão de ideia recusada, o aviso aparece no diálogo e a tabela continua com a ideia (FR-002).

## Critérios de sucesso

- **SC-001:** o teste de UI prova os dois elementos de aviso no HTML servido, vazios e com `role="alert"` (FR-001, FR-002).
- **SC-002:** a verificação visual prova que a recusa 409 escreve o motivo no aviso e mantém a pergunta do diálogo (FR-001).

## Premissas

- **A-001:** o operador prefere uma mensagem em português a manter a recusa crua em inglês.
- **A-002:** manter o botão de excluir visível enquanto o estudo roda, com a recusa explicada, é melhor que esconder a ação.

## Componentes afetados

- `src/infrastructure/http/ui/pages.tsx` — `DeleteDialog`, `DELETE_MODAL_SCRIPT`, `IdeaDeleteDialog` e `IDEA_DELETE_SCRIPT`.
- `tests/ui.test.ts` — asserções dos avisos no HTML servido.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
|---|---|---|
| `FR-001` | US-001, EC-001, EC-002, SC-001, SC-002 | asserção de `#delete-error` no HTML do detalhe e da lista |
| `FR-002` | US-002, EC-003, SC-001 | asserção de `#idea-delete-error` no HTML do detalhe |
| `QR-001` | SC-002 | teste existente de exclusão com token continua verde |
| `QR-002` | SC-001 | typecheck estrito e diff restrito a `src/infrastructure/http/ui` e `tests` |
| `QR-003` | SC-001 | suíte completa verde e rota sem JS inalterada |