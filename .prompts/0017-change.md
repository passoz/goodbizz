# PROMPT: O ranking sai de um torneio par a par no decisor

**Status:** Pronto para planejamento
**Work ID:** 0017
**Origem:** `.sources/0006-propostas-de-valor.md`
**System spec:** `.specs/system.json`
**Baseline:** system spec versão 1, status "Baseline parcial", última reconciliação em 2026-09-29, commit `743f52f`

## Delta da system spec

- **Capacidades afetadas:** CAP-002 (o decisor compara ideias duas a duas além das notas absolutas), CAP-009 (coluna do torneio no tabelão e no CSV; partidas no `dados.json`), CAP-011 (cada partida entra no cache), CAP-013 e CAP-014 (pontos do torneio no detalhe e no ranking), CAP-015 (coluna nova nas avaliações).
- **Regras preservadas:** BR-003, BR-004 (índice e tier continuam calculados das notas), BR-005 a BR-009, BR-011 a BR-023.
- **Regras alteradas:** BR-010 passa a dizer que a ordem do ranking, e portanto a numeração das pastas, segue a média de pontos por partida no torneio, com desempate pelo índice de ação e depois pelo nome; BR-001 ganha a etapa do torneio depois da avaliação.
- **Contratos afetados:** CON-002 (`tournament` em cada avaliação e `tournament.matches` no detalhe do estudo), CON-003 (coluna e glossário do torneio no ranking e em `/como-ler`), CON-005 (pergunta `choice` de duelo entre duas ideias), CON-006 (coluna `torneio` no tabelão e no CSV; chave aditiva `torneio` por ideia e `torneio_partidas` no `dados.json`).
- **Qualidades, entidades e integrações relacionadas:** SQR-001 vale para o torneio simulado; SQR-005 vale para as partidas; ENT-003 ganha pontos, partidas, vitórias e folgas; INT-002 ganha a pergunta de duelo.
- **Gaps tocados:** nenhum.
- **Reconciliação esperada após implementação:** a spec descreve o torneio suíço com as duas ordens de apresentação, o critério de ordem do ranking, a coluna nova e as regras BR-001 e BR-010 com o texto novo; o Work aplica essa reconciliação em `.specs/system.json` antes de fechar.

## Problema e resultado

**Problema:** as notas absolutas do decisor saem quase iguais para todas as ideias, e o ranking é decidido por diferenças de 0,01 a 0,03. Em 40 ideias reais (`.sources/0006-propostas-de-valor.md`), `meta30` fica entre 0,40 e 0,54 do p10 ao p90; em `~/Downloads/00-tabelao.md`, 18 de 20 ideias têm índice entre 1,615 e 1,92 e todas têm WTP entre 0,45 e 0,58. O operador escolheu a comparação par a par para separar as ideias.

**Resultado esperado:** depois da avaliação, o app roda um torneio suíço em que o decisor escolhe, entre duas ideias, qual o dono contrata primeiro. Cada duelo é perguntado nas duas ordens, e a média anula o viés de posição. O ranking, as pastas e o tabelão seguem a média de pontos por partida; índice e tier continuam como colunas.

## Contexto confirmado

- `summarizeStudy` ordena por índice decrescente (`src/application/summary.ts:50`) e as pastas seguem essa ordem (`src/application/generate-study.ts:333-336`).
- O decisor já responde perguntas `choice` com `probabilities` por opção (`src/application/evaluate.ts:184-204`).
- A remoção de ideia reconcilia ranking, disco e agregados sem chamar provedor (Work 0003), e a adição anexa ideias novas ao estudo (`generateAddition`).
- A data da ideia foi gravada em coluna própria fora do `payload_json` (Work 0013); o torneio segue o mesmo padrão.

## Atores e valor

- **ACT-001 Operador/consultor (CLI):** recebe um topo de ranking que reflete uma preferência medida entre as ideias, e não um empate disfarçado.
- **ACT-003 Usuario da interface web:** vê quantos pontos cada ideia fez e em quantas partidas.

## Escopo

### Inclui

- Módulo do torneio: rodadas, emparelhamento suíço, folga com número ímpar de ideias, pontuação e ordem final.
- Pergunta `choice` de duelo ao decisor, nas duas ordens, com cache por partida.
- Etapa do torneio no pipeline, na adição de ideias e na remoção (recalculada das partidas restantes, sem chamar o decisor).
- Ordem de `summary.ordered`, das pastas, do tabelão, do CSV, do `dados.json` e da interface pela média de pontos por partida.
- Coluna `tournament_json` (nula para estudos antigos) na tabela de avaliações e partidas no resumo do estudo.
- Coluna, helper e glossário do torneio na interface e em `/como-ler`; decisor simulado determinístico para o duelo; README.

