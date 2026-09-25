# goodbizz

Um prompt pequeno entra, um estudo de negocio completo sai.

Voce descreve um nicho de mercado em uma frase. A ferramenta gera ideias de produto, avalia cada uma em um **decisor System One** (modelo probabilistico que mede chances reais em vez de alucinar texto) e redige planos de negocio executivos: estrategia comercial, marketing, precificacao, analise SWOT, Business Model Canvas, 5 Forcas de Porter, matriz de risco, roadmap de implantacao e KPIs.

```
                    [ Nicho em uma frase ]
                              │
                              ▼
                   [ 1. Brief de Mercado ]
                    LLM mapeia o contexto real
                              │
                              ▼
                   [ 2. Geracao de N Ideias ]
                    LLM propoe hipoteses com mecanismos distintos
                              │
                              ▼
                [ 3. Avaliacao no Decisor System One ]
                 Jev, Laya (cloud/local) ou endpoint compativel
                 ├─ Fit de mercado (escala 0..2)
                 ├─ Facilidade de venda (escala 0..2)
                 ├─ Disrupcao (escala 0..2)
                 ├─ Natureza da dor (escolha entre 3 consequencias)
                 ├─ Viabilidade solo (probabilidade de manter 30 clientes)
                 └─ Disposicao a pagar (WTP no ticket mensal informado)
                              │
                              ▼
                   [ 4. Medicao da Dor ]
                    Ensemble de 3 parafrases + medicao de variancia
                    -> FORTE, FRACA, INDETERMINADO ou INSTAVEL
                              │
                              ▼
                   [ 5. Ranquear e Tiers ]
                    Indice de Acao = media(fit, venda) -> Tiers A, B, C
                              │
                              ▼
                   [ 6. Planos de Negocio ]
                    LLM redige plano completo de cada ideia, amarrado
                    estritamente aos numeros medidos (sem inventar dados)
                              │
                              ▼
                   [ 7. Verificacao & Entrega ]
                    Checagem estrutural + normalizacao
                    -> README.md (ranking) + 00-brief.md + tabelao (md/csv)
                       + dados.json + planos individuais + PDF executivo
```

---

## Por que um decisor System One, e nao so um LLM

Modelos de linguagem generativos convencionais (LLMs tipo ChatGPT ou Claude) sao lentos, caros e sofrem de viés de concordancia (*sycophancy*): se voce perguntar se uma ideia fraca e boa, o modelo inventara dez paragrafos justificando por que ela e excelente. Ele escreve prosa convincente, mas nao sabe quantificar probabilidade real de compra.

Um modelo **System One** (como o **Jev** da TypeSafe ou o **Laya** da Convai) e treinado especificamente para **decisao e calibracao probabilistica**:

| Tipo de Pergunta | O que o Decisor devolve | Para que serve |
|---|---|---|
| `score` | Posicao numa escala ordenada com distribuicao de probabilidade | Medir fit de mercado, facilidade de venda e grau de disrupcao |
| `choice` | A opcao vencedora e a distribuicao completa de probabilidades | Determinar a dor real do cliente (dinheiro direto, imagem ou backoffice) |
| `noul` | Probabilidade calibrada (0.00 a 1.00) de uma afirmacao | Medir disposicao a pagar no ticket informado e viabilidade de operacao solo |

Respostas chegam em milissegundos e a custo de centavos.

**A divisao de trabalho no goodbizz:**
* O **Decisor System One** e o juiz imparcial: mede probabilidades, calcula indices e ranqueia as ideias com frieza matematica.
* O **LLM** e o redator executivo: escreve o brief e os planos de negocio, mas sob um guardrail estrito: **os numeros sao fornecidos pelo codigo**, e o LLM e proibido de inventar numeros novos. Um verificador automatico confere se os valores medidos aparecem no texto final.

---

## Provedores Compativeis

O `goodbizz` e agnostico e funciona com qualquer provedor que implemente os protocolos padrao da industria:

### 1. Decisores (System One)
* **Laya Studio (Cloud)**: `https://api.laya.studio/v1/systemone` (modelos: `laya-multilingual-v1`, `laya-english-v1`)
* **Laya Local / Auto-hospedado**: execucao local via MLX, GGUF ou daemon (`convaiinnovations/laya`), em endpoints como `http://localhost:8770/api/predict` ou `http://localhost:8000/v1/systemone`
* **Jev (TypeSafe AI)**: `https://api.typesafe.ai/v1/systemone` (modelos: `jev-latest`, `typesafe/jev-1.13`)
* **Gateways e Proxies System One**: qualquer servidor compativel com o formato wire `POST /v1/systemone`
* **Modo Simulado (`--mock`)**: gerador deterministico baseado em SHA-256 integrado, 100% offline, zero chamadas de rede e zero custo, ideal para testes e demonstracao

