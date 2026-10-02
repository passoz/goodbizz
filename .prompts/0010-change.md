# PROMPT: Catálogo nomeado de provedores na tela de configurações

**Status:** Pronto para planejamento
**Work ID:** 0010
**Origem:** pedido do operador (2026-10-02) — "em vez de vários inputs, só dois dropdowns, um para o LLM e outro para o decisor, com adicionar/editar/excluir e um botão de testar"
**System spec:** `.specs/system.json`
**Baseline:** system spec versao 1, status "Baseline parcial" (2026-09-29), commit `cff5727`

## Delta da system spec

- **Capacidades afetadas:** CAP-014 (interface web) e CAP-016 (configuração por ambiente e segredos) pela forma de guardar a escolha do provedor.
- **Regras preservadas:** BR-018 (mesma origem + token nas rotas mutantes), BR-021 e BR-022 continuam valendo.
- **Regras alteradas:** a sobreposição campo-a-campo do ambiente é substituída pela escolha de um **perfil nomeado**; o ambiente passa a ser a opção "padrão" de cada lista.
- **Contratos afetados:** CON-003 (interface web) e o contrato da API `/api/settings`.
- **Qualidades, entidades e integrações relacionadas:** nenhuma nova entidade de domínio; o catálogo é configuração.
- **Gaps tocados:** nenhum.
- **Reconciliação esperada após implementação:** a spec da interface passa a descrever duas listas nomeadas, o modal de provedor com teste de conexão, e a migração do formato antigo para perfis "Padrão".

## Problema e resultado

**Problema:** a tela de configurações mostrava seis campos soltos (URL, modelo e chave de cada função), cada um com origem e máscara próprias. Para trocar de provedor era preciso digitar URL e modelo de novo, não havia como guardar mais de uma configuração, não havia como testar se o que foi digitado funciona, e uma chave errada só aparecia quando um estudo falhava no meio.

**Resultado esperado:** duas listas — provedor de texto e provedor de decisão — mostrando o **nome** que o operador deu a cada configuração mais a opção de adicionar, com editar e excluir ao lado; um modal com os campos do provedor e um botão Testar que fala com o provedor de verdade; e o catálogo guardado em banco com migração automática do formato antigo.

## Contexto confirmado

- **O formato antigo é um remendo de campos.** `ProviderSettings` tinha `llmBaseUrl`, `llmModel`, `llmApiKey`, `deciderUrl`, `deciderModel`, `deciderApiKey`, aplicados por `PATCH /api/settings` e por `POST /ui/settings`.
- **O ambiente é o padrão.** `effectiveProviders` já dava precedência ao que estava salvo e herdava o resto do ambiente; isso vira a opção "padrão do ambiente".
- **A configuração vale sem reiniciar.** `RoutingLlmClient`/`RoutingDeciderClient` releem a configuração a cada chamada por impressão digital; trocar o perfil ativo já basta.
- **A API não tem CSRF.** As rotas `/api` são públicas na tailnet; o CSRF com token existe só nas rotas `/ui`. O novo CRUD passa pela API e o HTML carrega o token do cookie.
- **Formato do LLM é OpenAI.** `LlmHttp` fala `POST {base}/chat/completions`; o decisor fala `POST {url}` com `{state, model, questions}` no padrão System One.

## Atores e valor

- **ACT-003 Operador/consultor:** troca de provedor sem redigitar credenciais, testa antes de usar e mantém mais de uma configuração guardada.
- **ACT-001 Usuário da interface web:** escolhe o provedor pela lista, sem lidar com URL e modelo no uso comum.

## Escopo

### Inclui

- Catálogo nomeado de provedores (nome, tipo, URL, modelo, chave) com criar, editar e excluir.
- Escolha do provedor ativo por função, incluindo "padrão do ambiente".
- Botão Testar no modal, que valida URL, credencial e modelo contra o provedor.
- Migração automática do formato antigo para perfis "Padrão".
- Chave nunca devolvida em claro; editar sem digitar a chave mantém a atual.

### Não inclui

- Mudar o caminho de geração: os clientes de IA continuam os mesmos, só mudam de onde leem a configuração.
- Guardar histórico de versões do catálogo.
- Testar provedores em lote ou agendar o teste.

## Cenários de usuário

### US-001 — Adicionar um provedor testado (P1)

**Ator:** operador.
**Valor independente:** ele cadastra a credencial uma vez e sabe, na hora, se ela funciona.
**Verificação independente:** o teste contra um provedor que responde ao catálogo de modelos devolve `ok: true`; contra chave errada, `ok: false` com o motivo.

