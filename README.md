# bonsnegocios

Um prompt pequeno entra, um estudo de negocio completo sai.

Voce descreve um nicho em uma frase. A ferramenta gera ideias de produto, submete cada uma a
um **decisor** (modelo System One, que devolve probabilidade em vez de texto) e escreve um
plano de negocio por ideia: estrategia de venda, marketing, precificacao, SWOT, Business
Model Canvas, Porter, matriz de risco, roadmap e KPIs.

```
nicho  ->  brief  ->  ideias  ->  decisor  ->  planos  ->  md + csv + pdf
```

## Por que um decisor, e nao so um LLM

Um LLM escreve texto. Ele nao sabe *quanto* uma ideia e boa nem *qual a chance* de o dono
pagar por ela. Um decisor System One responde perguntas tipadas e devolve numero:

| Pergunta | O que volta |
|---|---|
| `score` | posicao em uma escala que voce define, com distribuicao de probabilidade |
| `choice` | uma opcao de um conjunto fechado, com a probabilidade de cada uma |
| `noul` | probabilidade de "sim" para uma afirmacao |

Medido em milissegundos e custo de centavos. E o que permite ranquear 10 ideias em vez de
achar 10 ideias.

## Instalacao

Nao tem. Python 3.10+ e biblioteca padrao. PDF opcional usa o `chromium` do sistema.

```bash
git clone git@github.com:passoz/bonsnegocios.git
cd bonsnegocios
```

## Uso

### Sem credencial nenhuma

```bash
python3 gerar_estudo.py --nicho "oficinas mecanicas de bairro" --ideias 5 --mock --pdf
```

O `--mock` troca o LLM e o decisor por versoes deterministicas. Serve para ver o formato
final e para validar alteracoes no codigo. **A saida nao tem valor analitico.**

### Com decisor real e LLM simulado

```bash
python3 gerar_estudo.py --nicho "..." --ideias 5 --mock-llm --pdf
```

Util para validar a integracao com o decisor sem gastar token de LLM.

### Completo

```bash
export NICHO_LLM_URL=https://api.exemplo.com/v1
export NICHO_LLM_MODEL=modelo-x
export NICHO_LLM_KEY=...

export NICHO_DECISOR_URL=http://seu-decisor/api/predict
export NICHO_DECISOR_KEY=...
export NICHO_DECISOR_MODEL=multilingual

python3 gerar_estudo.py --nicho "clinicas odontologicas em cidade media" \
    --cidade "Regiao dos Lagos" --ticket 350 --ideias 8 --saida estudo --pdf
```

### Opcoes

| Opcao | Padrao | Para que serve |
|---|---|---|
| `--nicho` | — | o nicho, em uma frase (obrigatorio) |
| `--cidade` | vazio | recorte geografico |
| `--ticket` | 300 | ticket mensal, em reais, usado para medir disposicao a pagar |
| `--ideias` | 8 | quantas ideias gerar |
| `--saida` | `estudo` | pasta de saida |
| `--mock` | — | simula LLM e decisor |
| `--mock-llm` | — | simula so o LLM |
| `--mock-decisor` | — | simula so o decisor |
| `--pdf` | — | gera tambem um PDF unico |
| `--paralelo` | 8 | chamadas simultaneas |
| `--timeout` | 60 | timeout por chamada, em segundos |

## O que sai

```
estudo/
├── README.md            ranking, medias e grupos de dor
├── 00-brief.md          leitura de mercado que orientou as ideias
├── 00-tabelao.md        todos os indicadores em uma tabela
├── 00-tabelao.csv       o mesmo, para planilha
├── dados.json           tudo, para reprocessar sem chamar API
├── 01-<ideia>/README.md plano completo da ideia melhor colocada
├── 02-<ideia>/README.md ...
└── estudo-completo.pdf  so com --pdf
```

As pastas seguem a **ordem do ranking**: o numero da pasta e a posicao no indice sao sempre
o mesmo.

## Como funciona, por dentro

| Etapa | Modulo | O que faz |
|---|---|---|
| 1. brief | `nicho/geracao.py` | LLM escreve o contexto de mercado |
| 2. ideias | `nicho/geracao.py` | LLM propoe N ideias em JSON, com mecanismos distintos |
| 3. avaliacao | `nicho/avaliacao.py` | decisor responde 8 perguntas por ideia |
| 4. dor | `nicho/algoritmo.py` | 4 sondas x 3 parafrases, limiar seguro e escalonamento |
| 5. planos | `nicho/geracao.py` | LLM escreve o plano, usando so os numeros medidos |
| 6. verificacao | `nicho/verificacao.py` | checa secoes, acentos, tabelas e presenca dos numeros |
| saida | `nicho/relatorios.py`, `nicho/render.py` | indice, tabelao, CSV, JSON, PDF |

**A regra que atravessa tudo:** os numeros sao calculados pelo codigo. O LLM escreve a prosa
em volta deles e nao tem permissao de inventar numero novo. O verificador confere que os
valores medidos aparecem no texto final.

### Os indicadores

