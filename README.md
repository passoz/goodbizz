# GoodBizz

Um prompt pequeno entra, um estudo de negócio completo sai — agora como **serviço Bun/TypeScript**:
CLI, API HTTP e interface web sobre a mesma lógica, com persistencia SQLite.

Voce descreve um nicho de mercado em uma frase. A ferramenta gera ideias de produto, avalia cada uma
em um **decisor System One** (modelo probabilistico que mede chances reais em vez de alucinar texto) e
redige planos de negócio executivos: estratégia comercial, marketing, precificação, análise SWOT,
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

Regra de dependencia: `domain` não importa `application` nem `infrastructure`. Nenhum acesso a dados
escreve SQL cru — tudo via Drizzle sobre `bun:sqlite`.

**Nada de inferencia local.** LLM e decisor continuam endpoints HTTP externos; a imagem não carrega
pesos nem runtime de modelo.

---

## Requisitos

- [Bun](https://bun.sh) 1.4+ (runtime único: CLI, serviço e testes)
- Chromium (opcional) apenas para gerar PDF
- Docker (opcional) para a imagem

```bash
bun install
bun run check        # typecheck estrito
bun test             # suite offline
```

---

## Configuração (12-factor)

Segredos vivem **apenas** no ambiente. O contrato das chaves esta versionado em `.env.example`.

| Variavel                                   | Padrao                      | Descrição                                                                |
| ------------------------------------------ | --------------------------- | ------------------------------------------------------------------------ |
| `LLM_API_URL`                              | `https://api.openai.com/v1` | base URL compativel com `/chat/completions`                              |
| `LLM_API_KEY`                              | —                           | chave do provedor LLM (obrigatoria fora do modo mock)                    |
| `LLM_API_MODEL`                            | `gpt-4o-mini`               | modelo do LLM                                                            |
| `DECISION_API_URL`                         | —                           | endpoint System One (Jev, Laya, runtime local)                           |
| `DECISION_API_KEY`                         | —                           | chave do decisor (Bearer e `x-api-key`)                                  |
| `DECISION_API_MODEL`                       | `systemone-latest`          | modelo do decisor                                                        |
| `PORT`                                     | `3000`                      | porta do servico HTTP                                                    |
| `DATABASE_URL`                             | `app.db`                    | SQLite (`:memory:` aceito)                                               |
| `LOG_LEVEL`                                | `info`                      | `debug` \| `info` \| `warn` \| `error`                                   |
| `APP_ENV`                                  | `development`               | `production` liga HTTPS/HSTS e cookies `secure`                          |
| `SESSION_SECRET`                           | placeholder de dev          | >= 32 caracteres, assina o cookie de CSRF                                |
| `GOODBIZZ_STUDIES_DIR`                     | `estudo`                    | raiz dos artefatos por estudo                                            |
| `GOODBIZZ_MOCK`                            | `0`                         | `1` simula LLM e decisor                                                 |
| `GOODBIZZ_MOCK_LLM`                        | `0`                         | `1` simula apenas o texto, mantendo o decisor real                       |
| `GOODBIZZ_MOCK_DECIDER`                    | `0`                         | `1` simula apenas os numeros, mantendo o LLM real                        |
| `GOODBIZZ_LLM_TIMEOUT` | `300` | segundos por chamada de IA (5–3600); o default antigo (60) cortava os documentos longos |
| `GOODBIZZ_PRICE_LLM_INPUT_PER_MTOK`        | `0.15`                      | US$/1M de tokens de entrada, tabela oficial off-peak do `deepseek-flash` |
| `GOODBIZZ_PRICE_LLM_CACHED_INPUT_PER_MTOK` | `0.0028`                    | US$/1M de tokens de entrada servidos do cache                            |
| `GOODBIZZ_PRICE_LLM_OUTPUT_PER_MTOK`       | `0.28`                      | US$/1M de tokens de saída                                                |
| `GOODBIZZ_PRICE_DECIDER_INPUT_PER_MTOK`    | `0`                         | US$/1M de tokens de entrada do decisor (0 = grátis)                      |
| `GOODBIZZ_PRICE_DECIDER_OUTPUT_PER_MTOK`   | `0`                         | US$/1M de tokens de saída do decisor                                     |
| `GOODBIZZ_USD_BRL`                         | `0`                         | Cotação só para exibir o custo também em R$ (0 desliga)                  |

Modo misto: o serviço aceita simular um provedor e usar o outro de verdade, igual a CLI
(`--mock-llm`, `--mock-decider`). A pagina `/new` mostra o que esta ativo. Provedores reais
impoem fail-fast no startup: sem `LLM_API_KEY` (ou `DECISION_API_URL`) o processo não sobe, a
menos que aquele provedor esteja marcado como simulado.

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
`diagnose|diagnosticar`, `recalibrate|recalibrar`, `serve|serviço|server` e `help|ajuda`.

Flags de `generate` (com aliases do baseline): `--niche/--nicho`, `--city/--cidade`, `--ticket`,
`--ideas/--ideias`, `--output/--saida`, `--ideas-file/--ideias-arquivo`,
`--pain-method/--método-dor`, `--eval-only/--so-avaliar`, `--mock`, `--mock-llm`,
`--mock-decider/--mock-decisor`, `--pdf`, `--concurrency/--paralelo`, `--timeout`, `--llm-url`,
`--llm-model`, `--llm-key`, `--decider-url/--decisor-url`, `--decider-model/--decisor-model`,
`--decider-key/--decisor-key`.

Codigos de saida: `0` sucesso, `1` falha (ou menos de 3 sondas úteis no diagnose), `2` erro de
configuração/subcomando desconhecido, `130` interrupcao por teclado.

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

Prefixo `/api`. Sem CSRF (autentique no proxy, se necessário).

| Método   | Rota                             | Efeito                                                                         |
| -------- | -------------------------------- | ------------------------------------------------------------------------------ |
| `GET`    | `/api/config`                    | quais provedores estao configurados (booleanos)                                |
| `POST`   | `/api/studies`                   | cria um estudo e inicia a execucao (201)                                       |
| `GET`    | `/api/studies`                   | lista os estudos com estado e topo do ranking                                  |
| `GET`    | `/api/studies/:id`               | detalhe: avaliações ordenadas, resumo, artefatos, **consumo e custo estimado** |
| `PATCH`  | `/api/studies/:id`               | renomeia o estudo (`{"niche":"..."}`); `422` inválido, `404` inexistente       |
| `POST`   | `/api/studies/:id/run`           | reexecuta o pipeline do estudo                                                 |
| `DELETE` | `/api/studies/:id`               | apaga o estudo, as avaliações e os artefatos (`204`; `409` se estiver rodando) |
| `GET`    | `/api/studies/:id/artifacts`     | lista os caminhos relativos dos artefatos                                      |
| `GET`    | `/api/studies/:id/artifacts.zip` | baixa tudo em um ZIP (pasta com o slug do nicho)                               |
| `GET`    | `/api/studies/:id/artifacts/*`   | conteudo do artefato (markdown, csv, json, html, pdf)                          |
| `POST`   | `/api/diagnose`                  | coerencia e estabilidade das sondas                                            |
| `POST`   | `/api/recalibrate`               | busca em grade de limiares sobre `dados.json`                                  |
| `GET`    | `/healthz`                       | liveness (nao toca o banco)                                                    |
| `GET`    | `/readyz`                        | readiness (`select 1` no SQLite)                                               |

```bash
curl -s localhost:3000/api/studies \
  -H 'content-type: application/json' \
  -d '{"niche":"clinicas odontologicas em cidade media","numIdeas":3,"mock":true}'
curl -s localhost:3000/api/studies/<id> | jq '.evaluations[].name, .evaluations[].tier'
```

Erros: `422` payload invalido (com detalhes de validação), `404` estudo ou artefato inexistente,
`500` erro interno sem stack trace. Nenhuma resposta inclui caminho de arquivo ou credencial.

---

## Interface web

Quatro rotas: `GET /` lista os estudos como cartoes, `GET /new` traz o formulario de criacao,
`GET /studies/:id` abre um estudo e `GET /como-ler` reune as regras de leitura. O cartao inteiro abre
o estudo: o título carrega um link esticado que cobre a area e o selo "Abrir estudo" mostra a ação. O
identificador aparece so como nota de rodapé, para chamadas de API.

No estudo, **"Baixar .zip"** e a ação do cabecalho (ao lado do título) e entrega a arvore inteira em
um único arquivo, dentro de uma pasta com o slug do nicho. O ZIP e escrito pelo próprio runtime
(`buildZip` em `src/application/artifacts.ts`, PKZIP com deflate e fallback para store): `Bun.Archive`
escreve tar, não zip, e assim a imagem não depende de binario externo. Cada artefato também baixa
direto (`download` no link), sem renderizar markdown dentro da pagina.

**Progresso ao vivo.** Enquanto o pipeline roda, a pagina do estudo mostra o painel de progresso — o
passo atual gravado pelo serviço (`[3/6] ...`), a barra de seis fases e o selo do estado — e consulta
`GET /api/studies/:id` a cada 2 s, recarregando sozinha quando o estudo termina. Sem JavaScript o
texto do passo continua no HTML renderizado (recarregue a mao); a regiao usa `aria-live="polite"`.

**Tema claro e escuro.** O cabecalho traz três estados — `Auto` (segue `prefers-color-scheme`), `Claro`
e `Escuro` — persistidos em `localStorage` e aplicados antes do primeiro paint por um guarda inline em
`<head>`, sem piscar. O tema escuro e o padrão; o claro reescreve superficie, linha, texto forte e
selos em `src/infrastructure/http/ui/layout.tsx`.

**Como ler.** A legenda da metodologia (indicadores, limiares de tier e de dor, escala de cor) vive em
`/como-ler`, alcançável pela navegação, em vez de ocupar o meio do estudo.

**Plano em modal.** Clicar no nome de uma ideia (ranking) abre o plano dela num `<dialog>` nativo, com ESC
e clique no fundo para fechar. O markdown vem renderizado pelo servidor (`GET /studies/:id/ideas/:n`, o
mesmo `mdToHtml` do HTML/PDF exportado) — o navegador não carrega renderizador de markdown, e sem
JavaScript o link cai no artefato cru.

**Excluir estudo.** Cada cartão da lista e o cabeçalho do estudo têm "Excluir" (variante `btn-danger`,
vermelho da escala). Com JavaScript há um diálogo de confirmação seguido de `DELETE /api/studies/:id`;
sem JS o formulário posta em `/ui/studies/:id/delete` com token CSRF. Estudo em execução é recusado
com `409`.

**Paleta com significado.** As cores `#DD5855` `#D78133` `#BFC115` `#9FDB43` `#72CE3B` formam a
escala do sistema: vermelho aponta sinal ruim ou quente, laranja pede atencao, amarelo e medio,
limao e verde apontam sinal bom. A mesma escala colore o fundo, o índice de ação, o tier, a dor, o
desvio, o estado do estudo e a disposição a pagar, sempre com o limiar explicado na legenda.

**Leitura guiada.** Todo dado apresentado vem com o seu helper, no formato `dado 0.89 (maior e
melhor)`: direcao, escala e o que o número significa. Cada coluna de tabela, bloco de metrica,
selo e card de artefato carrega essa leitura.

**Glossario no hover.** Passar o mouse (ou focar pelo teclado) em uma sigla ou nome abre uma caixa
com a explicacao curta: `WTP`, `Tier`, `fit`, `venda`, `disrupção`, `desvio`, `FORTE`, `FRACA`,
`INSTÁVEL`, `System One`, `LLM`, `guardrail`, `CSRF`, `ticket`, `[INFERENCE]` e outros. As
explicacoes vivem em uma fonte unica (`GLOSSARY` em `src/infrastructure/http/ui/layout.tsx`) e o
texto fica no DOM, portanto e alcancavel por leitor de tela.

**Estilo.** Glassmorphism em CSS nativo: fundo saturado com cinco blobs, paineis com filme
translucido, borda luminosa, brilho especular e sombra profunda, com `backdrop-filter` (blur ao
vivo) habilitado quando o navegador suporta e fallback solido para
`prefers-reduced-transparency`. Sem animacao de entrada (conteúdo nunca depende de um frame para
aparecer) e transicoes desligadas em `prefers-reduced-motion`.

A interface consome a **mesma API** (`POST /api/studies` via `fetch`) e mantem um caminho sem
JavaScript (`POST /ui/studies`) protegido por CSRF: mesma origem (`Origin`/`Referer`, fail-closed)
mais token double-submit em cookie assinado, comparado em tempo constante. O token e emitido uma vez
por sessao: rotacionar a cada resposta invalidaria qualquer formulario já aberto.

---

## Configuração em runtime (`/settings`)

A aba **Configurações** (`/settings`) deixa o operador definir, pela interface, o que antes só existia
em variável de ambiente: URL, modelo e chave do LLM e do decisor.

- **Precedência:** o que está salvo em `/settings` **sobrepõe** `LLM_API_*`/`DECISION_API_*` e o
  restante do contrato de ambiente. Campo não preenchido continua herdando o ambiente; `null` (ou o
  botão "limpar") volta a herdar. Na CLI a ordem é _flag explícita > /settings > ambiente_.
- **Vale na hora:** os clientes releem a configuração a cada chamada (troca de URL/chave só recria o
  cliente HTTP quando algo muda) — não precisa reiniciar o processo. O consumo medido sobrevive à troca.
- **Chaves:** são gravadas no SQLite do serviço (`settings`) e nunca voltam em claro pela API nem pela
  página — `GET /api/settings` e `/settings` devolvem apenas a máscara (`sk-abc…1234`) e a origem de
  cada campo (`definido aqui`, `do ambiente`, `não definido`). Como o serviço é acessível só pela
  tailnet e não tem autenticação própria, trate essa aba como área administrativa.
- **API:** `GET /api/settings` e `PATCH /api/settings` com
  `{llmBaseUrl, llmModel, llmApiKey, deciderUrl, deciderModel, deciderApiKey}` (string define,
  `null` limpa); sem JS, o formulário posta em `/ui/settings` com CSRF.

## Consumo e custo estimado

Cada estudo guarda o consumo medido no pipeline: tokens de entrada, de entrada em cache e de saída,
além do número de chamadas ao LLM e ao decisor. A medição vem do `usage` que o provedor devolve
(OpenAI-compatível) e do `usage` do envelope do decisor, quando existir; o pipeline tira a
**diferença antes/depois** da execução, porque os clientes vivem no processo inteiro.

O custo é uma **estimativa** com os preços do ambiente (`GOODBIZZ_PRICE_*`): o código não adivinha o
preço do seu plano. Com dois estudos rodando ao mesmo tempo o consumo é somado no mesmo contador e a
diferença pode ficar trocada entre eles — rode um estudo por vez se precisar de números exatos por
estudo. Os padrões são o preço de tabela do `deepseek-v4-flash` e decisor a custo zero
(motor `jev` do 9router). O valor aparece no detalhe do estudo e como chip na lista; `/api/studies/:id`
devolve `usage` e `cost: {usd, brl, note}`.

## Progresso e falhas em linguagem humana

O passo do pipeline é escrito para ser lido por gente (`[3/6] Avaliei "Radar de Estoque" com o
decisor: índice 1.420 de 2 (maior é melhor), tier B, dor FORTE`), e a página do estudo mostra a fase
com rótulo (`Fase 3 de 6 — Avaliando cada ideia com o decisor System One`).

Quando algo falha, o erro guardado no estudo é uma explicação com ação — não o JSON do provedor:

| Situação                   | Texto (resumido)                                                                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `429` / cota               | "O provedor de IA recusou por limite de uso (429 / cota). Isso passa sozinho: espere alguns minutos e execute o estudo de novo." |
| `401`/`403`                | "O provedor recusou a credencial… confira `LLM_API_KEY`/`DECISION_API_KEY`."                                                     |
| rede/DNS                   | "Não foi possível falar com o provedor de IA (rede ou DNS)."                                                                     |
| `5xx`                      | "O provedor devolveu erro interno (5xx). Tente de novo em alguns minutos."                                                       |
| sem credencial no roteador | "O modelo escolhido não tem credencial ativa no roteador de IA…"                                                                 |

O erro cru entra entre parênteses (`detalhe: [429]: {...}`) e continua inteiro no log do processo.
A página do estudo mostra o texto e um botão **"Executar de novo"**.

## Docker

```bash
docker build -t goodbizz .
docker run --rm -p 3000:3000 -e GOODBIZZ_MOCK=1 \
  -e SESSION_SECRET=uma-chave-de-32-bytes-ou-mais goodbizz
# ou
docker compose up --build
```

Imagem multi-stage sobre `oven/bun:1.4`, usuário não-root, `HEALTHCHECK` em `/healthz`, dados em
`/app/data` (`DATABASE_URL=/app/data/app.db`, `GOODBIZZ_STUDIES_DIR=/app/data/estudos`).
Sem Chromium na imagem: o PDF não e gerado e a mensagem explica como instalar.

Publique via `docker compose` local ou pelo workflow de imagem (abaixo).

---

## CI/CD

| Workflow                      | O que faz                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`    | jobs `quality` (typecheck, lint, format), `test` (`bun test --coverage`), `security` (`bun audit`, gitleaks), `build` (imagem + smoke em `/healthz`) |
| `.github/workflows/image.yml` | buildx multi-arquitetura, login em `ghcr.io`, push por tag/branch/SHA e cache GHA                                                                    |

Migracoes rodam no boot do processo (`runMigrations`) e são aditivas; para implantacoes com varias
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

**Índice de Acao** = `(fit + venda) / 2`; **Tier A** `>= 1.84`, **B** `>= 1.60`, **C** abaixo.

A dor tem dois metodos: `choice` (padrão, escolha forcada entre três consequencias concretas) e
`noul` (legado, quatro sondas x três paráfrases com desvio e escalonamento). Limiares calibrados:
`STRONG_THRESHOLD=0.65`, `WEAK_THRESHOLD=0.50`, `UNSTABLE_THRESHOLD=0.15`, minimo de 3 paráfrases.

**Guardrail numerico:** o código calcula todos os números; o LLM so escreve prosa em volta do bloco
`DADOS MEDIDOS` e e proibido de inventar valor de mercado. Um verificador confere secoes obrigatorias,
acentos, alinhamento de tabela e a presenca literal dos números medidos.

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
determinístico em menos de um segundo — útil para inspecionar a estrutura dos artefatos; **a saida
simulada não tem valor analitico de mercado**.

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

## Convenções e limites

1. **Português do Brasil com acentuação.** Documentos gerados, prompts, interface e artefatos usam
   acentuação correta — a convenção anterior (remover diacríticos antes de gravar, herdada do baseline
   Python) foi revogada. Fica em ASCII apenas o que é identificador: nome de pasta (`01-nome-slug`),
   chaves de `dados.json`, cabeçalho do CSV e nome de flag da CLI.
2. **Hipótese vs pesquisa.** O brief e as ideias vêm de modelos sem navegação em tempo real; números de
   mercado são estimativas marcadas `[INFERENCE]`.
3. **Uso em rede confiável.** Não há autenticação multiusuário nem multitenancy: coloque a API atrás de
   um proxy autenticado se for exposta.
4. **Privacidade.** Nunca coloque dado pessoal, segredo comercial ou informacao sensivel no nicho: o
   texto e transmitido aos endpoints configurados.
5. **Baseline Python.** Os arquivos `*.py` permanecem no repositorio como referência e evidencia do
   sistema; o runtime suportado e o Bun.