### Não inclui

- Mudar as notas absolutas, o índice de ação ou os cortes de tier.
- Mudar a pesquisa web (Work 0015) ou o documento (Work 0016).
- Torneio entre ideias de estudos diferentes.

## Cenários de usuário

### US-001 — O torneio ordena o ranking (P1)

**Ator:** operador.
**Valor independente:** o topo do ranking é a ideia que o decisor prefere nas comparações diretas.
**Verificação independente:** `bun test` com um decisor simulado que sempre prefere uma ideia conhecida.

1. **Given** 8 ideias e um decisor que escolhe sempre a ideia "Fiado Digital", **When** o torneio roda, **Then** são 4 rodadas, "Fiado Digital" fica em primeiro com média 1.0 e a pasta `01-` é a dela (FR-001, FR-004)
2. **Given** duas ideias com a mesma média de pontos, **When** o ranking é montado, **Then** fica na frente a de maior índice de ação e, persistindo o empate, a de nome menor em ordem alfabética (FR-004)

### US-002 — O viés de posição é anulado (P1)

**Ator:** operador.
**Valor independente:** a ordem em que as ideias aparecem na pergunta não decide o duelo.
**Verificação independente:** `bun test` com um decisor que sempre escolhe a opção A.

1. **Given** um decisor que escolhe sempre a primeira opção apresentada, **When** um duelo é disputado, **Then** cada ideia recebe 0.5 ponto porque o duelo foi perguntado nas duas ordens (FR-002)

### US-003 — Adição e remoção mantêm o torneio coerente (P2)

**Ator:** operador.
**Valor independente:** acrescentar ou excluir ideia reordena o estudo sem pagar de novo partidas já disputadas.
**Verificação independente:** `bun test` contando chamadas do decisor na adição e na remoção.

1. **Given** um estudo com torneio concluído, **When** o operador exclui uma ideia, **Then** as partidas dela saem, as médias das outras são recalculadas das partidas restantes e o decisor não recebe nenhuma chamada (FR-005)
2. **Given** um estudo com torneio concluído, **When** o operador acrescenta 2 ideias, **Then** o torneio roda de novo sobre todas as ideias e toda partida já gravada vem do cache (FR-005, FR-006)

### US-004 — Os pontos aparecem na tela e nos artefatos (P2)

**Ator:** usuário da interface web.
**Valor independente:** ele lê a força relativa de cada ideia com o helper do dado.
**Verificação independente:** `bun test` da página do estudo, do tabelão e do CSV.

1. **Given** um estudo concluído, **When** o usuário abre o estudo, **Then** o ranking mostra "torneio 0.75 em 4 partidas (maior é melhor)" por ideia, o termo tem entrada no glossário e o tabelão e o CSV têm a coluna `torneio` (FR-007)

## Contrato observável

- **Entradas:** as avaliações do estudo; o decisor configurado.
- **Saídas e efeitos:** pergunta ao decisor `{"duelo": {"type": "choice", "instructions": "...", "criteria": {"A": "...", "B": "..."}}}` duas vezes por partida; `tournament` com `points`, `games`, `wins`, `byes` e `score` (média por partida) em cada avaliação; `torneio` por ideia e `torneio_partidas` com `a`, `b` e `p_a` no `dados.json`; coluna `torneio` no tabelão e no CSV; pastas numeradas pela nova ordem.
- **Erros:** um duelo sem probabilidade utilizável conta 0.5 para cada lado e entra em `issues`; falha de provedor no torneio segue a política de erro do decisor e o estudo pode retomar pelo cache.

## Requisitos

### Funcionais

- **FR-001:** o torneio tem teto de log2 do número de ideias mais 1 rodadas, para 2 ou mais ideias, e cada rodada emparelha ideias de média próxima que ainda não se enfrentaram.
- **FR-002:** cada partida pergunta o duelo nas duas ordens, e a ideia X recebe a média das duas probabilidades de ser escolhida, enquanto a adversária recebe 1 menos esse valor.
- **FR-003:** com número ímpar de ideias, a ideia de pior posição que ainda não folgou recebe a folga daquela rodada, e a folga não conta como partida nem soma pontos.
- **FR-004:** `summary.ordered`, as pastas, o tabelão, o CSV, o `dados.json` e a interface seguem a média de pontos por partida, com desempate pelo índice de ação e depois pelo nome.
- **FR-005:** a remoção de ideia recalcula as médias a partir das partidas restantes sem chamar o decisor, e a adição roda o torneio de novo sobre todas as ideias.
- **FR-006:** cada pergunta de duelo usa uma chave de cache com a semente do estudo, a impressão dos provedores, os dois nomes, as duas descrições e a ordem.
- **FR-007:** a página do estudo, o glossário, `/como-ler`, o tabelão e o CSV mostram a média do torneio e o número de partidas de cada ideia.

