# PROMPT: Provedores trocam de verdade e a ideia carrega a data de geracao

**Status:** Pronto para planejamento
**Work ID:** 0013
**Origem:** pedido do operador na sessao de 2026-10-03 sobre o estado entregue pelos Works 0010-0012
**System spec:** `.specs/system.json`
**Baseline:** system spec versao 1, status "Baseline parcial" (2026-09-29), commit `0257fbf`

## Delta da system spec

- **Capacidades afetadas:** CAP-009 (relatorios deterministas), CAP-011 (cache), CAP-013 (API), CAP-014 (interface web), CAP-015 (persistencia), CAP-016 (configuracao/segredos).
- **Regras preservadas:** BR-010, BR-015, BR-017, BR-018, BR-019, BR-021 e BR-022 continuam valendo.
- **Regras alteradas:** nenhuma regra vigente muda; o Work acrescenta a leitura de que a chave de cache leva a impressao dos provedores efetivos (BR-015) e que a data da ideia vive em coluna propria, fora do payload_json.
- **Contratos afetados:** `POST /api/settings/test` passa a aceitar `id` opcional (sonda usa a chave guardada); `GET /settings` passa a renderizar o modelo em `<select>`; o README de cada plano ganha rodape de data.
- **Qualidades, entidades e integracoes relacionadas:** nenhuma nova entidade; `evaluations` ganha a coluna `generated_at`.
- **Gaps tocados:** nenhum.
- **Reconciliacao esperada apos implementacao:** a spec da interface passa a dizer que o modal de provedor escolhe o modelo entre os devolvidos pelo provedor e que a exclusao confirma em dialogo proprio; a spec do cache passa a dizer que trocar de provedor invalida as respostas gravadas.

## Problema e resultado

**Problema:** cinco defeitos no mesmo caminho relatados pelo operador:

1. trocar de provedor em `/settings` nao invalidava o cache de respostas (a chave nao levava o provedor efetivo), entao reexecutar servia o texto do provedor anterior; o rotulo do `/new` continuava na foto do boot;
2. o botao **Testar** nao devolvia a lista de modelos do provedor para escolher, e a edicao mandava `kind` num schema estrito (422);
3. excluir provedor usava `window.alert`/`window.confirm` nativos — os unicos alertas do app;
4. a ideia gerada nao gravava a data da geracao, entao nem o plano (MD) nem a listagem tinham o que mostrar.

**Resultado esperado:** trocar de provedor vale na hora (cache e rotulo), o Testar vira dropdown com os modelos do provedor e usa a chave guardada no editar, excluir confirma em dialogo do app, e cada ideia carrega a data em que nasceu — no rodape do plano e como rotulo pequeno na listagem.

## Contexto confirmado

- A chave de cache era `semente::hash(parametros)` sem o provedor: a resposta do provedor antigo era servida para o novo.
- O endpoint do teste era estrito e nao conhecia `id`; a UI mandava o corpo inteiro (com `kind`) no PATCH, que respondia 422.
- A pagina de configuracoes usava `alert`/`confirm` nativos para escolher sem provedor, excluir e falhar.
- A ideia saia de `evaluateIdea` sem data e o `payload_json` nao tinha campo de data.

## Atores e valor

- **ACT-003 Operador/consultor:** troca de provedor sem reiniciar o servico, escolhe o modelo da lista devolvida pelo provedor, exclui sem dialogo nativo e sabe quando cada ideia foi gerada.

## Escopo

### Inclui

- Impressao dos provedores efetivos em toda chave de cache.
- Rotulos do servico recalculados a cada pagina.
- Catalogo de modelos no veredito do Testar e uso da chave guardada no editar.
- Ordem dos campos do modal, dropdown de modelos e exclusao em dialogo proprio.
- Coluna `generated_at`, carimbo em `evaluateIdea`, rodape do plano e rotulo no ranking.

### Nao inclui

- Mudar o contrato de ambiente ou a precedencia do perfil ativo.
- Backfill de ideias antigas (sem data gravada, a UI omite o rotulo).
- Trocar Drizzle por SQL cru ou mudar a forma do `payload_json`.

## Cenarios de usuario

### US-001 — Trocar de provedor vale na hora (P1)

**Ator:** operador.
**Valor independente:** ele troca o provedor ativo e a reexecucao gera no provedor novo, com o rotulo do formulario acompanhando.
**Verificacao independente:** `bun test` prova que a troca de impressao invalida o cache e que o rotulo muda entre paginas.

1. **Given** um estudo com respostas em cache, **When** o operador troca o provedor ativo e reexecuta, **Then** a resposta gravada pelo anterior nao e servida (FR-001) e o rotulo do `/new` mostra o modelo do perfil ativo (FR-002).

### US-002 — O Testar devolve os modelos (P1)

**Ator:** operador.
**Valor independente:** ele escolhe o modelo da lista que o provedor devolve em vez de digitar as cegas, e testar um provedor salvo nao exige redigitar a chave.
**Verificacao independente:** `bun test` prova o `models` no veredito e a chave guardada no editar.

1. **Given** um provedor que expoe `GET /models` e um provedor salvo, **When** o operador clica em Testar (no adicionar e no editar), **Then** o veredito traz a lista, o campo Modelo vira dropdown e a sonda usa a chave guardada (FR-003).

