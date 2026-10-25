# Snapshot da origem — plano de melhoria (Work 0014 em diante)

Capturado em 2026-10-25, a partir do pedido do operador e do estado observado no
repositório (commit `01fa7c1`, `main` limpo e igual a `origin/main`).

## Pedido do operador (verbatim)

> analise ../goodbizz/
>
> escreva um plano de melhoria entao respeitando as diretivas do projeto

## Diretivas que o plano respeita

- **Regra de ingresso** (`bun.md`, seção Governança): toda mudança no repositório entra como
  `.prompts/NNNN-change.md`, passa por `pwn work specify` contra `.specs/system.json` e só executa
  por `pwn work run`. Ajuste trivial não é exceção.
- **`evolution_policy`** da `.specs/system.json`: todo Work tem contrato V4 congelado e evidência
  RED/GREEN; CON-006 só muda com migração explícita e leitura compatível; segredo nunca entra no
  repositório.
- **Convenções do `README.md`**: português do Brasil acentuado (ASCII só em identificador); Drizzle
  sem SQL cru; `domain` não importa `application` nem `infrastructure`; nenhuma inferência local.
- **Doze Leis do operador**, usadas como filtro de decisão: Gall (o sistema cresce do simples que
  funciona), Goodhart (gate e cobertura são higiene, não objetivo), Chesterton (entender a cerca
  antes de tirar), Pareto (atacar os 20% que importam), Parkinson (prazo curto encolhe a tarefa),
  Hick-Hyman (poucas opções por decisão).

## Estado observado

| Item | Evidência |
| --- | --- |
| Typecheck | `bunx tsc --noEmit` sem erro |
| Testes | `bun test`: 418 pass, 0 fail, 36 arquivos, 4,65 s |
| Governança | `pwn validate`: 26/26 válidos; `pwn work reconcile --dry-run`: nada a conciliar |
| Tamanho | `src/` 11.743 linhas; `tests/` 8.333 linhas; `pages.tsx` 1.955 e `layout.tsx` 1.114 linhas |
| Uso real | `app.db` tem 6 estudos, todos `mock=1`, cidade `X`, nomes de teste de UI (`nojs delete`, `card stale`, `Lista Card Teste`); `estudo/` tem os mesmos 6 |
| Atividade | último commit `01fa7c1` em 2026-10-03; os Works 0005 a 0013 trataram UI, CSRF e configuração |

## Achados

1. **A spec parou no Work 0002.** `.specs/system.json` está na versão 1, com `last_reconciled`
   2026-09-29. O último commit que toca a spec é `6788303` (Work 0002). Os prompts 0004 a 0013
   declaram "Reconciliação esperada após implementação", e nenhum Work aplicou. Contradições
   vigentes:
   - BR-013 e SQR-003 exigem texto gerado sem acento. O código gera português acentuado
     (`src/application/generate-study.ts:409`); o NFD só sobrou no slug de pasta
     (`src/application/reports.ts:10`).
   - BR-015 e CAP-011 descrevem a chave de cache como hash dos parâmetros. O código usa a semente
     do estudo, a impressão dos provedores efetivos e o hash (`src/application/cache.ts:11`,
     `src/application/study-service.ts:159`, `src/config/providers.ts:47`).
   - CON-002 e CON-003 não descrevem `description`, o limite de 50 caracteres, a exclusão e a
     adição de ideias, o catálogo de provedores em `/settings`, nem `usage` e `cost`.
   - A tabela `settings` não tem entidade na spec.

   Consequência: todo `pwn work specify` novo valida contra uma baseline que contradiz o código.

2. **Defeito na CLI: `--timeout` ignora `GOODBIZZ_LLM_TIMEOUT`.** `src/cli.ts:369` chama
   `parseFloatFlag(values, "timeout", 60)`. O literal `60` impede o fallback de
   `src/config/runtime.ts:101` (`overrides.timeout ?? env.GOODBIZZ_LLM_TIMEOUT`). A ajuda da CLI
   (`src/cli.ts:232`) e o README prometem 300 s. É o mesmo defeito que o commit `e8bc007` corrigiu
   no serviço (comentário em `src/application/study-service.ts:176`). Efeito: na CLI, cada chamada
   corta em 60 s, e o README registra que 60 s cortava os documentos longos.

3. **Premissas do plano de renda fixas no código e incoerentes entre si.**
   - O decisor pergunta por "consultor solo", "30 clientes" e "24 meses"
     (`src/application/evaluate.ts:83`, `:99`). "Balcão" e WhatsApp estão fixos em
     `src/application/evaluate.ts:63` e `src/config/runtime.ts:127`.
   - O texto do plano diz que a base é de 10 a 15 clientes e que 30 é cenário otimista
     (`src/application/generation.ts:135`, `src/application/reports.ts:32`,
     `src/infrastructure/http/ui/pages.tsx:341`). O decisor mede a chance de uma meta que o próprio
     plano não usa como base.
   - Só `city` e `monthlyTicket` são parâmetros do estudo.

4. **Afirmação de método acima da evidência.** O `README.md` (linha 8) chama o decisor de "modelo
   probabilístico que mede chances reais em vez de alucinar texto". O decisor é um endpoint de
   modelo (motor `jev` do 9router). A probabilidade serve para ordenar ideias do mesmo estudo; ela
   não é chance de mercado. Os limiares de dor do método `noul` vêm de 17 casos
   (`src/domain/pain.ts:5`), e o contexto padrão do autoteste é hospedagem (`src/domain/pain.ts:58`)
   [INFERENCE: a calibração usou pousadas]. A origem dos cortes de tier 1.84 e 1.60 (BR-004) não
   está registrada no repositório.