### Qualidade e restrições

- **QR-001:** com o decisor simulado, o torneio produz a mesma ordem e os mesmos pontos para a mesma entrada.
- **QR-002:** índice de ação e tier continuam calculados só das notas, e as chaves já existentes do `dados.json` e do CSV não mudam.
- **QR-003:** estudo antigo sem torneio abre com a ordem pelo índice e a coluna do torneio vazia.
- **QR-004:** um estudo de 8 ideias faz no máximo 32 chamadas de duelo ao decisor.

## Casos de borda

- **EC-001:** estudo com uma única ideia não roda torneio e a ideia fica em primeiro sem pontos (FR-001, QR-003).
- **EC-002:** com 3 ideias, cada uma folga no máximo uma vez nas 3 rodadas (FR-001, FR-003).
- **EC-003:** quando todas as combinações livres de uma rodada já foram jogadas, o emparelhamento repete a partida de menor diferença de média em vez de travar (FR-001).
- **EC-004:** duelo cuja resposta não traz `probabilities` usa a `choice` como probabilidade 1 e, sem `choice`, conta 0.5 para cada lado com registro em `issues` (FR-002).

## Critérios de sucesso

- **SC-001:** `bun test` passa com as asserções de rodadas, viés de posição, folga, desempate, remoção sem chamada, adição pelo cache e contagem de chamadas (FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, QR-004).
- **SC-002:** `bun run cli generate "depositos de bebidas" --ideas 5 --mock` grava o tabelão e o CSV com a coluna `torneio` e as pastas na ordem do torneio (FR-004, FR-007, QR-001).
- **SC-003:** `bun run check`, `bunx eslint .` e `bunx prettier --check .` passam (QR-002, QR-003).
- **SC-004:** `pwn work gate --all --work 0017` aprovado e `.specs/system.json` reconciliada com BR-001 e BR-010 novas (FR-004, QR-002).

## Premissas

- **A-001:** o decisor configurado responde `choice` com `probabilities` por opção, como já faz na pergunta de dor.
- **A-002:** o emparelhamento suíço com teto de log2 do número de ideias mais 1 rodadas separa as ideias com custo próximo de N vezes log N chamadas.

## Componentes afetados

- `src/domain/types.ts` — tipos do torneio.
- `src/application/tournament.ts` (novo), `src/application/summary.ts`, `src/application/generate-study.ts`, `src/application/study-service.ts` — torneio, ordem, pipeline, adição e remoção.
- `src/application/reports.ts`, `src/application/artifacts.ts` — tabelão, CSV e `dados.json`.
- `src/infrastructure/decider-mock.ts` — duelo simulado determinístico.
- `src/infrastructure/schema.ts`, `src/infrastructure/repositories.ts`, `drizzle/` — coluna `tournament_json`.
- `src/infrastructure/http/api.ts`, `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/layout.tsx` — API, ranking, glossário e `/como-ler`.
- `README.md`, `.specs/system.json`, `tests/*` — documentação, reconciliação e testes.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
|---|---|---|
| `FR-001` | US-001, EC-001, EC-002, EC-003, SC-001 | teste do número de rodadas e do emparelhamento sem repetição |
| `FR-002` | US-002, EC-004, SC-001 | teste do decisor que escolhe sempre A dando 0.5 a cada lado |
| `FR-003` | EC-002, SC-001 | teste da folga única por ideia com número ímpar |
| `FR-004` | US-001, SC-002, SC-004 | teste da ordem por média com desempate por índice e nome |
| `FR-005` | US-003, SC-001 | teste da remoção sem chamada e da adição com novo torneio |
| `FR-006` | US-003, SC-001 | teste da chave de cache por par e por ordem |
| `FR-007` | US-004, SC-002 | teste da coluna torneio na página, no tabelão e no CSV |
| `QR-001` | SC-002 | teste do torneio simulado com saída determinística |
| `QR-002` | SC-003, SC-004 | teste de índice e tier inalterados e chaves antigas preservadas |
| `QR-003` | EC-001, SC-003 | teste de estudo antigo aberto com ordem por índice |
| `QR-004` | SC-001 | teste que conta no máximo 32 duelos com 8 ideias |
