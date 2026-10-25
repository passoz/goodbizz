# Tasks: O estudo pesquisa a web sozinho e cita a evidência de cada afirmação

**Contract version:** 3
**Work ID:** 0015

## Execution contract

| Component | Purpose |
|-----------|---------|
| `research-pipeline` | Fase de pesquisa do estudo: buscas, extração literal, pesquisa por ideia, evidências nos prompts, no decisor e na adição |
| `evidence-artifacts` | Artefato 00-evidencias.md, chave evidencias no dados.json e seção Fontes do plano |
| `search-provider` | Porta SearchClient, adaptador Tavily, mock determinístico, roteamento, ambiente, CLI, consumo e fail-fast |
| `provider-catalog` | Tipo search no catálogo de provedores: precedência, impressão de cache, API, Testar e página /settings |
| `study-page` | Página do estudo: contagem de evidências, aviso de pesquisa fraca e progresso em 7 fases |

## Global gates
- [ ] `bun test` — a suíte completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.
- [ ] `bunx eslint . && bunx prettier --check .` — lint e formatação passam.

### [ ] [1.1] A fase de pesquisa roda antes do brief com 6 a 10 buscas geradas pelo LLM

**Requirement:** FR-002
**Depends on:** none
**Behavior:** antes do brief o pipeline pede as buscas ao LLM, limita a lista a 6 a 10 itens, consulta o provedor de busca e extrai evidências que entram no resultado do estudo
**Components:** research-pipeline
**Files:** `src/application/research.ts`, `src/application/generate-study.ts`, `src/application/prompts.ts`, `src/domain/types.ts`, `src/domain/ports.ts`, `tests/bunfig.focus.toml`, `tests/research-phase.test.ts`, `tests/research-phase-cases.test.ts`
**Implementation files:** `src/application/research.ts`, `src/application/generate-study.ts`, `src/application/prompts.ts`
**Test files:** `tests/research-phase-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/research-phase-cases.test.ts -t "FR-002"` — sem a fase de pesquisa o provedor de busca não recebe nenhuma busca antes do brief e a asserção da ordem falha

**Implementation:**
1. Escrever o teste que falha (RED): a busca acontece antes do brief, com 6 a 10 buscas, e as evidências voltam no resultado
2. Criar research.ts com geração, execução e extração e chamar a fase em generateStudy como [1/7] (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/research-phase.test.ts -t "FR-002"` — o pipeline pesquisa antes do brief e devolve as evidências extraídas

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.2] Só entra a evidência com trecho literal e ela vai para 00-evidencias.md e dados.json

**Requirement:** FR-003
**Depends on:** none
**Behavior:** o código descarta a evidência cujo trecho não aparece no conteúdo da mesma URL, deduplica URLs, tenta extrair de novo uma vez e grava as que sobram em 00-evidencias.md e na chave evidencias do dados.json
**Components:** research-pipeline
**Files:** `src/application/research.ts`, `src/application/artifacts.ts`, `src/application/dados.ts`, `src/domain/types.ts`, `tests/research-evidence.test.ts`, `tests/research-evidence-cases.test.ts`
**Implementation files:** `src/application/research.ts`, `src/application/artifacts.ts`, `src/application/dados.ts`
**Test files:** `tests/research-evidence-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/research-evidence-cases.test.ts -t "FR-003"` — sem a validação literal o trecho inventado chega ao resultado e a asserção de descarte falha

**Implementation:**
1. Escrever o teste que falha (RED): trecho ausente do conteúdo, URL repetida, JSON inválido e busca vazia
2. Validar o trecho literal, deduplicar URLs, repetir a extração uma vez e gravar 00-evidencias.md e evidencias no dados.json (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/research-evidence.test.ts -t "FR-003"` — o trecho inventado não entra e as evidências válidas aparecem nos dois artefatos

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.3] Cada ideia tem a própria pesquisa de concorrente e de preço

**Requirement:** FR-005
**Depends on:** none
**Behavior:** depois de gerar as ideias o pipeline faz duas buscas por ideia, uma de concorrente direto e uma de preço da solução, e as evidências guardam o nome da ideia
**Components:** research-pipeline
**Files:** `src/application/research.ts`, `src/application/generate-study.ts`, `tests/research-ideas.test.ts`, `tests/research-ideas-cases.test.ts`
**Implementation files:** `src/application/research.ts`, `src/application/generate-study.ts`
**Test files:** `tests/research-ideas-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/research-ideas-cases.test.ts -t "FR-005"` — sem a pesquisa por ideia o provedor recebe só as buscas do estudo e a asserção das duas buscas por ideia falha

