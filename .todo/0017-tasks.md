# Tasks: O ranking sai de um torneio par a par no decisor

**Contract version:** 3
**Work ID:** 0017

## Execution contract

| Component | Purpose |
|-----------|---------|
| `tournament` | Torneio suico com duelo nas duas ordens |
| `decider-mock` | Decisor simulado responde o duelo de forma deterministica |
| `pipeline` | O pipeline roda o torneio e as pastas seguem os pontos |
| `reports` | Tabelao, CSV e dados.json com a coluna torneio |
| `persistence` | Coluna tournament_json e partidas no detalhe do estudo |
| `study-service` | Remocao e adicao mantem o torneio coerente |
| `ui` | Ranking, glossario e /como-ler mostram o torneio |

## Global gates
- [ ] `bun test` — a suite completa passa com exit 0.
- [ ] `bun run check` — typecheck estrito passa com exit 0.
- [ ] `bunx eslint .` — lint passa com exit 0.
- [ ] `bunx prettier --check .` — formatacao passa com exit 0.

### [x] [1.1] Torneio suico com duelo nas duas ordens

**Requirement:** FR-001
**Depends on:** none
**Behavior:** o modulo do torneio calcula as rodadas, emparelha medias proximas sem repetir, da a folga a pior posicao, pergunta o duelo nas duas ordens com cache e soma a media das probabilidades
**Components:** tournament
**Files:** `src/application/tournament.ts`, `src/domain/types.ts`, `tests/tournament.test.ts`, `tests/tournament-rules.test.ts`, `tests/bunfig.focus.toml`
**Implementation files:** `src/application/tournament.ts`, `src/domain/types.ts`
**Test files:** `tests/tournament.test.ts`, `tests/tournament-rules.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/tournament-rules.test.ts` — o esqueleto devolve zero rodadas, nenhuma probabilidade de duelo e ordena so pelo indice

