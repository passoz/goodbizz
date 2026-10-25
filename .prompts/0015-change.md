# PROMPT: O estudo pesquisa a web sozinho e cita a evidência de cada afirmação

**Status:** Pronto para planejamento
**Work ID:** 0015
**Origem:** `.sources/0006-propostas-de-valor.md`
**System spec:** `.specs/system.json`
**Baseline:** system spec versão 1, status "Baseline parcial", última reconciliação em 2026-09-29, commit `743f52f`

## Delta da system spec

- **Capacidades afetadas:** CAP-001 (o pipeline ganha a fase de pesquisa antes do brief), CAP-002 (o estado enviado ao decisor leva as evidências da ideia), CAP-007 (brief, ideias e plano citam evidência), CAP-009 (artefato `00-evidencias.md` e chave `evidencias` no `dados.json`), CAP-011 (respostas de busca entram no cache), CAP-013, CAP-014 e CAP-016 (terceiro provedor: busca); entra uma capacidade nova de pesquisa web automática.
- **Regras preservadas:** BR-001 a BR-010, BR-012, BR-014, BR-016 a BR-023.
- **Regras alteradas:** BR-001 passa a ter a etapa de pesquisa antes do brief; BR-011 passa a aceitar como fonte de número também o valor de uma evidência citada por `[E#]`; BR-020 passa a exigir a chave do provedor de busca fora do modo simulado.
- **Contratos afetados:** CON-001 (flags `--mock-search`, `--search-url`, `--search-key`), CON-002 (`GET /api/config` informa a busca; o detalhe do estudo traz `evidenceCount` e o consumo de busca; `/api/settings/*` aceita o tipo `search`), CON-003 (terceira lista em `/settings`, contagem de evidências e aviso de pesquisa fraca na página do estudo), CON-006 (artefato `00-evidencias.md` e chave aditiva `evidencias` no `dados.json`); entra um contrato novo para o protocolo do provedor de busca.
- **Qualidades, entidades e integrações relacionadas:** SQR-001 vale também para a busca simulada; SQR-002 passa a valer com evidência; SQR-004 cobre a chave de busca; SQR-005 cobre as respostas de busca; ENT-001 ganha as evidências do estudo; entra a entidade Evidência; entra uma integração nova com o provedor de busca HTTP, ao lado de INT-001 e INT-002.
- **Gaps tocados:** nenhum.
- **Reconciliação esperada após implementação:** a spec descreve a fase de pesquisa, a entidade Evidência, o provedor de busca como terceira integração externa, o artefato `00-evidencias.md` e as regras BR-001, BR-011 e BR-020 com o texto novo; o Work aplica essa reconciliação em `.specs/system.json` antes de fechar.

## Problema e resultado

**Problema:** nenhum dado real entra no estudo. Brief, ideias, notas do decisor e plano saem só do LLM, que não navega. O brief real de `~/dev/ideias/bebidas/estudo-2/00-brief.md` diz "Região não informada: tratar como padrão nacional" e marca toda faixa de preço como `[INFERENCE]`. Não existe concorrente com preço verificado, reclamação real de cliente nem URL. O operador decidiu que o app faz a pesquisa sozinho: ele não fornece nada.

**Resultado esperado:** antes do brief, o app gera as buscas, consulta o provedor de busca, e extrai evidências com trecho literal e URL. Cada ideia ganha uma pesquisa própria de concorrente e preço. Brief, ideias, estado do decisor e plano recebem as evidências e citam `[E#]`. O estudo grava `00-evidencias.md`, e a página do estudo mostra quantas evidências entraram e avisa quando a pesquisa trouxe pouco.

## Contexto confirmado

- `generateBrief` e `generateIdeas` (`src/application/generation.ts:53`, `:68`) só recebem nicho, cidade e ticket.
- `evaluateIdea` monta o estado do decisor com o contexto fixo e a descrição da ideia (`src/application/evaluate.ts:163-164`).
- O pipeline tem 6 fases (`src/application/generate-study.ts:263-454`); a adição de ideias tem um caminho próprio (`generateAddition`, linha 110) que precisa receber as mesmas evidências.
- O catálogo de provedores conhece dois tipos (`ProviderKind`, `src/domain/types.ts`) e a impressão de cache combina os provedores efetivos (`src/config/providers.ts:47`).
- Não existe provedor de busca no ambiente do operador. Tavily oferece 1.000 créditos grátis por mês sem cartão; uma busca `basic` custa 1 crédito e devolve título, URL e conteúdo extraído (`POST https://api.tavily.com/search`, `Authorization: Bearer`, corpo `{"query","max_results","search_depth"}`).