### US-003 — Excluir em dialogo, sem alert (P1)

**Ator:** operador.
**Valor independente:** a exclusao segue o mesmo padrao do resto do app, com pergunta e aviso de falha na propria secao.
**Verificacao independente:** `bun test` prova o `<dialog>` e a ausencia de `window.alert`/`window.confirm`.

1. **Given** a pagina de configuracoes, **When** o operador clica em Excluir, **Then** o app abre o dialogo proprio (FR-004).

### US-004 — A ideia carrega a data (P2)

**Ator:** operador.
**Valor independente:** ele ve quando a ideia foi gerada, no plano e na listagem, sem quebrar o layout.
**Verificacao independente:** `bun test` prova a coluna, o rodape e o rotulo.

1. **Given** um estudo concluido, **When** o operador abre o plano ou a lista, **Then** a data da geracao aparece no rodape do MD e como rotulo pequeno na linha (FR-005, FR-006).

## Contrato observavel

- **Entradas:** `POST /api/settings/test` (agora aceita `id`), `PATCH /api/settings/providers/:id` (sem `kind`), pagina `/settings`.
- **Saidas e efeitos:** veredito com `models`; rotulo `Gerada em <data>` no README do plano; coluna `generated_at` gravada e lida; rotulo pequeno na celula do nome no ranking.
- **Erros:** payload invalido continua 422 com o detalhe Zod; provedor inexistente no teste cai no comportamento antigo (sem chave guardada).

## Requisitos

- **FR-001:** trocar de provedor muda a chave de cache (impressao dos provedores efetivos) e o mesmo provedor continua retomando.
- **FR-002:** o rotulo do servico reflete o catalogo ativo, recalculado a cada pagina.
- **FR-003:** o Testar devolve os modelos quando o provedor os expoe.
- **FR-004:** o editar usa a chave guardada (id) e nao manda `kind`; excluir confirma em dialogo, sem alert nativo.
- **FR-005:** a ideia grava `generatedAt` em coluna propria (`generated_at`), fora do `payload_json`.
- **FR-006:** o plano fecha com o rodape da data e o ranking mostra a data pequena sem coluna nova.

### Qualidade e restricoes

- **QR-001:** o `payload_json` continua com a forma do baseline.
- **QR-002:** nenhuma pagina usa `window.alert`/`window.confirm`.
- **QR-003:** a chave de API nunca aparece em claro na API, na pagina ou no rodape.

## Casos de borda

- **EC-001:** ideia anterior a coluna (sem data) nao ganha rotulo nem rodape.
- **EC-002:** provedor sem `GET /models` cai no veredito antigo, sem lista, e o campo Modelo continua texto.
- **EC-003:** Testar no editar sem id (provedor nao salvo) mantem o comportamento anterior.

## Critérios de sucesso

- **SC-001:** `bun test` passa com as assercoes de cache, catalogo, dialogo e data.
- **SC-002:** `bun run check` e `bunx eslint . && bunx prettier --check .` passam.
- **SC-003:** `pwn work gate --all --work 0013` aprovado e a evidencia TDD das seis tasks capturada.

## Premissas

- **A-001:** o provedor que expoe `/models` segue o formato OpenAI (`{"data":[{"id":...}]}`).
- **A-002:** o cache por impressao e preferivel a purgar chaves na troca (a resposta antiga continua auditavel).

## Componentes afetados

- `src/config/providers.ts`, `src/config/runtime.ts`, `src/domain/types.ts` — impressao, rotulos e tipo.
- `src/application/generate-study.ts`, `src/application/study-service.ts`, `src/cli.ts`, `src/index.ts` — chaves de cache e injecao da configuracao.
- `src/infrastructure/provider-probe.ts`, `src/infrastructure/http/api.ts` — catalogo de modelos e chave guardada.
- `src/infrastructure/http/ui/pages.tsx`, `layout.tsx`, `routes.tsx` — modal, dialogo, dropdown e rotulos.
- `src/application/evaluate.ts`, `src/infrastructure/schema.ts`, `repositories.ts`, `drizzle/0005_*` — data de geracao.
- `src/application/artifacts.ts`, `README.md` — rodape do plano e documentacao.
- `tests/*` — assercoes novas.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
|---|---|---|
| `FR-001` | US-001, SC-001 | teste do cache por impressao + logs red/green da task 1.1 |
| `FR-002` | US-001, SC-001 | teste do rotulo por pagina + logs da task 1.2 |
| `FR-003` | US-002, SC-001 | teste do catalogo/chave guardada + logs da task 1.3 |
| `FR-004` | US-002, US-003, SC-001 | testes do modal e do dialogo + logs da task 1.4 |
| `FR-005` | US-004, SC-001 | testes da coluna e do carimbo + logs da task 1.5 |
| `FR-006` | US-004, SC-001 | testes do rodape e do ranking + logs da task 1.6 |
| `QR-001` | EC-001 | assercao do payload_json intacto |
| `QR-002` | SC-001 | assercao de ausencia de alert/confirm |
| `QR-003` | SC-001 | assercao de que a chave nao aparece na pagina |