1. **Given** o modal de provedor, **When** o operador preenche URL, modelo e chave e clica Testar, **Then** a resposta diz se a configuração funciona (FR-002).

### US-002 — Escolher o provedor pela lista (P1)

**Ator:** usuário da interface web.
**Valor independente:** trocar de provedor é escolher um nome, não digitar URL.
**Verificação independente:** escolher na lista grava o ativo e a geração seguinte usa aquele perfil.

1. **Given** dois provedores cadastrados, **When** o operador escolhe o segundo na lista, **Then** o ativo passa a ser ele e o primeiro continua guardado (FR-001).

### US-003 — Excluir sem quebrar a escolha (P2)

**Ator:** operador.
**Valor independente:** remover uma configuração não deixa um ativo apontando para o nada.
**Verificação independente:** excluir o provedor ativo limpa o ativo e a função volta ao padrão do ambiente.

1. **Given** um provedor ativo, **When** ele é excluído, **Then** o ativo daquele tipo volta a ser o padrão do ambiente (FR-003).

## Contrato observável

- **Entradas:** `GET /api/settings` (catálogo + ativos + padrões do ambiente), `POST /api/settings/providers`, `PATCH|DELETE /api/settings/providers/:id`, `PUT /api/settings/active`, `POST /api/settings/test`, e o formulário HTML `/ui/settings/active` para o caminho sem JavaScript.
- **Saídas e efeitos:** o catálogo é persistido em banco e passa a ser a fonte da configuração efetiva; a chave nunca sai em claro.
- **Erros:** 422 para nome/URL/modelo ausentes e para tipo inválido; 404 para provedor inexistente ou de tipo errado.

## Requisitos

### Funcionais

- **FR-001:** duas listas (texto e decisão) mostram o nome de cada provedor configurado, mais o padrão do ambiente e a opção de adicionar; escolher grava o ativo e usar editar/excluir age sobre o selecionado.
- **FR-002:** o modal do provedor reúne nome, URL, modelo e chave, e o botão Testar valida a configuração contra o provedor.
- **FR-003:** excluir um provedor o remove do catálogo e limpa o ativo quando era ele.

### Qualidade e restrições

- **QR-001:** a chave nunca é devolvida em claro por API, HTML ou log; editar sem chave mantém a atual.
- **QR-002:** o catálogo antigo (campos soltos) é migrado para perfis "Padrão" e continua valendo.
- **QR-003:** escolher o provedor funciona sem JavaScript; criar/editar/excluir/testar exigem script, como o modal do plano.
- **QR-004:** a suíte existente permanece verde, com os testes do formato antigo substituídos pelos do catálogo.

## Casos de borda

- **EC-001:** provedor inalcançável no teste devolve `ok: false` com o motivo, sem estourar (FR-002).
- **EC-002:** provedor sem `/models` cai na geração de 1 token e ainda assim valida (FR-002).
- **EC-003:** ativo apontando para provedor de outro tipo é recusado (FR-001).

## Critérios de sucesso

- **SC-001:** `bun test` prova o CRUD, a escolha do ativo, a migração e os vereditos do teste (FR-001, FR-002, FR-003).
- **SC-002:** o e2e sobre socket real cadastra, lista, escolhe e exclui passando pela página (FR-001).

## Premissas

- **A-001:** um provedor pertence a um tipo (texto ou decisão); a mesma URL em duas funções são dois perfis.
- **A-002:** testar fala com o provedor de verdade, então o botão é a única parte do catálogo que depende de rede.

## Componentes afetados

- `src/config/providers.ts`, `src/domain/types.ts`, `src/domain/ports.ts`, `src/application/settings.ts`, `src/application/study-service.ts`, `src/infrastructure/settings-repository.ts`, `src/infrastructure/provider-probe.ts`, `src/infrastructure/http/api.ts`, `src/infrastructure/http/ui/routes.tsx`, `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/layout.tsx`, `src/cli.ts`.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
|---|---|---|
| `FR-001` | US-002, EC-003, SC-001, SC-002 | CRUD+ativo na API, asserções da página e o e2e |
| `FR-002` | US-001, EC-001, EC-002, SC-001 | vereditos do teste contra provedor local |
| `FR-003` | US-003, SC-001 | exclusão limpando o ativo |
| `QR-001` | SC-001 | chave mascarada e ausente do HTML |
| `QR-002` | SC-001 | migração dos campos soltos |
| `QR-003` | SC-002 | formulário `/ui/settings/active` |
| `QR-004` | SC-001 | suíte completa verde |
