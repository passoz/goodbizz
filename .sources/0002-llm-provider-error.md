# Snapshot da origem — Work 0002

Capturado em 2026-09-30, a partir do prompt do operador e do estado observado em
produção (namespace `goodbizz` do cluster k3s, imagem `ghcr.io/passoz/goodbizz:main`).

## Sintoma reportado

Um estudo criado pela interface web terminou em erro 500, e o operador suspeitou
que o serviço havia reiniciado.

## Verificacao do sintoma

O pod nao havia reiniciado. As 4937 linhas de log do pod continham um unico
hostname e um unico pid (1), e havia exatamente uma resposta 5xx em toda a vida
do processo:

```
POST /api/studies                          201   niche "sebo de livros"
study run failed  LlmError: LLM failed after 3 attempts:
                  Error: response missing choices[0].message.content
POST /ui/studies/{id}/delete              500   unhandled exception
DELETE /api/studies/{id}                  204   (o JS degradou e deletou mesmo assim)
```

## Causa raiz

Uma chamada de custo desprezivel (`max_tokens: 1`) contra a mesma chave que o
pod usa, ao endpoint configurado no secret `goodbizz-env`, respondeu:

```
HTTP 402
{"error":{"message":"Insufficient Balance (request_id: 551da750)",
          "type":"unknown_error",
          "param":null,
          "code":"invalid_request_error"}}
```

O cliente LLM nao checa `response.ok`. O corpo do 402 nao tem `choices`, entao
`data.choices?.[0]?.message?.content` e `undefined` e o cliente levanta
`response missing choices[0].message.content`, substituindo a mensagem real.
Como 402 e deterministico, as tres tentativas do cliente falharam do mesmo jeito.

## Leitura no codigo

`src/infrastructure/llm.ts` (estado anterior a mudanca) parseava o corpo sem
checar `response.ok` e retentava qualquer falha, inclusive deterministicas.

`src/infrastructure/decider.ts:158-176` ja fazia o oposto, e a system spec ja
descrevia os dois comportamentos de forma divergente para o mesmo padrao de
falha de provedor (CON-004 contra CON-005).

## Limite do que o snapshot comprova

- A conta do provedor esta sem saldo. Nenhum estudo roda ate a recarga.
- `deepseek-flash` nao pode ser validado agora: o 402 responde antes de o
  provedor validar o nome do modelo.
- Dois outros defeitos foram observados na mesma sessao e NAO fazem parte
  deste work: `routes.tsx:189-194` captura apenas `NotFoundError`, deixando o
  `ConflictError` que `study-service.ts:217` documenta como 409 sair como
  500; e um `Error` nao-Domain com mensagem vazia escapa do handler sem que o
  throw site tenha sido identificado.
