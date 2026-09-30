# 0003 — Adicionar e remover ideias em um estudo existente

## Pedido

> quero que implemente a possibilidade de remoção e adição de mais ideias em um estudo. para
> remoção basta eu excluir e para adição eu apenas digo quantos mais e ele gera e refaz os rankings.
> pwn de uso obrigatorio

## Decisões do operador (2026-09-30)

1. **Adição**: entro num estudo, peço N ideias novas (ex.: 5). As ideias antigas **continuam**. As
   novas são geradas, podem ser em background. Ao final, o ranking é recalculado e a visualização é
   gerada de novo. Os **documentos das ideias novas são gerados** no mesmo fluxo.
2. **Remoção**: apagar a ideia remove também a pasta dela em disco (`NN-slug/`).
3. **Agregados**: depois de adicionar ou remover, **regerar tudo** — índice `README.md`,
   `00-tabelao.md`, `00-tabelao.csv`, `dados.json` e o HTML/PDF completo.

## Situação atual (descoberta técnica)

- `IdeaEvaluation` (`src/domain/types.ts:77`) não tem identidade: a chave é o `name`, usado como
  chave em `folders`, `documents`, `byName` e `painGroups`. Colisão de nome é silenciosa
  (`src/application/generate-study.ts:157,189`).
- O ranking é calculado em `summarizeStudy` (`src/application/summary.ts:43`, `sort` por `index`
  decrescente) e persistido como `evaluations.rank = i + 1` em `saveEvaluations`
  (`src/infrastructure/repositories.ts:280`), lido com `orderBy(asc(evaluations.rank))` (`:221`).
- `PATCH /api/studies/:id` só aceita `niche` (`src/infrastructure/http/api.ts:49,157`). `repo.update`
  **ignora** `patch.evaluations` (`src/infrastructure/repositories.ts:188-212`) — alterar ideias exige
  `saveEvaluations`, que é destrutivo (delete + insert, `:274`).
- `generateStudy` é um pipeline do zero: brief → ideias → avaliação → documentos → artefatos. Não há
  caminho incremental.
- `writeFiles` (`src/application/study-service.ts:299`) **só escreve**: após re-ranking, as pastas
  `NN-slug` trocam de nome (o rank entra no nome via `folderName`,
  `src/application/reports.ts:20`) e as antigas ficariam órfãs.
- A UI resolve a ideia por **posição no array ordenado**
  (`src/infrastructure/http/ui/routes.tsx:152-155`, rota `/studies/:id/ideas/:position`), e a tabela
  de ranking é `src/infrastructure/http/ui/pages.tsx:1210-1261`. Não há ação mutável por ideia.
- `create()` não persiste `timeout` no registro; `POST /api/studies` aceita `timeout` com teto 600
  (`api.ts:30`) e o valor é ignorado em `executeRun`. Bug adjacente, já corrigido em `e8bc007` só
  para o fallback de ambiente.

## Fora de escopo

- Streaming de tokens nas gerações longas.
- Reavaliar do zero as ideias que já têm avaliação (o cache por ideia torna isso barato, mas mudaria
  notas já vistas pelo operador).
- Arrastar ideas para reordenar manualmente.
- Tornar `vps/k3s/goodbizz/` rastreado no repo `fleet`.