**Implementation:**
1. Escrever os testes que falham (RED): rodadas, emparelhamento, folga, duas ordens, sem probabilidade, cache e limite de 32 duelos
2. Implementar rodadas, emparelhamento suico, folga, duelo cacheado e pontuacao (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/tournament.test.ts -t "rodadas"` — 8 ideias jogam 4 rodadas sem repetir adversario e no maximo 32 duelos
- [ ] `bun --config=tests/bunfig.focus.toml test tests/tournament.test.ts -t "vies de posicao"` — o decisor que sempre escolhe A deixa 0.5 para cada lado
- [ ] `bun --config=tests/bunfig.focus.toml test tests/tournament.test.ts -t "folga"` — com 3 ideias cada uma folga uma vez, sem partida nem ponto

**Visual:** N/A
**Documentation:** N/A

### [x] [1.2] Decisor simulado responde o duelo de forma deterministica

**Requirement:** QR-001
**Depends on:** 1.1
**Behavior:** o decisor simulado escolhe entre A e B pela forca deterministica do texto de cada opcao, a mesma nas duas ordens
**Components:** decider-mock
**Files:** `src/infrastructure/decider-mock.ts`, `tests/tournament-mock.test.ts`, `tests/decider-mock-duel.test.ts`
**Implementation files:** `src/infrastructure/decider-mock.ts`
**Test files:** `tests/tournament-mock.test.ts`, `tests/decider-mock-duel.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/decider-mock-duel.test.ts` — o mock antigo escolhe o duelo pela semente do estado, nao pela forca do texto de cada opcao

**Implementation:**
1. Escrever o teste que falha (RED): a ideia preferida e a mesma nas duas ordens e o torneio simulado repete ordem e pontos
2. Responder perguntas choice de criterios A e B pela forca do texto de cada opcao (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/tournament-mock.test.ts -t "duelo simulado"` — a preferencia simulada nao depende da posicao
- [ ] `bun --config=tests/bunfig.focus.toml test tests/tournament-mock.test.ts -t "torneio simulado"` — duas execucoes dao a mesma ordem e os mesmos pontos

**Visual:** N/A
**Documentation:** N/A

### [x] [1.3] O pipeline roda o torneio e as pastas seguem os pontos

**Requirement:** FR-004
**Depends on:** 1.2
**Behavior:** o estudo e a adicao rodam o torneio depois da avaliacao; summary.ordered e as pastas seguem a media por partida, com desempate pelo indice e depois pelo nome
**Components:** pipeline
**Files:** `src/application/summary.ts`, `src/application/generate-study.ts`, `src/cli.ts`, `tests/tournament-pipeline.test.ts`, `tests/summary-ranking.test.ts`, `tests/generate-study.test.ts`, `tests/evaluate.test.ts`, `tests/e2e.test.ts`, `tests/smoke.test.ts`, `tests/cli.test.ts`, `tests/workflows.test.ts`, `tests/mock-determinism.test.ts`
**Implementation files:** `src/application/summary.ts`, `src/application/generate-study.ts`, `src/cli.ts`
**Test files:** `tests/tournament-pipeline.test.ts`, `tests/summary-ranking.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/summary-ranking.test.ts` — summarizeStudy ainda ordena pelo indice e ignora a media do torneio e o resumo nao traz as partidas

**Implementation:**
1. Escrever os testes que falham (RED): pasta 01 da ideia preferida e desempate por indice e nome
2. Ordenar o resumo pelo torneio e rodar a etapa no generateStudy e no generateAddition (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/tournament-pipeline.test.ts -t "pasta 01"` — Fiado Digital vence todas, faz media 1.0 em 4 rodadas e ocupa 01-
- [ ] `bun --config=tests/bunfig.focus.toml test tests/tournament-pipeline.test.ts -t "desempate"` — media igual desempata pelo indice e depois pelo nome

**Visual:** N/A
**Documentation:** N/A

### [x] [1.4] Tabelao, CSV e dados.json com a coluna torneio

**Requirement:** QR-002
**Depends on:** 1.3
**Behavior:** tabelao, CSV, indice e dados.json seguem a ordem do torneio e ganham a coluna torneio no fim, sem mudar as chaves existentes
**Components:** reports
**Files:** `src/application/reports.ts`, `src/application/dados.ts`, `tests/tournament-artifacts.test.ts`, `tests/reports-tournament.test.ts`, `tests/reports.test.ts`, `tests/artifacts.test.ts`
**Implementation files:** `src/application/reports.ts`, `src/application/dados.ts`
**Test files:** `tests/tournament-artifacts.test.ts`, `tests/reports-tournament.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/reports-tournament.test.ts` — o tabelao e o CSV nao tem a coluna torneio e ordenam pelo indice

**Implementation:**
1. Escrever os testes que falham (RED): coluna torneio, chaves antigas intactas e ordem pelos pontos
2. Acrescentar torneio no tabelao, no CSV e no dados.json e ordenar pelo torneio (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/tournament-artifacts.test.ts -t "coluna torneio"` — tabelao e CSV trazem a media e as partidas de cada ideia
- [ ] `bun --config=tests/bunfig.focus.toml test tests/tournament-artifacts.test.ts -t "chaves"` — as chaves antigas do CSV e do dados.json nao mudam e torneio_partidas entra no fim

**Visual:** N/A
**Documentation:** N/A

### [x] [1.5] Coluna tournament_json e partidas no detalhe do estudo

**Requirement:** QR-003
**Depends on:** 1.4
**Behavior:** a coluna nullable tournament_json grava os pontos de cada ideia, o rank segue o torneio e estudo antigo abre pela ordem do indice
**Components:** persistence
**Files:** `src/infrastructure/schema.ts`, `src/infrastructure/repositories.ts`, `src/infrastructure/http/api.ts`, `tests/tournament-persistence.test.ts`, `tests/repositories-tournament.test.ts`, `drizzle/0006_tournament.sql`, `drizzle/meta/_journal.json`, `drizzle/meta/0006_snapshot.json`
**Implementation files:** `src/infrastructure/schema.ts`, `src/infrastructure/repositories.ts`, `src/infrastructure/http/api.ts`
**Test files:** `tests/tournament-persistence.test.ts`, `tests/repositories-tournament.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/repositories-tournament.test.ts` — o repositorio descarta os pontos do torneio na leitura e grava o rank pelo indice

**Implementation:**
1. Escrever os testes que falham (RED): pontos sobrevivem a gravacao, estudo antigo ordena pelo indice e a API expoe as partidas
2. Gerar a migracao aditiva, gravar e ler tournament_json e expor tournament no detalhe (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/tournament-persistence.test.ts -t "tournament_json"` — os pontos de cada ideia voltam do banco e o rank segue o torneio
- [ ] `bun --config=tests/bunfig.focus.toml test tests/tournament-persistence.test.ts -t "estudo antigo"` — tournament_json nulo devolve a ordem pelo indice

**Visual:** N/A
**Documentation:** N/A

### [x] [1.6] Remocao e adicao mantem o torneio coerente

**Requirement:** FR-005
**Depends on:** 1.5
**Behavior:** a remocao recalcula as medias das partidas restantes sem chamar o decisor e a adicao roda o torneio de novo servindo do cache toda partida ja gravada
**Components:** study-service
**Files:** `src/application/study-service.ts`, `tests/tournament-study.test.ts`, `tests/study-service-tournament.test.ts`, `tests/study-service.test.ts`, `tests/api.test.ts`
**Implementation files:** `src/application/study-service.ts`
**Test files:** `tests/tournament-study.test.ts`, `tests/study-service-tournament.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/study-service-tournament.test.ts` — a remocao mantem as partidas da ideia excluida e nao recalcula as medias

**Implementation:**
1. Escrever os testes que falham (RED): remocao sem chamada de duelo e adicao com partidas antigas vindas do cache
2. Recalcular o torneio das partidas restantes na remocao e reconciliar as pastas pela ordem nova (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/tournament-study.test.ts -t "remocao"` — zero duelos na remocao e medias recalculadas sem as partidas da ideia excluida
- [ ] `bun --config=tests/bunfig.focus.toml test tests/tournament-study.test.ts -t "adicao"` — toda partida ja disputada vem do cache na adicao

**Visual:** N/A
**Documentation:** N/A

### [x] [1.7] Ranking, glossario e /como-ler mostram o torneio

**Requirement:** FR-007
**Depends on:** 1.6
**Behavior:** o ranking mostra a media do torneio e as partidas de cada ideia, o termo torneio tem entrada no glossario e /como-ler explica a ordem
**Components:** ui
**Files:** `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/layout.tsx`, `src/infrastructure/http/ui/routes.tsx`, `tests/tournament-ui.test.ts`, `tests/ui-tournament.test.ts`, `tests/ui.test.ts`, `README.md`, `.specs/system.json`
**Implementation files:** `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/layout.tsx`, `src/infrastructure/http/ui/routes.tsx`
**Test files:** `tests/tournament-ui.test.ts`, `tests/ui-tournament.test.ts`

**RED:**
- `bun --config=tests/bunfig.focus.toml test tests/ui-tournament.test.ts` — o ranking nao mostra a coluna do torneio e o glossario nao tem o termo

**Implementation:**
1. Escrever os testes que falham (RED): coluna 'em 4 partidas', glossario e /como-ler
2. Acrescentar a coluna, o Term, o helper e a explicacao; atualizar README e a spec (GREEN)

**ACs:**
- [ ] `bun --config=tests/bunfig.focus.toml test tests/tournament-ui.test.ts -t "em 4 partidas"` — o ranking mostra a media e as partidas de cada ideia
- [ ] `bun --config=tests/bunfig.focus.toml test tests/tournament-ui.test.ts -t "glossario"` — o termo torneio aparece no glossario e em /como-ler

**Visual:** N/A
**Documentation:** N/A