5. **Consumo somado no processo.** Dois estudos simultâneos trocam o consumo entre si. A limitação
   está documentada no README ("Consumo e custo estimado").

6. **UI concentrada** em dois arquivos com 3.069 linhas no total.

7. **Baseline Python** mantido como referência de paridade (`goodbizz/*.py`, `generate_study.py`,
   `diagnose.py`, `recalibrate.py`, `install.sh`), conforme a convenção 5 do README.

8. **Arquivos locais fora do git** (ignorados): `omp-session-2026-09-29T18-09-25-841Z_*.html`
   (16,3 MB), `__pycache__/` e `nicho/__pycache__/` (o pacote `nicho` não existe mais).

## Plano

Princípio: a ferramenta só ganha funcionalidade nova depois de provar valor em uso real. O número de
testes e os gates não medem esse valor (Goodhart). Correção de defeito e reconciliação de spec não
dependem do uso real.

### Fase 0 — Uso real (sem código, sem Work; prazo de 1 semana)

Esta fase é operação. Ela não muda o repositório e por isso fica fora do `pwn`.

1. Configure o LLM e o decisor reais em `/settings`.
2. Exclua os 6 estudos de teste pela interface.
3. Rode 3 estudos reais pela interface web, com nichos da trilha de renda em Cabo Frio: pousada,
   clínica e imobiliária. Use 5 ideias e o ticket que o operador cobraria (R$ 300 a 400).
   Na CLI, passe `--timeout 300` até o Work que corrige o achado 2.
4. Rode `diagnose` uma vez para medir a estabilidade das sondas.
5. Para cada estudo, registre o custo (`usage` e `cost`), o tempo total, a distribuição de tiers e
   uma resposta sim ou não: "o estudo mudou o que eu faço na prospecção?".
6. Grave o resultado em `.sources/0006-uso-real.md`. Esse arquivo vira a origem dos Works da Fase 2.

Decisão no fim da Fase 0:

- Se nenhum dos 3 estudos mudou uma decisão, congele o GoodBizz. Feche só os Works da Fase 1.
- Se 1 ou mais estudos mudaram uma decisão, abra a Fase 2 com os defeitos que o uso mostrou, em
  ordem de impacto.

### Fase 1 — Works independentes do uso real

Cada Work abre só depois que o anterior fecha. Assim, cada prompt valida contra a spec corrente.

1. **Work 0014 — reconciliar a system spec.** Prompt em `.prompts/0014-change.md`. Só governança:
   nenhum arquivo de `src/` muda. Vem primeiro porque todo Work seguinte valida contra a spec
   (Chesterton). Tem valor mesmo se a Fase 0 congelar o projeto.
2. **Work seguinte — `--timeout` da CLI respeita `GOODBIZZ_LLM_TIMEOUT`** (achado 2). Remove o
   literal de `src/cli.ts:369` e cobre o caso com um teste que falha antes da correção.

### Fase 2 — Premissas do estudo explícitas (só se a Fase 0 aprovar)

- A meta de clientes e o horizonte viram parâmetros do estudo. O padrão fica igual ao valor de hoje
  (30 clientes, 24 meses), para manter o cache e a comparação com estudos antigos.
- A pergunta `meta30` passa a medir a meta informada. O texto "10 a 15 clientes" deixa de ser fixo
  e passa a sair do parâmetro.
- A chave `meta30` de `dados.json` e do CSV fica como está: CON-006 só muda com migração, e o
  `recalibrate` lê essa chave. O Work decide se a interface mostra um rótulo derivado.
- O README troca "mede chances reais" por um texto que a evidência sustenta (achado 4).
- Fora deste Work: taxa de setup, cálculo de receita e indicador novo.
- A ordem desta fase muda se a Fase 0 mostrar um defeito de impacto maior.

### Fase 3 — Itens com gatilho

| Item | Gatilho | Forma |
| --- | --- | --- |
| Consumo por execução em vez de contador do processo (achado 5) | o operador roda 2 estudos ao mesmo tempo e precisa do custo de cada um | Work próprio |
| Dividir `pages.tsx` e `layout.tsx` (achado 6) | o próximo Work que mexer nessas telas | task dentro desse Work, nunca Work isolado |
| Recalibrar limiares (achado 4) | 10 estudos reais com `dados.json` | `recalibrate` existente; mudança de limiar só com evidência (BR-009) e Work próprio |
| Aposentar o baseline Python (achado 7) | decisão do operador, depois que o Work 0014 registrar a paridade | Work próprio |
| Limpar os arquivos locais (achado 8) | quando o operador quiser | apagar à mão; não gera commit |

### Fora do plano

- Funcionalidade nova de interface (tema, glossário, layout) antes da Fase 0.
- Lista de prospecção ou raspagem do Google Maps dentro do GoodBizz.
- Autenticação multiusuário.

### Regras para todo Work do plano

- Ingresso por `.prompts/NNNN-change.md` e
  `pwn work specify .prompts/NNNN-change.md .specs/system.json`; execução por `pwn work run`.
- Aceite: `bun test`, `bun run check`, `bunx eslint .`, `bunx prettier --check .` e
  `pwn work gate --all --work NNNN`.
- A partir do Work 0014, cada Work aplica a própria reconciliação da spec antes de fechar. A dívida
  do achado 1 não volta a acumular.