## Atores e valor

- **ACT-001 Operador/consultor (CLI):** recebe um estudo apoiado em dado público verificável sem fazer pesquisa nenhuma.
- **ACT-003 Usuario da interface web:** vê de onde veio cada afirmação e quando a pesquisa ficou fraca.

## Escopo

### Inclui

- Porta `SearchClient` em `src/domain/ports.ts`, adaptador HTTP no protocolo Tavily, adaptador simulado determinístico e roteamento pelo catálogo, no mesmo padrão de LLM e decisor.
- Variáveis `SEARCH_API_URL` (padrão `https://api.tavily.com`), `SEARCH_API_KEY`, `GOODBIZZ_MOCK_SEARCH` e `GOODBIZZ_PRICE_SEARCH_PER_1K` (padrão 0) no `env.ts` e no `.env.example`.
- Tipo `search` no catálogo de `/settings`, na API de settings, no Testar e na impressão de cache.
- Fase de pesquisa do estudo: geração das buscas pelo LLM, execução no provedor, extração de evidências pelo LLM e validação do trecho literal pelo código.
- Pesquisa por ideia: buscas de concorrente direto e de preço da solução, com evidências próprias.
- Evidências no prompt do brief, das ideias e do plano, e no estado enviado ao decisor.
- Seção "Fontes" anexada pelo código ao plano de cada ideia, com as evidências citadas.
- Artefato `00-evidencias.md`, chave `evidencias` no `dados.json`, contagem e aviso na página do estudo, consumo de busca no `usage` e no custo.
- README com a fase nova, o provedor de busca e as variáveis.

### Não inclui

- Mudar a estrutura das 10 seções do plano (Work 0016).
- Calcular perda, ganho ou payback (Work 0016).
- Mudar a ordem do ranking (Work 0017).
- Raspar Google Maps, Reclame Aqui ou rede social por fora do provedor de busca.
- Um segundo protocolo de busca além do Tavily.

## Cenários de usuário

### US-001 — O estudo pesquisa sozinho antes de escrever (P1)

**Ator:** operador.
**Valor independente:** ele informa só título e descrição e recebe um brief que cita evidências com URL.
**Verificação independente:** `bun test` com o provedor de busca simulado prova a ordem das fases, as evidências gravadas e a citação no brief.

1. **Given** um estudo novo com busca simulada, **When** o pipeline roda, **Then** a fase de pesquisa executa antes do brief, gera entre 6 e 10 buscas e grava as evidências extraídas (FR-001, FR-002)
2. **Given** evidências extraídas, **When** o brief e as ideias são gerados, **Then** os dois prompts recebem a lista de evidências e o brief gravado cita pelo menos um `[E#]` existente (FR-004)

### US-002 — Evidência sem trecho literal não entra (P1)

**Ator:** operador.
**Valor independente:** nenhuma evidência inventada pelo LLM chega ao estudo.
**Verificação independente:** `bun test` com um extrator que devolve um trecho ausente do conteúdo buscado.

1. **Given** um resultado de busca com conteúdo conhecido, **When** o extrator devolve um trecho que não está nesse conteúdo, **Then** a evidência é descartada e não aparece em `00-evidencias.md` nem no `dados.json` (FR-003)

### US-003 — Cada ideia tem a própria pesquisa (P1)

**Ator:** operador.
**Valor independente:** o decisor e o plano de cada ideia veem concorrente e preço daquela solução.
**Verificação independente:** `bun test` prova as buscas por ideia, o estado do decisor e a seção Fontes.

1. **Given** ideias geradas, **When** cada ideia é avaliada, **Then** o app faz as buscas de concorrente e de preço da ideia e o estado enviado ao decisor contém as evidências dela (FR-005, FR-006)
2. **Given** um plano que cita `[E2]` e `[E7]`, **When** o código monta o README da ideia, **Then** o arquivo termina com a seção "Fontes" listando exatamente E2 e E7 com URL (FR-007)

### US-004 — Provedor de busca configurável e medido (P2)

**Ator:** operador.
**Valor independente:** ele cadastra a chave da busca em `/settings`, testa, e vê o consumo de busca no custo do estudo.
**Verificação independente:** `bun test` prova o tipo `search` no catálogo, o fail-fast e o consumo.

1. **Given** o serviço sem `SEARCH_API_KEY` e sem perfil de busca ativo, **When** ele sobe fora do modo simulado, **Then** o startup falha com a mensagem da chave ausente, sem expor segredo (FR-008)
2. **Given** um perfil de busca ativo em `/settings`, **When** o operador troca de perfil e reexecuta o estudo, **Then** as buscas usam o perfil novo e o cache gravado pelo anterior não é servido (FR-009)
3. **Given** um estudo concluído, **When** o operador abre o detalhe, **Then** `usage` traz o número de buscas e `cost` soma o preço configurado da busca (FR-010)

