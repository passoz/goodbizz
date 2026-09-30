# PROMPT: Tratar erro do provedor LLM como falha tipada em vez de erro de parsing

**Status:** Pronto para planejamento
**Work ID:** 0002
**Origem:** `.sources/0002-llm-provider-error.md`
**System spec:** `.specs/system.json`
**Baseline:** system spec versao 1, status "Baseline parcial" (2026-09-29)

## Delta da system spec

- **Capacidades afetadas:** CAP-001 (falha de provedor), CAP-013 e CAP-014 (superficie HTTP que consome o erro).
- **Regras preservadas:** BR-011, BR-019, BR-020, BR-023, DEC-001, DEC-003.
- **Regras alteradas:** nenhuma regra e alterada; CON-004 passa a declarar o erro do provedor por classe de status, alinhando-se ao padrao que CON-005 ja descreve para o outro cliente.
- **Contratos afetados:** CON-004 (errors). CON-005 e a referencia de padrao, nao alvo.
- **Qualidades, entidades e integrações relacionadas:** SQR-004 (a configuracao falha rapido e nunca expoe segredo em log ou saida) e a integracao INT-001 (provedor LLM externo, o mesmo ator de CON-004). Nenhuma entidade nova: a falha continua sendo um erro de dominio, sem persistencia propria.
- **Gaps tocados:** GAP-003 (novo, drift entre CON-004 e CON-005).
- **Reconciliação esperada após implementação:** CON-004 deixa de dizer "retentativa com backoff; erro apos 3 tentativas" e passa a enumerar os status nao retentaveis; GAP-003 resolvido com evidencia de teste.

## Problema e resultado

**Problema:** o cliente LLM (`src/infrastructure/llm.ts`) nao checa `response.ok`. Um provedor que responde erro (saldo zerado com 402, credencial recusada com 401, modelo inexistente com 400) devolve um corpo sem `choices`, e o cliente cai no extrator de conteudo e levanta `response missing choices[0].message.content`. A mensagem real do provedor e destruida e trocada por um erro de parsing que nao ajuda ninguem. Pior: 402, 401, 403 e 400 sao deterministicos, e o cliente os retenta tres vezes assim mesmo, queimando tempo sem chance de sucesso. O `DeciderHttp` ja faz o oposto em `decider.ts:158-176`: aborta sem retentativa e carrega o corpo do erro.

Observado em producao em 2026-09-29 (namespace `goodbizz` do cluster k3s, imagem `ghcr.io/passoz/goodbizz:main`). A resposta real do provedor, obtida com uma chamada de custo desprezivel contra a mesma chave do pod, foi `HTTP 402` com `Insufficient Balance`. O log do processo, no entanto, registrava apenas `LLM failed after 3 attempts: Error: response missing choices[0].message.content`, seguido de um 500 em `POST /ui/studies/id/delete` e de um 204 no delete pela API. Detalhes e limites da evidencia em `.sources/0002-llm-provider-error.md`.

**Resultado esperado:** falha de provedor chega ao operador como `LlmError` com o status e a mensagem do provedor, sem retentativa quando o status e deterministico, e a politica de retentativa do cliente LLM passa a ser a mesma do cliente do decisor.

## Contexto confirmado

- **Nao e opiniao nova: e drift de contrato dentro da spec.** Os dois contratos do mesmo padrao de falha discordam hoje. CON-005 (decisor) diz "400/401/403 abortam sem retentativa; demais erros com backoff". CON-004 (LLM) diz "retentativa com backoff; erro apos 3 tentativas".
- O `DeciderHttp` implementa CON-005 e serve de padrao de referencia; a mudanca e paridade entre dois clientes do mesmo protocolo, nao invencao de regra.
- `LlmError` ja e `DomainError` com status 502 e codigo `LLM_FAILED` em `domain/errors.ts`, e `buildErrorHandler` em `infrastructure/http/errors.ts` ja mapeia `DomainError` para status e corpo com codigo e mensagem. O que falta e a mensagem ser a verdadeira e a retentativa respeitar a classe do erro.
- O work 0001 ja descreve esse comportamento para o decisor em `.prompts/0001-change.md`. Nenhum requisito equivalente existe para o LLM.
- 402 nao foi tratado em CON-005 porque o provedor de decisor nao cobra. Para o LLM, saldo zerado e o caso comum de falha em producao.

