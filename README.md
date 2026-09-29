# goodbizz

Um prompt pequeno entra, um estudo de negocio completo sai — agora como **servico Bun/TypeScript**:
CLI, API HTTP e interface web sobre a mesma logica, com persistencia SQLite.

Voce descreve um nicho de mercado em uma frase. A ferramenta gera ideias de produto, avalia cada uma
em um **decisor System One** (modelo probabilistico que mede chances reais em vez de alucinar texto) e
redige planos de negocio executivos: estrategia comercial, marketing, precificacao, analise SWOT,
Business Model Canvas, 5 Forcas de Porter, matriz de risco, roadmap de implantacao e KPIs.

The original Python implementation is kept in this repository as the reference baseline
(`goodbizz/*.py`, `generate_study.py`, `diagnose.py`, `recalibrate.py`). The runtime that is built,
shipped and tested is the TypeScript one under `src/`.

---

## Arquitetura

```
src/
  domain/            tipos, portas e erros puros (nao importa application/infrastructure)
    types.ts         Idea, IdeaEvaluation, StudyRecord, StudySummary, ...
    ports.ts         LlmClient, DeciderClient, StudyRepository, CacheStore, Logger, ArtifactStore
    errors.ts        DomainError + codigo/status HTTP por classe
    pain.ts          sondas e limiares calibrados
    hash.ts          sha256 deterministico (mock e cache)
  application/       casos de uso
    generate-study.ts  pipeline brief -> ideias -> avaliacao -> dor -> documentos -> relatorios -> html
    study-service.ts   fachada usada pela CLI, pela API e pela web
    evaluate.ts, summary.ts, pain-algorithm.ts, pain-choice.ts
    generation.ts, prompts.ts            prompts e bloco de dados medidos
    reports.ts, artifacts.ts, dados.ts   relatorios deterministicos e formato em disco
    render.ts, normalize.ts, verification.ts, pdf.ts
    diagnose.ts, recalibrate.ts, cache.ts
  infrastructure/    adapters
    llm.ts, llm-mock.ts, json.ts         provedor OpenAI-compativel
    decider.ts, decider-mock.ts          protocolo System One
    schema.ts, db.ts, repositories.ts, cache-repository.ts
    http/{app,api,health,errors}.ts      servico HTTP
    http/ui/*                            interface web (hono/jsx)
  config/            env validado (Zod), resolucao da configuracao, redacao de segredos
  cli.ts             CLI
  index.ts           bootstrap do servico
tests/               suite Bun (offline e deterministica)
.pwn/, .specs/, .prompts/, .sources/, .todo/   governanca do harness pwn
```

Regra de dependencia: `domain` nao importa `application` nem `infrastructure`. Nenhum acesso a dados
escreve SQL cru — tudo via Drizzle sobre `bun:sqlite`.

**Nada de inferencia local.** LLM e decisor continuam endpoints HTTP externos; a imagem nao carrega
pesos nem runtime de modelo.

---

## Requisitos