### US-005 — Pesquisa fraca aparece na tela (P2)

**Ator:** usuário da interface web.
**Valor independente:** ele sabe quando o estudo tem pouca base real.
**Verificação independente:** `bun test` da página do estudo com menos de 5 evidências.

1. **Given** um estudo com menos de 5 evidências, **When** o usuário abre a página do estudo, **Then** vê a contagem e um aviso de pesquisa fraca com a ação "Executar de novo" (FR-011)

## Contrato observável

- **Entradas:** `SEARCH_API_URL`, `SEARCH_API_KEY`, `GOODBIZZ_MOCK_SEARCH`, `GOODBIZZ_PRICE_SEARCH_PER_1K`; flags `--mock-search`, `--search-url`, `--search-key`; perfis do tipo `search` em `/api/settings/providers`.
- **Saídas e efeitos:** chamada `POST {SEARCH_API_URL}/search` com `{"query","max_results","search_depth":"basic"}`; `00-evidencias.md` com id, tipo, afirmação, trecho e URL; chave `evidencias` no `dados.json` com os campos `id`, `tipo`, `afirmacao`, `trecho`, `url`, `valor`, `unidade` e `ideia`; seção "Fontes" no README de cada ideia; `evidenceCount` e `usage.search.calls` no detalhe do estudo.
- **Erros:** `401`/`403` do provedor de busca vira a frase da credencial de busca; `429` vira a frase de limite de uso; rede ou DNS vira a frase de rede; todos com o detalhe cru entre parênteses, como os erros de LLM e decisor; uma busca que falha depois das retentativas não derruba o estudo, ela entra em `issues`.

## Requisitos

### Funcionais

- **FR-001:** a fase de pesquisa roda antes do brief, no estudo novo e na reexecução, e o progresso mostra a fase com rótulo próprio.
- **FR-002:** o LLM gera entre 6 e 10 buscas cobrindo concorrentes e preços de solução, reclamações de clientes, custos e perdas do nicho, número de negócios na cidade e regulação.
- **FR-003:** uma evidência só entra no estudo quando o trecho citado aparece literalmente, com espaços normalizados, no conteúdo do resultado de busca da mesma URL.
- **FR-004:** o brief, as ideias e o plano recebem a lista de evidências e o prompt obriga a citar `[E#]` ao lado de cada afirmação factual.
- **FR-005:** cada ideia recebe duas buscas próprias, uma de concorrente direto e uma de preço da solução, e as evidências resultantes guardam o nome da ideia.
- **FR-006:** o estado enviado ao decisor em `evaluateIdea` contém as evidências da ideia e as do estudo, e o hash dessas evidências entra na chave de cache da avaliação.
- **FR-007:** o código anexa ao README de cada ideia a seção "Fontes" com as evidências citadas no texto, e ignora citação de id inexistente registrando-a em `issues`.
- **FR-008:** fora do modo simulado, o startup falha quando não há chave de busca no ambiente nem perfil de busca ativo.
- **FR-009:** o tipo `search` existe no catálogo de `/settings`, no Testar, na precedência perfil sobre ambiente e na impressão de cache.
- **FR-010:** o consumo do estudo conta as chamadas de busca e o custo soma `GOODBIZZ_PRICE_SEARCH_PER_1K` por mil chamadas.
- **FR-011:** a página do estudo mostra a contagem de evidências e um aviso quando há menos de 5 evidências.
- **FR-012:** a adição de ideias (`generateAddition`) reaproveita as evidências do estudo e pesquisa só as ideias novas.

### Qualidade e restrições

- **QR-001:** com `GOODBIZZ_MOCK=1` ou `GOODBIZZ_MOCK_SEARCH=1` o pipeline não abre conexão de rede para busca e produz as mesmas evidências para a mesma entrada.
- **QR-002:** a chave de busca nunca aparece em log, resposta HTTP, artefato ou página; a API devolve só a máscara.
- **QR-003:** reexecutar um estudo com o mesmo provedor de busca não repete nenhuma busca já gravada no cache.
- **QR-004:** `domain` não importa `application` nem `infrastructure`, e todo acesso a dados novo passa por Drizzle.

## Casos de borda