> **Compatibilidade automatica:** o cliente HTTP do decisor normaliza URLs (adiciona `/v1/systemone` automaticamente se informada apenas a raiz), envia autenticacao dupla (`Bearer` e `x-api-key`) e tolera respostas empacotadas em `answers`, `results`, `data` ou no nivel raiz.

### 2. LLMs (Geracao de texto)
Qualquer endpoint compativel com a API da OpenAI (`POST /v1/chat/completions`):
* OpenAI (`gpt-4o-mini`, `gpt-4o`)
* DeepSeek (`deepseek-chat`)
* Groq, OpenRouter, LiteLLM, Together AI
* Servidores locais: Ollama, vLLM, LM Studio, llama.cpp

---

## Instalacao

Zero dependencias externas no Python: requer apenas **Python 3.10+ e biblioteca padrao**.
A geracao de PDF opcional usa o `chromium` do proprio sistema.

```bash
git clone git@github.com:passoz/goodbizz.git
cd goodbizz
./install.sh
```

O `install.sh` cria um link simbolico em `~/bin/goodbizz` apontando para o repositorio. O uso passa a ser `goodbizz <subcomando>` a partir de qualquer pasta:

* confere se o Python atende a versao minima (3.10+);
* avisa se `~/bin` nao estiver no seu `PATH`;
* avisa se o `chromium` esta disponivel (sem ele, sai tudo exceto o PDF);
* informa quantas credenciais `GOODBIZZ_*` estao configuradas.

Opcoes do instalador:
./install.sh --bin ~/.local/bin    # instala em outra pasta do PATH
./install.sh --uninstall           # remove o link simbolico
```

### Sem instalar
Se preferir rodar sem criar links no PATH:
```bash
python3 generate_study.py --niche "oficinas mecanicas de bairro" --mock
```

---

## Comandos

| `goodbizz generate "<niche>"` | Gera o estudo completo (alias: `gerar`) |
| `goodbizz diagnose` | Mede coerencia e estabilidade das sondas contra o seu decisor (alias: `diagnosticar`) |
| `goodbizz recalibrate` | Realiza busca em grade nos limiares contra conjunto rotulado (alias: `recalibrar`) |
| `goodbizz help` | Exibe a mensagem de ajuda e opcoes (alias: `ajuda`) |

---

## Guia de Uso

### 1. Teste rapido sem nenhuma credencial (Modo Mock)

```bash
goodbizz generate --niche "oficinas mecanicas de bairro" --ideas 5 --mock --pdf
```

O `--mock` simula o LLM e o decisor de forma deterministica. Executa em menos de 1 segundo, gera todos os arquivos, pastas, CSVs e PDF para inspecao visual da estrutura. **A saida simulada nao possui valor analitico de mercado.**

### 2. Teste do Decisor real sem gastar tokens de LLM

```bash
goodbizz generate --niche "pousadas em cidades historicas" --ideas 3 --mock-llm
```

Avalia as ideias no decisor configurado, mas gera os textos dos planos com fixtures locais. Util para validar a latencia e calibracao do seu endpoint System One sem custo de LLM.

### 3. Execucao Completa

As credenciais e endpoints podem ser passados por **variaveis de ambiente** ou por **argumentos de linha de comando**:

#### Via Variaveis de Ambiente

```bash
# LLM (OpenAI, DeepSeek, etc.)
export GOODBIZZ_LLM_URL=https://api.openai.com/v1
export GOODBIZZ_LLM_MODEL=gpt-4o-mini
export GOODBIZZ_LLM_KEY=sk-...

# Decisor — Exemplo com Laya Studio (Cloud)
export GOODBIZZ_DECISOR_URL=https://api.laya.studio/v1/systemone
export GOODBIZZ_DECISOR_MODEL=laya-multilingual-v1
export GOODBIZZ_DECISOR_KEY=lsk_live_...

# Decisor — Exemplo com Laya Local / Self-hosted (daemon/GGUF/MLX)
# export GOODBIZZ_DECISOR_URL=http://localhost:8770/api/predict
# export GOODBIZZ_DECISOR_MODEL=multilingual
# export GOODBIZZ_DECISOR_KEY=sua-chave-se-houver

