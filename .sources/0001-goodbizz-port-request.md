# Source 0001 — Pedido bruto do operador

Snapshot integral do pedido que originou o Work 0001. Este arquivo e somente leitura
normativa: a especificacao derivada vive em `.prompts/0001-change.md`.

## Texto do pedido

> porte esse app para bun com a stack bun.md aqui na raiz. nenhuma feature deve ser
> deixada pra tras. use o passoz/pwn para implementar isso. quero transformar isso num
> servico. deve se fazer uma img docker. deve ter um servico de api e um web onde o web
> consome a api. sao as mesmas funcionalidades da cli e inclusive mantenha a cli. as
> variaveis serao LLM_API_URL LLM_API_KEY DECISION_API_URL E DECISION_API_KEY. faca um
> workflow de gh para construir a imagem

## Contexto confirmado pelo operador

- O app atual esta em Python e nao faz inferencia local: toda a capacidade de IA vive em
  endpoints HTTP externos (LLM compativel com OpenAI e decisor System One).
- A stack alvo esta descrita em `bun.md` na raiz do repositorio.
- O harness de governanca `pwn` (passoz/pwn) deve ser usado para conduzir a implementacao.
- O resultado deve ser um servico: uma imagem Docker, um servico de API e um front web que
  consome essa API.
- Todas as funcionalidades da CLI atual devem ser preservadas, e a propria CLI deve
  continuar existindo.
- O contrato de ambiente passa a ser `LLM_API_URL`, `LLM_API_KEY`, `DECISION_API_URL` e
  `DECISION_API_KEY`.
- Deve existir um workflow de GitHub Actions que construa a imagem.

## Inventario do baseline Python (levantado pelo operador)

- `goodbizz/config.py` — configuracao e validacao.
- `goodbizz/llm.py` — cliente LLM HTTP e mock deterministico.
- `goodbizz/decider.py` — cliente System One HTTP e mock hash-based.
- `goodbizz/algorithm.py` — classificador de dor (4 sondas x 3 parafrases) e autoteste.
- `goodbizz/pain_choice.py` — medicao da dor por escolha forcada de 3 vias.
- `goodbizz/evaluation.py` — indicadores, indice de acao, tier, agrupamento e resumo.
- `goodbizz/generation.py` — prompts de brief, ideias e documento com guardrail numerico.
- `goodbizz/reports.py` — indice, tabelao markdown e CSV deterministicos.
- `goodbizz/render.py` — markdown para HTML e PDF via Chromium headless.
- `goodbizz/verification.py` — verificacao estrutural e normalizacao de acentos.
- `generate_study.py`, `diagnose.py`, `recalibrate.py` — os tres subcomandos da CLI.
- `bin/goodbizz` — dispatcher de subcomandos.