**Implementation:**
1. Escrever o teste que falha (RED): duas buscas por ideia e evidências com o nome da ideia
2. Pesquisar cada ideia com as buscas de concorrente e de preço e numerar as evidências em sequência (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/research-ideas.test.ts -t "FR-005"` — cada ideia ganha as duas buscas e evidências com o nome dela

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.4] O decisor vê as evidências da ideia e do estudo

**Requirement:** FR-006
**Depends on:** none
**Behavior:** o estado enviado ao decisor em evaluateIdea contém as evidências da ideia e as do estudo, e o hash delas entra na chave de cache da avaliação
**Components:** research-pipeline
**Files:** `src/application/evaluate.ts`, `src/application/generate-study.ts`, `tests/evaluate-evidence.test.ts`, `tests/evaluate-evidence-cases.test.ts`
**Implementation files:** `src/application/evaluate.ts`, `src/application/generate-study.ts`
**Test files:** `tests/evaluate-evidence-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/evaluate-evidence-cases.test.ts -t "FR-006"` — sem as evidências no estado o texto enviado ao decisor não cita E1 e a asserção falha

**Implementation:**
1. Escrever o teste que falha (RED): o estado do decisor cita as evidências e a chave de cache muda com elas
2. Passar as evidências para evaluateIdea e o hash delas para a chave da avaliação (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/evaluate-evidence.test.ts -t "FR-006"` — o estado do decisor contém as evidências e a avaliação é refeita quando elas mudam

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.5] Brief, ideias e plano recebem as evidências e citam [E#]

**Requirement:** FR-004
**Depends on:** none
**Behavior:** os prompts do brief, das ideias e do plano recebem a lista de evidências e obrigam a citar [E#]; o LLM simulado gera as buscas, extrai evidências literais e cita evidências existentes
**Components:** research-pipeline
**Files:** `src/application/generation.ts`, `src/application/prompts.ts`, `src/infrastructure/llm-mock.ts`, `tests/evidence-prompts.test.ts`, `tests/evidence-prompts-cases.test.ts`
**Implementation files:** `src/application/generation.ts`, `src/application/prompts.ts`, `src/infrastructure/llm-mock.ts`
**Test files:** `tests/evidence-prompts-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/evidence-prompts-cases.test.ts -t "FR-004"` — sem as evidências no prompt o texto enviado ao LLM não traz [E1] e a asserção falha

**Implementation:**
1. Escrever o teste que falha (RED): os três prompts trazem as evidências e o brief gravado cita um [E#] existente
2. Montar o bloco de evidências nos prompts e ensinar o LLM simulado a gerar buscas, extrair e citar (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/evidence-prompts.test.ts -t "FR-004"` — os prompts trazem as evidências e o brief simulado cita um id existente

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.6] O README de cada ideia termina com a seção Fontes

**Requirement:** FR-007
**Depends on:** none
**Behavior:** o código anexa ao README de cada ideia a seção Fontes com as evidências citadas no texto e registra em issues a citação de id inexistente
**Components:** evidence-artifacts
**Files:** `src/application/artifacts.ts`, `src/application/reports.ts`, `src/application/generate-study.ts`, `tests/evidence-sources.test.ts`, `tests/evidence-sources-cases.test.ts`
**Implementation files:** `src/application/artifacts.ts`, `src/application/reports.ts`, `src/application/generate-study.ts`
**Test files:** `tests/evidence-sources-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/evidence-sources-cases.test.ts -t "FR-007"` — sem a seção Fontes o README termina no rodapé de data e a asserção do fim do arquivo falha

**Implementation:**
1. Escrever o teste que falha (RED): plano que cita E2, E7 e E99 termina com Fontes de E2 e E7 e E99 vai para issues
2. Anexar a seção Fontes no buildArtifactFiles e registrar as citações órfãs no pipeline (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/evidence-sources.test.ts -t "FR-007"` — o README termina com Fontes exatas e a citação órfã aparece em issues

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.7] O consumo do estudo conta as buscas e o custo soma o preço por mil

**Requirement:** FR-010
**Depends on:** none
**Behavior:** o usage do estudo traz search.calls medido no cliente de busca e o custo soma GOODBIZZ_PRICE_SEARCH_PER_1K por mil chamadas
**Components:** search-provider
**Files:** `src/application/costs.ts`, `src/application/generate-study.ts`, `src/config/env.ts`, `src/domain/types.ts`, `tests/search-usage.test.ts`, `tests/search-usage-cases.test.ts`
**Implementation files:** `src/application/costs.ts`, `src/application/generate-study.ts`, `src/config/env.ts`
**Test files:** `tests/search-usage-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/search-usage-cases.test.ts -t "FR-010"` — sem a medição o usage não tem search e a asserção das chamadas de busca falha

**Implementation:**
1. Escrever o teste que falha (RED): usage.search.calls e custo com preço por mil buscas
2. Medir a diferença de consumo do cliente de busca e somar o preço configurado no custo (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/search-usage.test.ts -t "FR-010"` — o usage conta as buscas e o custo inclui o preço delas

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.8] O estudo guarda as evidências e o estudo antigo abre com zero

**Requirement:** EC-005
**Depends on:** none
**Behavior:** o serviço passa o cliente de busca ao pipeline, grava as evidências do estudo no banco e devolve lista vazia para o estudo anterior à coluna
**Components:** research-pipeline
**Files:** `src/infrastructure/schema.ts`, `src/infrastructure/repositories.ts`, `src/application/study-service.ts`, `src/domain/types.ts`, `drizzle/0006_study_evidences.sql`, `drizzle/meta/0006_snapshot.json`, `drizzle/meta/_journal.json`, `tests/evidence-persistence.test.ts`, `tests/evidence-persistence-cases.test.ts`
**Implementation files:** `src/infrastructure/schema.ts`, `src/infrastructure/repositories.ts`, `src/application/study-service.ts`
**Test files:** `tests/evidence-persistence-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/evidence-persistence-cases.test.ts -t "EC-005"` — sem a coluna e a gravação o registro do estudo volta sem evidências e a asserção da contagem falha

**Implementation:**
1. Escrever o teste que falha (RED): o estudo executado guarda as evidências e o estudo antigo volta com lista vazia
2. Adicionar a coluna evidences_json com migração gerada, gravar e ler as evidências e passar a busca ao pipeline (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/evidence-persistence.test.ts -t "EC-005"` — as evidências do estudo persistem e o estudo antigo abre com zero

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.9] Adaptador Tavily com erros humanos e Testar sem vazar a chave

**Requirement:** QR-002
**Depends on:** none
**Behavior:** o adaptador HTTP faz POST {url}/search com Bearer e corpo Tavily, traduz 401/403, 429 e rede em frases humanas com o detalhe cru, e o Testar do tipo search usa o adaptador sem devolver a chave
**Components:** search-provider
**Files:** `src/infrastructure/search.ts`, `src/infrastructure/provider-probe.ts`, `src/domain/errors.ts`, `tests/search-adapter.test.ts`, `tests/search-adapter-cases.test.ts`
**Implementation files:** `src/infrastructure/search.ts`, `src/infrastructure/provider-probe.ts`, `src/domain/errors.ts`
**Test files:** `tests/search-adapter-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/search-adapter-cases.test.ts -t "QR-002"` — sem o tipo search na sonda o Testar fala com o caminho do LLM e a asserção do POST /search falha

**Implementation:**
1. Escrever o teste que falha (RED): protocolo Tavily, frases de 401, 429 e rede e chave ausente da resposta
2. Criar SearchHttp com retentativa e SearchError e ligar a sonda do tipo search ao adaptador (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/search-adapter.test.ts -t "QR-002"` — o Testar de busca segue o protocolo Tavily e nunca devolve a chave

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.10] O serviço não sobe sem chave de busca fora do modo simulado

**Requirement:** FR-008
**Depends on:** none
**Behavior:** o ambiente aceita SEARCH_API_URL, SEARCH_API_KEY e GOODBIZZ_MOCK_SEARCH e o startup falha com a mensagem da chave ausente quando a busca é real e não há chave
**Components:** search-provider
**Files:** `src/config/env.ts`, `src/config/providers.ts`, `src/index.ts`, `.env.example`, `tests/search-startup.test.ts`, `tests/search-startup-cases.test.ts`
**Implementation files:** `src/config/env.ts`, `src/config/providers.ts`, `src/index.ts`
**Test files:** `tests/search-startup-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/search-startup-cases.test.ts -t "FR-008"` — sem a validação o serviço sobe sem chave de busca e a asserção da rejeição falha

**Implementation:**
1. Escrever o teste que falha (RED): startup sem chave rejeita sem expor segredo e com busca simulada sobe
2. Declarar as variáveis de busca, levar a busca à configuração efetiva e validar no buildService (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/search-startup.test.ts -t "FR-008"` — o startup sem chave de busca falha com a mensagem certa

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.11] Busca simulada determinística e sem rede no serviço

**Requirement:** QR-001
**Depends on:** none
**Behavior:** com GOODBIZZ_MOCK=1 ou GOODBIZZ_MOCK_SEARCH=1 o serviço usa a busca simulada, não abre conexão de rede para busca e produz as mesmas evidências para a mesma entrada; com chave usa o adaptador Tavily
**Components:** search-provider
**Files:** `src/infrastructure/search-mock.ts`, `src/infrastructure/routing.ts`, `src/index.ts`, `tests/search-mock.test.ts`, `tests/search-mock-cases.test.ts`, `tests/helpers.ts`, `tests/generate-study.test.ts`, `tests/generation.test.ts`, `tests/study-service.test.ts`, `tests/e2e.test.ts`, `tests/smoke.test.ts`, `tests/api.test.ts`, `tests/csrf.test.ts`, `tests/settings-api.test.ts`
**Implementation files:** `src/infrastructure/search-mock.ts`, `src/infrastructure/routing.ts`, `src/index.ts`
**Test files:** `tests/search-mock-cases.test.ts`, `tests/helpers.ts`, `tests/generate-study.test.ts`, `tests/generation.test.ts`, `tests/study-service.test.ts`, `tests/e2e.test.ts`, `tests/smoke.test.ts`, `tests/api.test.ts`, `tests/csrf.test.ts`, `tests/settings-api.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/search-mock-cases.test.ts -t "QR-001"` — sem o cliente de busca no serviço o estudo simulado não grava evidências e a asserção da contagem falha

**Implementation:**
1. Escrever o teste que falha (RED): dois serviços simulados geram as mesmas evidências sem fetch de busca
2. Criar SearchMock e RoutingSearchClient e ligar o cliente de busca no buildService (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/search-mock.test.ts -t "QR-001"` — o modo simulado não usa rede e repete as mesmas evidências

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.12] A adição de ideias reaproveita as evidências e pesquisa só as novas

**Requirement:** FR-012
**Depends on:** none
**Behavior:** generateAddition recebe as evidências do estudo, usa as do estudo no prompt, pesquisa só as ideias novas e o serviço grava a lista somada
**Components:** research-pipeline
**Files:** `src/application/generate-study.ts`, `src/application/study-service.ts`, `tests/research-addition.test.ts`, `tests/research-addition-cases.test.ts`
**Implementation files:** `src/application/generate-study.ts`, `src/application/study-service.ts`
**Test files:** `tests/research-addition-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/research-addition-cases.test.ts -t "FR-012"` — sem o reaproveitamento a adição não pesquisa as ideias novas e a asserção das buscas falha

**Implementation:**
1. Escrever o teste que falha (RED): a adição pesquisa só as ideias novas e preserva as evidências anteriores
2. Passar as evidências do estudo para generateAddition e gravar a lista somada no serviço (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/research-addition.test.ts -t "FR-012"` — a adição pesquisa só as ideias novas e mantém as evidências do estudo

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.13] CLI com flags de busca e estudo simulado com evidências e Fontes

**Requirement:** SC-002
**Depends on:** none
**Behavior:** a CLI aceita --mock-search, --search-url e --search-key, exige chave de busca fora do modo simulado e o estudo --mock grava 00-evidencias.md e READMEs terminados em Fontes
**Components:** search-provider
**Files:** `src/cli.ts`, `src/config/runtime.ts`, `src/domain/types.ts`, `tests/cli-research.test.ts`, `tests/cli-research-cases.test.ts`, `tests/cli.test.ts`
**Implementation files:** `src/cli.ts`, `src/config/runtime.ts`
**Test files:** `tests/cli-research-cases.test.ts`, `tests/cli.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/cli-research-cases.test.ts -t "SC-002"` — sem a busca na CLI o estudo --mock não grava 00-evidencias.md e a asserção do artefato falha

**Implementation:**
1. Escrever o teste que falha (RED): generate --mock grava evidências e Fontes e --search-key leva ao adaptador
2. Ler as flags de busca na configuração e criar o cliente de busca no runGenerate (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/cli-research.test.ts -t "SC-002"` — a CLI simulada grava 00-evidencias.md e Fontes em cada README

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.14] Perfil de busca sobrepõe o ambiente e troca invalida o cache

**Requirement:** QR-003
**Depends on:** none
**Behavior:** o perfil de busca ativo sobrepõe o ambiente, entra na impressão de cache, e reexecutar com o mesmo provedor não repete nenhuma busca enquanto trocar de perfil faz buscar de novo
**Components:** provider-catalog
**Files:** `src/config/providers.ts`, `src/application/settings.ts`, `src/infrastructure/settings-repository.ts`, `src/domain/types.ts`, `tests/search-cache.test.ts`, `tests/search-cache-cases.test.ts`
**Implementation files:** `src/config/providers.ts`, `src/application/settings.ts`, `src/infrastructure/settings-repository.ts`
**Test files:** `tests/search-cache-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/search-cache-cases.test.ts -t "QR-003"` — sem o tipo search no catálogo o perfil de busca é recusado e a asserção da troca falha

**Implementation:**
1. Escrever o teste que falha (RED): perfil de busca ativo, reexecução sem busca repetida e troca com busca nova
2. Aceitar o tipo search no store e no repositório e levar o perfil ativo à configuração e à impressão (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/search-cache.test.ts -t "QR-003"` — a troca de perfil de busca invalida o cache e a reexecução não repete buscas

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.15] O tipo search existe na API de settings, no Testar e na página /settings

**Requirement:** FR-009
**Depends on:** none
**Behavior:** a API de settings aceita perfis do tipo search sem modelo e devolve só a chave mascarada, o Testar sonda o provedor de busca e a página /settings mostra a terceira lista
**Components:** provider-catalog
**Files:** `src/infrastructure/http/api.ts`, `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/routes.tsx`, `tests/search-settings.test.ts`, `tests/search-settings-cases.test.ts`
**Implementation files:** `src/infrastructure/http/api.ts`, `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/routes.tsx`
**Test files:** `tests/search-settings-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/search-settings-cases.test.ts -t "FR-009"` — sem o tipo search no schema da API o cadastro responde 422 e a asserção do 201 falha

**Implementation:**
1. Escrever o teste que falha (RED): cadastrar, ativar e testar perfil search pela API e ver a terceira lista
2. Aceitar o tipo search nos schemas, no ativo e no Testar e desenhar a lista de busca na página (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/search-settings.test.ts -t "FR-009"` — perfis de busca entram pela API com chave mascarada e aparecem na página

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.16] A página do estudo mostra a contagem de evidências e avisa pesquisa fraca

**Requirement:** FR-011
**Depends on:** none
**Behavior:** o detalhe do estudo traz evidenceCount e a página mostra a contagem, o consumo de busca e o aviso de pesquisa fraca com Executar de novo quando há menos de 5 evidências
**Components:** study-page
**Files:** `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/api.ts`, `tests/study-evidence-page.test.ts`, `tests/study-evidence-page-cases.test.ts`
**Implementation files:** `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/api.ts`
**Test files:** `tests/study-evidence-page-cases.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/study-evidence-page-cases.test.ts -t "FR-011"` — sem a contagem a página não mostra evidências nem aviso e a asserção do aviso falha

**Implementation:**
1. Escrever o teste que falha (RED): estudo com 2 evidências e estudo antigo mostram contagem e aviso; a API traz evidenceCount
2. Desenhar o painel de evidências com aviso e Executar de novo e expor evidenceCount na API (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/study-evidence-page.test.ts -t "FR-011"` — a página avisa pesquisa fraca e a API conta as evidências

**Visual:** N/A
**Documentation:** N/A

### [ ] [1.17] O progresso mostra a fase de pesquisa com rótulo próprio

**Requirement:** FR-001
**Depends on:** none
**Behavior:** a barra de progresso tem 7 fases e a fase 1 aparece como pesquisa na web, no estudo novo e na reexecução
**Components:** study-page
**Files:** `src/infrastructure/http/ui/pages.tsx`, `README.md`, `.specs/system.json`, `tests/study-progress.test.ts`, `tests/study-progress-cases.test.ts`, `tests/ui.test.ts`
**Implementation files:** `src/infrastructure/http/ui/pages.tsx`
**Test files:** `tests/study-progress-cases.test.ts`, `tests/ui.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/study-progress-cases.test.ts -t "FR-001"` — com 6 fases a página rotula a fase 1 como brief e a asserção do rótulo de pesquisa falha

**Implementation:**
1. Escrever o teste que falha (RED): passo [1/7] vira Fase 1 de 7 com o rótulo de pesquisa
2. Trocar as fases da página para 7 com o rótulo de pesquisa e documentar a fase no README e na spec (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/study-progress.test.ts -t "FR-001"` — o progresso mostra a fase de pesquisa como fase 1 de 7

**Visual:** N/A
**Documentation:** N/A