# Decisor — Exemplo com Jev (TypeSafe AI)
# export GOODBIZZ_DECISOR_URL=https://api.typesafe.ai/v1/systemone
# export GOODBIZZ_DECISOR_MODEL=jev-latest
# export GOODBIZZ_DECISOR_KEY=sua-chave-typesafe

goodbizz generate --niche "clinicas odontologicas em cidade media" \
    --city "Regiao dos Lagos" --ticket 350 --ideas 8 --output estudo --pdf
```

#### Via Argumentos CLI (sem exportar variaveis)

```bash
goodbizz generate "clinicas odontologicas em cidade media" \
    --decider-url https://api.laya.studio/v1/systemone \
    --decider-model laya-multilingual-v1 \
    --decider-key lsk_live_... \
    --llm-key sk-... \
    --ticket 350 --ideas 8 --output estudo --pdf
```

---

## Opcoes do Comando `generate`

| Opcao | Padrao | Descricao |
|---|---|---|
| `--niche`, `--nicho` | — | O nicho em uma frase (obrigatorio) |
| `--city`, `--cidade` | vazio | Recorte geografico / regiao alvo |
| `--ticket` | 300 | Ticket mensal estimado, em reais, para medir a disposicao a pagar |
| `--ideas`, `--ideias` | 8 | Quantidade de ideias de produto a gerar e avaliar |
| `--output`, `--saida` | `estudo` | Pasta onde os artefatos serao salvos |
| `--ideas-file`, `--ideias-arquivo` | — | Caminho de um JSON com ideias prontas (pula a etapa de geracao do LLM) |
| `--pain-method`, `--metodo-dor` | `choice` | Metodo de medicao da dor: `choice` (3 consequencias) ou `noul` (4 sondas antigas) |
| `--eval-only`, `--so-avaliar` | — | Interrompe o fluxo apos a avaliacao e salva `dados.json` (ideal para calibracao) |
| `--decider-url`, `--decisor-url` | env | URL do endpoint System One (Jev, Laya, runtimes locais, etc.) |
| `--decider-model`, `--decisor-model` | env | Modelo do decisor (`systemone-latest`, `jev-latest`, `laya-multilingual-v1`) |
| `--decider-key`, `--decisor-key` | env | Chave de autenticacao do decisor (suporta Bearer token e x-api-key) |
| `--llm-url` | env | URL base compativel com OpenAI (padrao: `https://api.openai.com/v1`) |
| `--llm-model` | env | Modelo do LLM (padrao: `gpt-4o-mini`) |
| `--llm-key` | env | Chave de API do LLM |
| `--mock` | — | Simula tanto o LLM quanto o decisor (offline e deterministico) |
| `--mock-llm` | — | Simula apenas o LLM (usa o decisor real) |
| `--mock-decider`, `--mock-decisor` | — | Simula apenas o decisor (usa o LLM real) |
| `--pdf` | — | Compila todo o estudo em um unico arquivo PDF estruturado |
| `--concurrency`, `--paralelo` | 8 | Numero maximo de chamadas simultaneas a API (via semaforo asyncio) |
| `--timeout` | 60.0 | Tempo limite por requisicao HTTP, em segundos |
---

## O que sai no final

A pasta de saida gera uma estrutura completa de negocio:

```
estudo/
├── README.md              # Indice executivo: ranking geral, medias e grupos de dor
├── 00-brief.md            # Leitura de contexto do mercado que orientou as ideias
├── 00-tabelao.md          # Tabela comparativa com todos os indicadores por ideia
├── 00-tabelao.csv         # O mesmo tabelao pronto para importar em planilhas
├── dados.json             # Dump completo de dados brutos e confiancas para reuso
├── .cache.json            # Cache local de chamadas HTTP (evita gastar API em reexecucoes)
├── 01-<ideia-campea>/     # Pasta da ideia #1 no ranking
│   └── README.md          # Plano de negocio completo (SWOT, Canvas, Porter, Roadmap)
├── 02-<segunda-ideia>/    # Pasta da ideia #2 no ranking
│   └── README.md
├── ...
├── estudo-completo.html   # Documento HTML unificado (com --pdf)
└── estudo-completo.pdf    # PDF executivo diagramado (com --pdf e chromium instalado)
```

As pastas sao nomeadas seguindo rigorosamente a **ordem do ranking**: a pasta `01-` e sempre a mais bem avaliada, a `02-` e a segunda, e assim por diante.

---

## Indicadores e Metodologia

Cada ideia e submetida a um conjunto padronizado de perguntas no decisor:

| Indicador | Tipo | Escala | O que mede |
|---|---|---|---|
| `fit` | score | 0 a 2 | **Aderencia ao balcao:** 0 exige escala corporativa, 2 resolve a dor diaria sem exigir mudanca de habitos |
| `venda` | score | 0 a 2 | **Facilidade comercial:** 0 beneficio invisivel a curto prazo, 2 ataca perda imediata de dinheiro ou imagem |
| `disrupcao` | score | 0 a 2 | **Grau de inovacao:** 0 apenas automatiza o basico, 2 cria novo modelo operacional ou receita |
| `dor` | choice | 3 opcoes | **Natureza da dor:** dinheiro direto, reputacao/imagem ou backoffice/processo |
| `solo` | noul | 0 a 1 | **Operabilidade:** probabilidade de um consultor solo manter 30 clientes sem colapsar no suporte |
| `wtp` | noul | 0 a 1 | **Disposicao a pagar:** probabilidade de o dono pagar o ticket mensal informado |
| `meta30` | noul | 0 a 1 | **Viabilidade de meta:** viabilidade de conquistar 30 clientes pagantes na regiao em 24 meses |
| `preco` | score | 0 a 2 | **Margem de precificacao:** preco abaixo, compativel ou acima do valor percebido |

### Indice de Acao e Tiers

O **Indice de Acao** e a media aritmetica entre `fit` e `venda`:
$$\text{Indice de Acao} = \frac{\text{fit} + \text{venda}}{2}$$

Com base no indice, cada ideia e classificada em um Tier de prioridade:
* **Tier A** ($\ge 1.84$): Ideias com forte aderencia e venda natural imediata.
* **Tier B** ($\ge 1.60$): Boas ideias, mas exigem provar valor ou demandam suporte moderado.
* **Tier C** ($< 1.60$): Ideias arriscadas, de venda dificil ou dependentes de mudanca cultural profunda.

---

## Medicao da Dor: Por que Escolha de 3 Vias?

O tipo de dor e o preditor mais forte do sucesso de um SaaS/produto de servico. O `goodbizz` suporta dois metodos:

| Metodo | Funcionamento | Comportamento com Decisores Reais |
|---|---|---|
| `escolha` (**padrao**) | Pergunta de escolha entre 3 consequencias objetivas, repetida em 3 redacoes independentes | **Classificacao estavel e calibrada** |
| `noul` (legado) | 4 sondas de afirmacao direta (dinheiro, reputacao, processo, tecnologia) | Inconsistente em modelos reais (ima de falso positivo) |

### O experimento que motivou a mudanca

Durante testes com decisores reais, mediu-se o comportamento das 4 sondas binarias antigas:
1. A sonda `tecnologia` atuava como um **ima**: ela respondia "sim" para absolutamente qualquer ideia de automacao (mesmo para propostas absurdas como "uma planilha de papel"). A afirmacao e a negacao dela voltavam ambas altas (contradicao de 1.16 a 1.24 num limiar de 1.20). Como qualquer ideia de software *e* tecnologia, a pergunta "isso protege a tecnologia?" sempre pontuava maximo.
2. Isso inflava a dor interna, colocava as sondas em conflito e classificava a quase totalidade das ideias como `INSTAVEL`.
3. Ao substituir as sondas por uma pergunta de **escolha forcada entre 3 consequencias concretas para o bolso do dono** (dinheiro direto, reputacao publica ou desorganizacao interna de backoffice) e **remover a opcao 'tecnologia'**, a acuracia foi restaurada: ideias que resolvem sangria de caixa pontuam em dinheiro, avaliacoes negativas pontuam em reputacao, e tarefas burocraticas pontuam em backoffice.

---

## Recalibracao e Diagnostico para Novos Nichos

Os limiares de classificacao de dor foram ajustados sobre casos reais. Ao migrar para um nicho muito diferente ou ao testar um novo modelo de System One, use as ferramentas de apoio integradas:

```
[ diagnosticar.py ] -> Mede se o decisor responde com coerencia logica nas sondas
         │
         ▼
[ gerar_estudo --so-avaliar ] -> Coleta 20 a 30 ideias rotuladas em dados.json
         │
         ▼
[ recalibrar.py ] -> Varre a grade de limiares para zerar o erro de falso FORTE
```

### 1. Diagnostico de sondas (`diagnose.py`)

Verifica se o seu decisor responde de forma consistente antes de voce confiar nos limiares:

```bash
goodbizz diagnose --ideas exemplos.json --niche "seu nicho"
```