| Indicador | Escala | O que significa |
|---|---|---|
| `fit` | 0 a 2 | aderencia ao mercado: 0 exige escala corporativa, 2 resolve o caos sem mudar habito |
| `venda` | 0 a 2 | 0 beneficio invisivel, 2 ataca perda de dinheiro ou reputacao imediata |
| `disrupcao` | 0 a 2 | 0 so automatiza o existente, 2 muda o modelo de operacao |
| `dor` | escolha | dinheiro direto, reputacao, backoffice ou tecnologia |
| `solo` | 0 a 1 | viabilidade de operar 30 clientes sozinho |
| `dor verificada` | rotulo | FORTE, FRACA, INDETERMINADO ou INSTAVEL |
| `wtp` | 0 a 1 | probabilidade de o dono pagar o ticket informado |

O **Indice de Acao** e a media de `fit` e `venda`. Todo indicador vem com **confianca**:
confianca baixa significa que o modelo viu ambiguidade real na ideia, nao que o valor esteja
errado.

## Recalibrar para um nicho novo

As 4 sondas sao genericas, mas os **limiares foram ajustados sobre 17 ideias do nicho de
turismo**. O que faz o dono comprar varia por nicho. Usar o limiar de outro nicho produz o
sintoma classico: quase tudo sai `INSTAVEL` ou `INDETERMINADO`, porque as sondas divergem
mais entre parafrases do que os limiares esperam.

### O procedimento

**1. Colete um conjunto rotulado** (ideal: 20 a 30 ideias). Nao precisa de LLM para gerar
texto, so da descricao de cada ideia:

```bash
# ideias.json aceita [{"nome": "...", "descricao": "..."}] ou ["descricao 1", ...]
python3 gerar_estudo.py "seu nicho" --ideias-arquivo ideias.json \
    --so-avaliar --saida coleta --mock-llm
```

`--so-avaliar` para depois da avaliacao (nao escreve os planos). Cada ideia recebe as 12
chamadas do algoritmo, e `coleta/dados.json` guarda as sondas cruas por parafrase.

**2. Rode a varredura:**

```bash
python3 recalibrar.py coleta/dados.json
```

O rotulo e o indicador `venda` do proprio decisor: o classificador existe para **prever** a
facilidade de venda. Ideias com `venda` perto do corte ficam numa zona morta e sao ignoradas,
porque nelas nem o decisor se decidiu.

A varredura imprime a tabela de combinacoes e recomenda a melhor. A ordem de prioridade e
deliberada:

1. **zero erro perigoso** (falso FORTE: mandar atacar uma ideia que nao vende);
2. mais acertos;
3. menos escalonamento.

O resultado e conservador de proposito: prefere dizer "revise a mao" a arriscar um veredito
errado na direcao que custa dinheiro.

**3. Aplique e registre a regressao.** Cole as constantes em `nicho/algoritmo.py`:

```python
LIMIAR_FORTE = 0.65      # ajustado para <nicho>, <data>
LIMIAR_FRACA = 0.50
LIMIAR_INSTAVEL = 0.15
```

E **guarde o conjunto de dados**: ele e o teste que impede a calibracao de regredir na
proxima mudanca de sonda. Sem isso, a proxima alteracao no algoritmo vira chute.

### O que a recalibracao nao resolve

Se nenhuma combinacao zera o falso FORTE, o problema nao e o limiar: as 4 sondas nao separam
esse nicho. O caminho entao e outro — acrescentar uma sonda especifica do nicho (ex.: "o
cliente final nota a diferenca?" para servicos de balcao) em vez de continuar girando numeros.

## Cache

Toda resposta crua vai para `.cache.json` na pasta de saida. Reexecutar o mesmo comando nao
gasta API de novo. Apagar o arquivo forca tudo de novo. Trocar nicho, ticket ou numero de
ideias invalida a chave correspondente.

## Limites

1. **Gera hipoteses, nao pesquisa de mercado.** O brief vem de um LLM, sem busca na web nem
   dado oficial. Numeros de mercado inventados devem estar marcados `[INFERENCE]` — e sao
   exatamente os que voce precisa conferir antes de usar com cliente.
2. **Os indicadores sao julgamento de um modelo**, com ruido entre execucoes. Servem para
   ordenar e para expor pontos fracos, nao para decidir sozinhos.
3. **Os limiares do algoritmo foram calibrados sobre 17 casos de um nicho so.** Trocando de
   nicho, revalide antes de confiar no rotulo de dor. Ver `nicho/algoritmo.py`.
4. **O decisor precisa responder em portugues.** Confira o roteamento do modelo: se o seu
   servico mandar texto latino para um modelo treinado so em ingles, a acuracia cai. O
   parametro `--model` do decisor existe para isso.
5. **Nao coloque dado pessoal no `--nicho`.** Ele vai inteiro para o LLM e para o decisor.

## Convencao

Os documentos gerados saem **sem acento**, seguindo a convencao do projeto onde esta
ferramenta nasceu. O codigo e os comentarios seguem a mesma regra.

## Procedencia

`nicho/algoritmo.py` e vendorizado de `evolucsia/strategy/algoritmo_teste_dor.py`, onde foi
calibrado e validado contra 17 casos reais. Este repo mantem a propria copia para nao
depender de outro repositorio; se a calibracao mudar, atualize aqui de proposito.