- [Bun](https://bun.sh) 1.4+ (runtime unico: CLI, servico e testes)
- Chromium (opcional) apenas para gerar PDF
- Docker (opcional) para a imagem

```bash
bun install
bun run check        # typecheck estrito
bun test             # suite offline
```

---

## Configuracao (12-factor)

Segredos vivem **apenas** no ambiente. O contrato das chaves esta versionado em `.env.example`.

| Variavel               | Padrao                      | Descricao                                             |
| ---------------------- | --------------------------- | ----------------------------------------------------- |
| `LLM_API_URL`          | `https://api.openai.com/v1` | base URL compativel com `/chat/completions`           |
| `LLM_API_KEY`          | —                           | chave do provedor LLM (obrigatoria fora do modo mock) |
| `LLM_API_MODEL`        | `gpt-4o-mini`               | modelo do LLM                                         |
| `DECISION_API_URL`     | —                           | endpoint System One (Jev, Laya, runtime local)        |
| `DECISION_API_KEY`     | —                           | chave do decisor (Bearer e `x-api-key`)               |
| `DECISION_API_MODEL`   | `systemone-latest`          | modelo do decisor                                     |
| `PORT`                 | `3000`                      | porta do servico HTTP                                 |
| `DATABASE_URL`         | `app.db`                    | SQLite (`:memory:` aceito)                            |
| `LOG_LEVEL`            | `info`                      | `debug` \| `info` \| `warn` \| `error`                |
| `APP_ENV`              | `development`               | `production` liga HTTPS/HSTS e cookies `secure`       |
| `SESSION_SECRET`       | placeholder de dev          | >= 32 caracteres, assina o cookie de CSRF             |
| `GOODBIZZ_STUDIES_DIR` | `estudo`                    | raiz dos artefatos por estudo                         |
| `GOODBIZZ_MOCK`        | `0`                         | `1` sobe o servico com LLM e decisor simulados        |

O processo falha no startup quando uma chave obrigatoria do modo real esta ausente, e nenhuma chave
aparece em log, resposta HTTP ou artefato (redacao por `src/config/redact.ts`).

---

## CLI

```bash
bun run cli generate "oficinas mecanicas de bairro" --ideas 5 --mock --pdf
bun run cli diagnose --ideas exemplos.json --niche "pousadas historicas"
bun run cli recalibrate coleta/dados.json --cutoff 1.40
bun run cli serve
bun run cli help
```

`bin/goodbizz` e o dispatcher (pode ser linkado no `PATH`); ele aceita `generate|gerar|study|estudo`,
`diagnose|diagnosticar`, `recalibrate|recalibrar`, `serve|servico|server` e `help|ajuda`.

Flags de `generate` (com aliases do baseline): `--niche/--nicho`, `--city/--cidade`, `--ticket`,
`--ideas/--ideias`, `--output/--saida`, `--ideas-file/--ideias-arquivo`,
`--pain-method/--metodo-dor`, `--eval-only/--so-avaliar`, `--mock`, `--mock-llm`,
`--mock-decider/--mock-decisor`, `--pdf`, `--concurrency/--paralelo`, `--timeout`, `--llm-url`,
`--llm-model`, `--llm-key`, `--decider-url/--decisor-url`, `--decider-model/--decisor-model`,
`--decider-key/--decisor-key`.

Codigos de saida: `0` sucesso, `1` falha (ou menos de 3 sondas uteis no diagnose), `2` erro de
configuracao/subcomando desconhecido, `130` interrupcao por teclado.

### O que sai no final

```
estudo/
├── README.md              # indice executivo: ranking, medias e grupos de dor
├── 00-brief.md            # leitura de mercado que orientou as ideias
├── 00-tabelao.md          # tabela comparativa de todos os indicadores
├── 00-tabelao.csv         # a mesma tabela para planilha
├── dados.json             # dump completo (chaves do baseline, consumivel pelo recalibrate)
├── .cache.db              # cache de respostas por chave hash (SQLite)
├── 01-<ideia-campea>/README.md   # plano completo da ideia #1 do ranking
├── 02-<segunda-ideia>/README.md
├── estudo-completo.html   # com --pdf
└── estudo-completo.pdf    # com --pdf e Chromium instalado
```

---

## API HTTP

Prefixo `/api`. Sem CSRF (autentique no proxy, se necessario).

| Metodo | Rota                           | Efeito                                                |
| ------ | ------------------------------ | ----------------------------------------------------- |
| `GET`  | `/api/config`                  | quais provedores estao configurados (booleanos)       |
| `POST` | `/api/studies`                 | cria um estudo e inicia a execucao (201)              |
| `GET`  | `/api/studies`                 | lista os estudos com estado e topo do ranking         |
| `GET`  | `/api/studies/:id`             | detalhe: avaliações ordenadas, resumo, artefatos      |
| `POST` | `/api/studies/:id/run`         | reexecuta o pipeline do estudo                        |
| `GET`  | `/api/studies/:id/artifacts`   | lista os caminhos relativos dos artefatos             |
| `GET`  | `/api/studies/:id/artifacts/*` | conteudo do artefato (markdown, csv, json, html, pdf) |
| `POST` | `/api/diagnose`                | coerencia e estabilidade das sondas                   |
| `POST` | `/api/recalibrate`             | busca em grade de limiares sobre `dados.json`         |
| `GET`  | `/healthz`                     | liveness (nao toca o banco)                           |
| `GET`  | `/readyz`                      | readiness (`select 1` no SQLite)                      |

```bash
curl -s localhost:3000/api/studies \
  -H 'content-type: application/json' \
  -d '{"niche":"clinicas odontologicas em cidade media","numIdeas":3,"mock":true}'
curl -s localhost:3000/api/studies/<id> | jq '.evaluations[].name, .evaluations[].tier'
```

Erros: `422` payload invalido (com detalhes de validacao), `404` estudo ou artefato inexistente,
`500` erro interno sem stack trace. Nenhuma resposta inclui caminho de arquivo ou credencial.

---

## Interface web

Duas rotas: `GET /` lista os estudos como cartoes e `GET /new` traz o formulario de criacao.
`GET /studies/:id` mostra o cabecalho, a legenda de leitura, o ranking, as medias, os grupos de dor,
os artefatos e o plano completo. O cartao inteiro abre o estudo: o titulo carrega um link esticado
que cobre a area e o selo "Abrir estudo" mostra a acao. O identificador aparece so como nota de
rodape, para chamadas de API.

**Paleta com significado.** As cores `#DD5855` `#D78133` `#BFC115` `#9FDB43` `#72CE3B` formam a
escala do sistema: vermelho aponta sinal ruim ou quente, laranja pede atencao, amarelo e medio,
limao e verde apontam sinal bom. A mesma escala colore o fundo, o indice de acao, o tier, a dor, o
desvio, o estado do estudo e a disposicao a pagar, sempre com o limiar explicado na legenda.

**Leitura guiada.** Todo dado apresentado vem com o seu helper, no formato `dado 0.89 (maior e
melhor)`: direcao, escala e o que o numero significa. Cada coluna de tabela, bloco de metrica,
selo e card de artefato carrega essa leitura.

**Glossario no hover.** Passar o mouse (ou focar pelo teclado) em uma sigla ou nome abre uma caixa
com a explicacao curta: `WTP`, `Tier`, `fit`, `venda`, `disrupcao`, `desvio`, `FORTE`, `FRACA`,
`INSTAVEL`, `System One`, `LLM`, `guardrail`, `CSRF`, `ticket`, `[INFERENCE]` e outros. As
explicacoes vivem em uma fonte unica (`GLOSSARY` em `src/infrastructure/http/ui/layout.tsx`) e o
texto fica no DOM, portanto e alcancavel por leitor de tela.

**Estilo.** Glassmorphism em CSS nativo: fundo saturado com cinco blobs, paineis com filme
translucido, borda luminosa, brilho especular e sombra profunda, com `backdrop-filter` (blur ao
vivo) habilitado quando o navegador suporta e fallback solido para
`prefers-reduced-transparency`. Sem animacao de entrada (conteudo nunca depende de um frame para
aparecer) e transicoes desligadas em `prefers-reduced-motion`.

A interface consome a **mesma API** (`POST /api/studies` via `fetch`) e mantem um caminho sem
JavaScript (`POST /ui/studies`) protegido por CSRF: mesma origem (`Origin`/`Referer`, fail-closed)
mais token double-submit em cookie assinado, comparado em tempo constante. O token e emitido uma vez
por sessao: rotacionar a cada resposta invalidaria qualquer formulario ja aberto.

---

## Docker

```bash
docker build -t goodbizz .
docker run --rm -p 3000:3000 -e GOODBIZZ_MOCK=1 \
  -e SESSION_SECRET=uma-chave-de-32-bytes-ou-mais goodbizz
# ou
docker compose up --build
```

Imagem multi-stage sobre `oven/bun:1.4`, usuario nao-root, `HEALTHCHECK` em `/healthz`, dados em
`/app/data` (`DATABASE_URL=/app/data/app.db`, `GOODBIZZ_STUDIES_DIR=/app/data/estudos`).
Sem Chromium na imagem: o PDF nao e gerado e a mensagem explica como instalar.

Publique via `docker compose` local ou pelo workflow de imagem (abaixo).

---

## CI/CD

| Workflow                      | O que faz                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`    | jobs `quality` (typecheck, lint, format), `test` (`bun test --coverage`), `security` (`bun audit`, gitleaks), `build` (imagem + smoke em `/healthz`) |
| `.github/workflows/image.yml` | buildx multi-arquitetura, login em `ghcr.io`, push por tag/branch/SHA e cache GHA                                                                    |

Migracoes rodam no boot do processo (`runMigrations`) e sao aditivas; para implantacoes com varias
replicas, rode `bun run db:migrate` como passo separado antes do deploy.

---

## Metodologia

Indicadores por ideia (decisor System One):

| Indicador   | Tipo   | Escala   | O que mede                                              |
| ----------- | ------ | -------- | ------------------------------------------------------- |
| `fit`       | score  | 0–2      | aderencia ao balcao, sem exigir mudanca de habito       |
| `venda`     | score  | 0–2      | facilidade comercial; ataca perda de dinheiro ou imagem |
| `disrupcao` | score  | 0–2      | grau de inovacao do modelo de operacao                  |
| `dor`       | choice | 3 opcoes | dinheiro direto, reputacao publica ou backoffice        |
| `solo`      | noul   | 0–1      | um consultor solo mantem 30 clientes sem colapsar       |
| `wtp`       | noul   | 0–1      | disposicao a pagar o ticket mensal                      |
| `meta30`    | noul   | 0–1      | 30 clientes pagantes em 24 meses na regiao              |
| `preco`     | score  | 0–2      | preco abaixo, compativel ou acima do valor percebido    |

**Indice de Acao** = `(fit + venda) / 2`; **Tier A** `>= 1.84`, **B** `>= 1.60`, **C** abaixo.

A dor tem dois metodos: `choice` (padrao, escolha forcada entre tres consequencias concretas) e
`noul` (legado, quatro sondas x tres parafrases com desvio e escalonamento). Limiares calibrados:
`STRONG_THRESHOLD=0.65`, `WEAK_THRESHOLD=0.50`, `UNSTABLE_THRESHOLD=0.15`, minimo de 3 parafrases.

**Guardrail numerico:** o codigo calcula todos os numeros; o LLM so escreve prosa em volta do bloco
`DADOS MEDIDOS` e e proibido de inventar valor de mercado. Um verificador confere secoes obrigatorias,
acentos, alinhamento de tabela e a presenca literal dos numeros medidos.

---

## Desenvolvimento

```bash
bun run dev            # servico com watch
bun run check          # tsc --noEmit
bunx eslint .          # lint
bun test --coverage    # suite + gate de cobertura
bun run format         # prettier
bun run bench          # benchmarks (tinybench)
bunx drizzle-kit generate   # nova migracao apos mudar src/infrastructure/schema.ts
```

`bun run cli generate --help` lista todas as flags. `--mock` roda o pipeline inteiro offline e
deterministico em menos de um segundo — util para inspecionar a estrutura dos artefatos; **a saida
simulada nao tem valor analitico de mercado**.

---

## Governanca (pwn)

O trabalho foi conduzido com o harness `passoz/pwn`. Estado versionado:

```
.specs/system.json            baseline comportamental do sistema (capacidades, regras, contratos)
.sources/0001-*.md            snapshot do pedido original
.prompts/0001-change.md       especificacao da mudanca (validada por `pwn work specify`)
.pwn/work/0001/               discovery, requisitos, PRD, spec, plan, 29 contratos V4, rastreabilidade
.todo/0001-tasks.md           plano renderizado (valido sob o task contract v3)
```

```bash
pwn work gate --all --work 0001
pwn work contract --work 0001
pwn work status --coverage --work 0001
pwn work plan --work 0001
pwn validate --work 0001
```

---

## Convencoes e limites

1. **Textos sem acento.** Documentos gerados, prompts e artefatos sao mantidos sem acentuacao; a
   normalizacao remove diacriticos antes de gravar.
2. **Hipotese vs pesquisa.** O brief e as ideias vem de modelos sem navegacao em tempo real; numeros de
   mercado sao estimativas marcadas `[INFERENCE]`.
3. **Uso em rede confiavel.** Nao ha autenticacao multiusuario nem multitenancy: coloque a API atras de
   um proxy autenticado se for exposta.
4. **Privacidade.** Nunca coloque dado pessoal, segredo comercial ou informacao sensivel no nicho: o
   texto e transmitido aos endpoints configurados.
5. **Baseline Python.** Os arquivos `*.py` permanecem no repositorio como referencia e evidencia do
   sistema; o runtime suportado e o Bun.