- **EC-001:** se uma busca devolve zero resultados, o estudo segue com as outras buscas e registra a busca vazia em `issues` (FR-002, FR-011).
- **EC-002:** se o extrator devolve JSON inválido, o app tenta extrair de novo uma vez e, se falhar de novo, segue sem evidências daquela busca e registra em `issues` (FR-003).
- **EC-003:** duas buscas que devolvem a mesma URL geram uma única entrada de resultado antes da extração (FR-002, FR-003).
- **EC-004:** o plano que cita `[E99]` inexistente não ganha E99 em "Fontes" e o estudo registra a citação órfã (FR-007).
- **EC-005:** estudo antigo sem evidências abre normalmente e mostra contagem zero com o aviso (FR-011, QR-003).

## Critérios de sucesso

- **SC-001:** `bun test` passa com as asserções de fase, extração literal, pesquisa por ideia, Fontes, fail-fast, catálogo, consumo e aviso (FR-001, FR-003, FR-005, FR-007, FR-008, FR-009, FR-010, FR-011).
- **SC-002:** `bun run cli generate "depositos de bebidas" --city "Cabo Frio" --ideas 3 --mock` grava `00-evidencias.md` e todo README de ideia termina com a seção Fontes (FR-002, FR-004, FR-006, FR-012, QR-001).
- **SC-003:** `bun run check`, `bunx eslint .` e `bunx prettier --check .` passam (QR-004).
- **SC-004:** `pwn work gate --all --work 0015` aprovado e `.specs/system.json` reconciliada com a fase de pesquisa (FR-001, QR-002, QR-003).

## Premissas

- **A-001:** o provedor padrão segue o protocolo Tavily de `POST /search` com conteúdo extraído no campo `content` de cada resultado.
- **A-002:** 5 resultados por busca bastam; um estudo de 8 ideias consome cerca de 26 buscas (10 do estudo e 2 por ideia), dentro dos 1.000 créditos mensais grátis.
- **A-003:** o conteúdo extraído pelo provedor é a fonte da validação literal; o app não baixa a página por conta própria.

## Componentes afetados

- `src/domain/ports.ts`, `src/domain/types.ts`, `src/domain/errors.ts` — porta, tipos de evidência e de consumo, erro de busca.
- `src/infrastructure/search.ts`, `src/infrastructure/search-mock.ts`, `src/infrastructure/routing.ts`, `src/infrastructure/provider-probe.ts` — adaptadores, roteamento e Testar.
- `src/config/env.ts`, `src/config/providers.ts`, `src/config/runtime.ts`, `.env.example` — variáveis, catálogo e impressão.
- `src/application/research.ts` (novo), `src/application/generation.ts`, `src/application/prompts.ts`, `src/application/evaluate.ts`, `src/application/generate-study.ts`, `src/application/study-service.ts` — fase de pesquisa e uso das evidências.
- `src/application/artifacts.ts`, `src/application/reports.ts` — `00-evidencias.md`, `dados.json` e Fontes.
- `src/infrastructure/http/api.ts`, `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/routes.tsx`, `src/cli.ts`, `src/index.ts` — API, telas, CLI e bootstrap.
- `README.md`, `.specs/system.json`, `tests/*` — documentação, reconciliação e testes.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
|---|---|---|
| `FR-001` | US-001, SC-001, SC-004 | teste da ordem das fases com pesquisa antes do brief |
| `FR-002` | US-001, EC-001, EC-003, SC-002 | teste do número de buscas e da deduplicação por URL |
| `FR-003` | US-002, EC-002, SC-001 | teste que descarta trecho ausente do conteúdo buscado |
| `FR-004` | US-001, SC-002 | teste dos prompts com evidências e da citação no brief |
| `FR-005` | US-003, SC-001 | teste das duas buscas por ideia com o nome gravado |
| `FR-006` | US-003, SC-002 | teste do estado do decisor e da chave de cache da avaliação |
| `FR-007` | US-003, EC-004, SC-001 | teste da seção Fontes e da citação órfã em issues |
| `FR-008` | US-004, SC-001 | teste do startup sem chave de busca fora do modo simulado |
| `FR-009` | US-004, SC-001 | teste do tipo search no catálogo e na impressão de cache |
| `FR-010` | US-004, SC-001 | teste do consumo de busca e do custo por mil chamadas |
| `FR-011` | US-005, EC-001, EC-005, SC-001 | teste da página com contagem e aviso de pesquisa fraca |
| `FR-012` | SC-002 | teste da adição de ideias que pesquisa só as novas |
| `QR-001` | SC-002 | teste do modo simulado sem rede e com saída determinística |
| `QR-002` | SC-004 | teste de que a chave de busca não aparece na API nem na página |
| `QR-003` | EC-005, SC-004 | teste da reexecução sem busca repetida no cache |
| `QR-004` | SC-003 | lint, typecheck e regra de dependência do domínio passando |