## Atores e valor

- **ACT-001 Operador/consultor (CLI):** precisa saber que a credencial esta sem saldo, e nao que o cliente conseguiu ler a resposta.
- **ACT-002 Cliente da API HTTP:** recebe 502 com codigo e mensagem que descrevem a causa real em vez de uma referencia interna a envelope de resposta.
- **ACT-004 Provedor LLM externo:** a mensagem que ele devolve chega intacta ate o operador, o que permite agir (recarregar, trocar chave, corrigir modelo).

## Escopo

### Inclui

- Checagem de `response.ok` no cliente LLM, com o status e o corpo de erro do provedor preservados na mensagem.
- Politica de retentativa por classe de status, espelhando `DeciderHttp`: abortar sem retentativa em erro deterministico, reenviar em transitorio.
- Distincao entre acao do operador (402 saldo, 401 credencial, 400, 404 e 422 de request) e instabilidade do provedor (429 e 5xx).
- Corpo de resposta que nao e JSON tratado sem estourar `SyntaxError` cru.
- Testes que provam, contra servidor em loopback, que a mensagem do provedor sobrevive, que a quantidade de chamadas respetita a classe do status e que o segredo nao vaza na mensagem.

### Não inclui

- Os outros dois defeitos observados na mesma sessao, que ficam para work proprio: `routes.tsx:189-194` so captura `NotFoundError`, deixando o `ConflictError` que `study-service.ts:217` documenta como 409 sair como 500; e um `Error` nao-Domain com mensagem vazia que escapa do handler sem throw site identificado.
- Resolver GAP-002 (reescrita de documentacao) e GAP-001 (servico, persistencia, interface), que sao de work 0001.
- Validar se `LLM_API_MODEL` referencia um modelo existente no provedor, porque o 402 responde antes da validacao do nome do modelo.
- Trocar de provedor de LLM ou criar camada de degradacao para saldo insuficiente.

## Cenários de usuário

### US-001 — Operador descobre que a credencial esta sem saldo (P1)

**Ator:** operador na linha de comando.
**Valor independente:** permite recarregar a conta em vez de depurar "missing choices" no codigo.
**Verificação independente:** a mensagem de erro conter "Insufficient Balance" e "402", e o servidor de teste ter registrado uma unica chamada.

1. **Given** um provedor LLM que responde 402 com mensagem de saldo insuficiente, **When** o operador dispara um estudo, **Then** a falha e `LlmError` com codigo `LLM_FAILED` e status 502, a mensagem contem o status e o texto do provedor, e o provedor foi chamado uma unica vez (FR-001, FR-002)

### US-002 — Provedor instavel ainda e reenviado (P2)

**Ator:** operador na linha de comando.
**Valor independente:** garante que a tolerancia a instabilidade nao foi perdida ao endurecer a politica.
**Verificação independente:** com 503 seguido de sucesso o texto volta inteiro; com 429 sempre a falha final contem "429" e o servidor registra duas chamadas.

1. **Given** um provedor que responde 503 na primeira chamada e sucesso na segunda, **When** o operador dispara um estudo, **Then** a segunda tentativa entrega o conteudo e o provedor foi chamado duas vezes (FR-002, QR-002)

## Contrato observável