O script testa duas propriedades matematicas:
* **Consistencia:** pergunta a afirmacao e a negacao da mesma afirmacao. Um modelo logico devolve $P(\text{afirmacao}) + P(\text{negacao}) \approx 1.0$. Somas superiores a 1.2 indicam contradicao (o modelo diz sim para as duas).
* **Estabilidade:** avalia 3 parafrases distintas da mesma questao. Desvio padrao alto indica instabilidade textual.

### 2. Recalibracao de limiares (`recalibrate.py`)

Com uma base de 20 a 30 ideias coletadas via `goodbizz generate --eval-only`, rode a varredura em grade:

```bash
goodbizz recalibrate coleta/dados.json
```

O algoritmo busca os limiares que respeitam a ordem de prioridade executiva:
1. **Zero falso FORTE** (o erro perigoso: investir tempo e capital numa ideia que nao vende);
2. Maximizacao de acertos;
3. Minimizacao de casos que demandam escalonamento para revisao humana.

---

## Para Desenvolvedores e Engenheiros

### Arquitetura de Codigo
* **`goodbizz/decider.py`**: Cliente de protocolo System One com normalizacao de endpoint, headers duplos, retentativas com backoff exponencial e suporte a mock hash-based.
* **`goodbizz/evaluation.py`**: Orquestrador das avaliacoes por ideia, construcao de prompts tipados e agregacao de confiancas.
* **`goodbizz/pain_choice.py`**: Medicao da dor por ensemble de escolha de 3 opcoes.
* **`goodbizz/algorithm.py`**: Classificador de dor (limiares FORTE, FRACA, INDETERMINADO, INSTAVEL) e `HttpBackend` agnostico.
* **`goodbizz/generation.py`**: Templates de engenharia de prompt para brief, geracao estruturada de ideias em JSON e redacao vinculada dos planos.
* **`goodbizz/reports.py`**: Gerador deterministico de indices, tabeloes e arquivos CSV.
* **`goodbizz/render.py`**: Conversor de Markdown para HTML e gerador de PDF via Chromium headless (com flag `--disable-javascript` e sanitizacao de links para execucao segura).
* **`goodbizz/verification.py`**: Guardrail de qualidade: valida a presenca das secoes obrigatorias, checa a integridade das tabelas e garante que os numeros medidos pelo System One constam literalmente no texto do LLM.
* **`goodbizz/config.py`**: Configuracao central da ferramenta com tipagem estrita e dataclasses.

### Execucao de Autoteste

O modulo de algoritmo possui um autoteste deterministico integrado (sem necessidade de rede ou credenciais):

```bash
python3 goodbizz/algorithm.py --self-test
```

Saida esperada:
```
[ok ] forte     -> FORTE           dor=0.85 interna=0.10 margem=+0.75 desvio=0.000
[ok ] fraca     -> FRACA           dor=0.20 interna=0.70 margem=-0.50 desvio=0.000
[ok ] cinzenta  -> INDETERMINADO   dor=0.55 interna=0.40 margem=+0.15 desvio=0.000
[ok ] rejeitou 1 parafrase (guarda funcionando)
[ok ] ruidosa   -> INSTAVEL        dor=0.63 interna=0.63 margem=+0.00 desvio=0.377

SELF-TEST: PASSOU
```

---

## Sistema de Cache Inteligente

Todas as respostas brutas de APIs (tanto do LLM quanto do Decisor) sao cacheadas em `.cache.json` no diretorio de saida sob uma chave de hash SHA-256 baseada nos parametros da chamada.

* Reexecutar o mesmo estudo reaproveita 100% dos dados salvos, sem gastar novas chamadas ou tokens.
* Alterar o nicho, ticket ou descricao de uma ideia invalida seletivamente apenas a chave correspondente.
* Para forcar uma nova avaliacao completa do zero, basta remover o arquivo `.cache.json` ou apontar para outra pasta com `--saida`.

---

## Convencoes e Limites

1. **Textos sem acento:** Por convencao de projeto, todos os documentos gerados, codigo-fonte e comentarios sao mantidos sem acentuacao grafica. O verificador normaliza automaticamente o texto gerado pelo LLM.
2. **Hipoteses vs Pesquisa:** O brief e as ideias sao gerados por modelos de IA sem navegacao web em tempo real. Valores numericos de mercado sao estimativas e vem anotados com `[INFERENCE]`.
3. **Privacidade de dados:** Nunca insira informacoes pessoais, segredos comerciais ou dados sensiveis no parametro `--nicho`. O texto e transmitido para os endpoints configurados de LLM e Decisor.