- **Entradas:** inalteradas, `POST {LLM_API_URL}/chat/completions` com mensagens system e user, conforme CON-004.
- **Saídas e efeitos:** inalteradas em sucesso, `choices[0].message.content` em texto.
- **Erros:** status nao retentavel (400, 401, 402, 403, 404 e 422) com corpo JSON produz `LlmError(LLM_FAILED, 502)` com mensagem contendo "provider error 402: Insufficient Balance" no caso de saldo zerado, em uma unica chamada; status nao retentavel com corpo que nao e JSON produz mensagem contendo "response not json: status=502" para um gateway que devolve HTML; 429 e 5xx reenviam com backoff linear e, ao esgotar, produzem `LlmError(LLM_FAILED, 502)` com "LLM failed after 2 attempts (status 503)"; erro de rede ou timeout reenvia e, ao esgotar, produz `LlmError` com a causa original; segredo nunca aparece na mensagem, porque ela passa por `scrub` antes de virar `LlmError`.

## Requisitos

### Funcionais

- **FR-001:** o cliente LLM checa `response.ok` e, em resposta de erro, inclui status e mensagem do provedor na falha.
- **FR-002:** o cliente LLM nao retenta status deterministico (400, 401, 402, 403, 404 e 422) e retenta 429 e 5xx.
- **FR-003:** corpo que nao e JSON vira erro com o status, sem propagar `SyntaxError` cru.

### Qualidade e restrições

- **QR-001:** a mensagem de falha nunca contem a chave nem o cabecalho de autorizacao, e `scrub` e aplicado a toda mensagem vinda do provedor.
- **QR-002:** a politica de retentativa do cliente LLM e a mesma do cliente do decisor, para que os dois clientes do mesmo padrao de falha se comportem igual.
- **QR-003:** `src/domain` nao importa `src/infrastructure`, e a distincao de status retentavel fica no adapter, nao no dominio.

## Casos de borda

- **EC-001:** quando o provedor responde 402 com saldo insuficiente, a falha preserva a mensagem do provedor, nao retenta e o operador ve a causa real (FR-001, FR-002).
- **EC-002:** quando o provedor responde 429 ou 5xx, a chamada e reenviada com backoff e o status aparece na falha final (FR-002).
- **EC-003:** quando o corpo da resposta nao e JSON, a falha cita o status em vez de estourar erro de parsing (FR-003).
- **EC-004:** quando o corpo de erro carrega o segredo em texto livre, a mensagem final nao o contem (QR-001).

## Critérios de sucesso

- **SC-001:** o teste do cliente LLM prova que 402 nao e retentado, que a mensagem do provedor aparece e que a chave nao vaza (FR-001, QR-001).
- **SC-002:** a suite inteira passa sem rede e sem aumento de chamadas pagas (FR-002, QR-003).

## Premissas

- **A-001:** provedores compativeis com a API da OpenAI reportam erro com corpo JSON contendo `error.message`; quando nao reportam, o status ainda e legivel.
- **A-002:** saldo insuficiente e falha de credencial sao estados estaveis do lado do provedor, nao transitorios.

## Componentes afetados

- `src/infrastructure/llm.ts` — unico arquivo de producao tocado.
- `tests/llm.test.ts` — evidencia RED/GREEN.
- `src/infrastructure/decider.ts` — apenas leitura, e a referencia de padrao e nao deve ser alterado.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
|---|---|---|
| `FR-001` | US-001, EC-001 | teste com servidor em loopback respondendo 402 e a mensagem contendo o texto do provedor |
| `FR-002` | US-001, US-002, EC-001, EC-002 | teste contando chamadas ao provedor: uma em 402, duas em 503 seguido de sucesso |
| `FR-003` | EC-003 | teste com corpo nao-JSON e a falha citando o status |
| `QR-001` | EC-004, SC-001 | teste com segredo no corpo de erro e a mensagem final sem o segredo |
| `QR-002` | US-001, US-002 | comparacao da politica de retentativa com `DeciderHttp` |
| `QR-003` | SC-002 | typecheck estrito e lint sem erro |
| `SC-001` | US-001 | `bun test tests/llm.test.ts` |
| `SC-002` | — | `bun test` sem rede |
