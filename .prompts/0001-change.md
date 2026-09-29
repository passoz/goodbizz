# PROMPT: Port do goodbizz para Bun com servico de API, web, CLI e imagem Docker

**Status:** Pronto para planejamento
**Work ID:** 0001
**Origem:** `.sources/0001-goodbizz-port-request.md`
**System spec:** `.specs/system.json`
**Baseline:** system spec versao 1, status "Baseline parcial" (2026-09-29)

## Delta da system spec

- **Capacidades afetadas:** CAP-001, CAP-002, CAP-003, CAP-004, CAP-005, CAP-006, CAP-007, CAP-008, CAP-009, CAP-010, CAP-011, CAP-012, CAP-013, CAP-014, CAP-015, CAP-016, CAP-017.
- **Regras preservadas:** BR-001, BR-002, BR-003, BR-004, BR-005, BR-006, BR-007, BR-008, BR-009, BR-010, BR-011, BR-012, BR-013, BR-014, BR-015, BR-016, BR-019, BR-020, BR-023.
- **Regras alteradas:** BR-017 e BR-018 passam a existir como contrato de API e de interface web; BR-021 e BR-022 entram como regras novas de separacao de sub-app e de cookie de sessao.
- **Contratos afetados:** CON-001, CON-002, CON-003, CON-004, CON-005, CON-006 — CON-002 e CON-003 sao novos.
- **Qualidades, entidades e integrações relacionadas:** SQR-001, SQR-002, SQR-003, SQR-004, SQR-005, ENT-001, ENT-002, ENT-003, ENT-004, INT-001, INT-002, INT-003, INT-004.
- **Gaps tocados:** GAP-001 e GAP-002.
- **Reconciliação esperada após implementação:** atualizar CAP-013, CAP-014, CAP-015 e CAP-017 de Parcial para Confirmado; resolver GAP-001 com evidencia de servico, persistencia e interface web; resolver GAP-002 reescrevendo a documentacao para o contrato LLM_API_URL, LLM_API_KEY, DECISION_API_URL e DECISION_API_KEY.

## Problema e resultado

**Problema:** o goodbizz existe apenas como biblioteca Python acoplada a tres scripts de CLI; nao ha servico, nao ha persistencia e nao ha interface web, o que impede usa-lo como produto para mais de um operador e impossibilita integra-lo por HTTP.

**Resultado esperado:** um runtime Bun unico que entrega CLI, API HTTP e interface web sobre a mesma logica de estudo, com persistencia SQLite, imagem Docker publicavel e workflow de build, preservando integralmente numeros, formatos de artefato e o guardrail numerico do baseline Python.

## Contexto confirmado

- O baseline nao faz inferencia local: LLM e decisor System One sao endpoints HTTP externos.
- A metodologia de dor tem dois metodos: escolha forcada de 3 vias (padrao) e as 4 sondas legadas com ensemble de 3 parafrases.
- Os artefatos em disco sao parte do produto: indices markdown, tabelao markdown e CSV, dados.json e planos por ideia.
- O `dados.json` gerado alimenta a recalibracao de limiares, portanto seu esquema de chaves precisa ser preservado.
- A stack alvo esta fixada em `bun.md`: Bun 1.4, Hono, Drizzle sobre bun:sqlite, Zod, @t3-oss/env-core, pino e hono/jsx.

## Atores e valor

- **ACT-001 Operador/consultor (CLI):** mantem o fluxo atual de gerar estudo, diagnosticar sondas e recalibrar limiares sem mudar de ferramenta.
- **ACT-002 Cliente da API HTTP:** cria estudos e le resultados por HTTP para integrar a geracao em outros sistemas.
- **ACT-003 Usuario da interface web:** acompanha e le estudos pelo navegador, incluindo o ranking e os planos completos.
- **ACT-004 Provedor LLM externo:** escreve brief, ideias e planos sob o guardrail numerico.
- **ACT-005 Provedor Decisor System One externo:** responde as perguntas tipadas que produzem os indicadores.

## Escopo

### Inclui

- Biblioteca TypeScript com toda a logica do baseline: LLM, decisor, algoritmo de dor, escolha de dor, avaliacao, geracao, relatorios, render e verificacao.
- Modos mock deterministicos equivalentes a `--mock`, `--mock-llm` e `--mock-decider`.
- CLI com os subcomandos generate, diagnose, recalibrate e serve, com as flags e aliases do baseline.
- API HTTP sob `/api` para criar, listar, detalhar e baixar artefatos de estudos, alem de diagnosticar sondas e recalibrar limiares.
- Interface web renderizada no servidor que consome a propria API.
- Persistencia de estudos e avaliacoes em SQLite via Drizzle.
- Cache de respostas de API por chave hash de parametros.
- Dockerfile multi-stage com imagem publicavel, healthcheck e readiness.
- Workflow de GitHub Actions que constroi e publica a imagem.

### Não inclui

- Inferencia local de modelos: nenhum peso, runtime de modelo ou biblioteca de aprendizado entra na imagem.
- Autenticacao multiusuario e multitenancy: a API e a web ficam para uso em rede confiavel ou atras de proxy autenticado.
- Substituicao do Chromium por outra engine de PDF: o PDF continua opcional e depende do binario do sistema.
- Reprocessamento historico de estudos gerados pelo baseline Python.

## Cenários de usuário

### US-001 — Operador gera um estudo completo sem credenciais (P1)

**Ator:** operador na linha de comando.
**Valor independente:** permite validar a instalacao e o pipeline inteiro sem gastar tokens.
**Verificação independente:** a pasta de saida contem README.md, 00-brief.md, 00-tabelao.md, 00-tabelao.csv e dados.json.

1. **Given** o runtime Bun instalado e nenhuma credencial configurada, **When** o operador executa a CLI com o modo mock e cinco ideias, **Then** a CLI gera a arvore completa de artefatos e termina com exit code zero (FR-001)

### US-002 — Cliente cria um estudo pela API (P1)

**Ator:** cliente HTTP.
**Valor independente:** permite integrar a geracao de estudos em outro produto.
**Verificação independente:** a resposta de criacao devolve um identificador e o estudo aparece na listagem.

1. **Given** a API em execucao em modo mock, **When** o cliente envia um nicho e a quantidade de ideias, **Then** a API responde com identificador e estado, e a consulta posterior mostra as avaliacoes ordenadas (FR-004)

### US-003 — Usuario le o ranking e os planos no navegador (P2)

**Ator:** usuario da interface web.
**Valor independente:** torna o resultado consumivel sem terminal.
**Verificação independente:** a pagina de detalhe mostra a tabela de ranking e o plano da primeira ideia.

1. **Given** um estudo concluido, **When** o usuario abre a pagina de detalhe, **Then** o HTML traz a tabela de ranking, as medias e o plano da ideia de maior indice (FR-005)

### US-004 — Operador confia nas sondas antes de recalibrar (P2)

**Ator:** operador na linha de comando.
**Valor independente:** evita recalibrar limiares sobre sinal ruidoso.
**Verificação independente:** o relatorio por sonda traz media, desvio e contradicao e um veredito por sonda.

1. **Given** um arquivo com ideias de exemplo, **When** o operador executa o diagnostico, **Then** o relatorio classifica cada sonda como util, contraditoria ou instavel e o exit code reflete a quantidade de sondas uteis (FR-006)

## Contrato observável

- **Entradas:** nicho, cidade, ticket mensal, quantidade de ideias, arquivo de ideias, metodo de dor, modo mock, indicador de PDF, concorrencia, timeout e endpoints e chaves por ambiente ou flag.
- **Saídas e efeitos:** artefatos em disco (README.md, 00-brief.md, 00-tabelao.md, 00-tabelao.csv, dados.json, pastas numeradas por ideia, HTML e PDF opcionais); respostas JSON da API; paginas HTML da interface web; linhas persistidas de estudo e avaliacao.
- **Erros:** erro de configuracao retorna exit 2 na CLI e aborta o startup do servico; payload invalido na API retorna 422; estudo inexistente retorna 404; origem ou token CSRF invalido retorna 403; interrupcao por teclado retorna 130.

## Requisitos

### Funcionais

- **FR-001:** a CLI aceita os subcomandos generate, diagnose, recalibrate e serve com as flags e aliases do baseline Python.
- **FR-002:** o modo mock produz saida deterministica sem qualquer chamada de rede.
- **FR-003:** a avaliacao de cada ideia consulta o decisor e produz indicadores, indice de acao e tier conforme os limiares do baseline.
- **FR-004:** a API expoe criacao, listagem, detalhe e download de artefatos de estudos sob o prefixo /api.
- **FR-005:** a interface web renderiza lista, formulario e detalhe de estudo consumindo a propria API.
- **FR-006:** o diagnostico reporta media, desvio e contradicao por sonda e o exit code reflete as sondas uteis.
- **FR-007:** a recalibracao recebe um dados.json do baseline e devolve a grade ordenada por falso positivo, acerto e escalonamento.
- **FR-008:** o guardrail numerico verifica secoes obrigatorias, acentos, alinhamento de tabela e presenca dos numeros medidos.
- **FR-009:** o estudo persiste em SQLite e permanece consultavel apos reinicio do processo.
- **FR-010:** o cache por chave hash evita repetir chamadas pagas em reexecucao do mesmo estudo.
- **FR-011:** a imagem Docker executa o servico e expoe liveness e readiness distintos.
- **FR-012:** o workflow de GitHub Actions constroi e publica a imagem.
- **FR-013:** os prompts de brief, ideias e documento incluem o bloco de dados medidos que proibe o modelo de inventar numeros de mercado.
- **FR-014:** os relatorios deterministas produzem indice, tabelao markdown e CSV ordenados pelo indice de acao.
- **FR-015:** o renderizador converte markdown em HTML sanitizado e compila o estudo em um HTML unico com PDF opcional.
- **FR-016:** a medicao da dor usa escolha forcada entre dinheiro direto, reputacao e backoffice sem a opcao tecnologia.
- **FR-017:** a classificacao de dor roda quatro sondas em tres parafrases e aplica os limiares calibrados de forte, fraca, indeterminado e instavel.
- **FR-018:** o pipeline completo executa brief, ideias, avaliacao, documentos, relatorios e PDF opcional em modo mock ou real.
- **FR-019:** cada ideia e avaliada em indicadores e negocio, produzindo indice de acao, tier e resumo agregado por natureza da dor.
- **FR-020:** os artefatos do estudo sao gravados em disco no formato do baseline, incluindo um dados.json compativel com a recalibracao.

### Qualidade e restrições

- **QR-001:** o servico valida a configuracao no startup e termina com codigo diferente de zero quando uma chave obrigatoria falta.
- **QR-002:** nenhum segredo, chave ou token aparece em log, resposta HTTP ou artefato.
- **QR-003:** toda rota de interface que muda estado exige mesma origem e token CSRF comparado em tempo constante.
- **QR-004:** o esquema de chaves do dados.json permanece compativel com o consumo pela recalibracao.
- **QR-005:** o codigo segue a arquitetura limpa da stack, com domain sem importar infraestrutura.
- **QR-006:** a toolchain da stack fica instalada com typecheck estrito, lint, format e execucao de testes em comandos unicos.

## Casos de borda

- **EC-001:** quando o endpoint do decisor responde 401, o processo aborta sem retentativa e com mensagem que identifica o provedor (FR-003).
- **EC-002:** quando o LLM devolve JSON cercado por texto ou cerca de codigo, a extracao recupera o array de ideias (FR-003).
- **EC-003:** quando o documento gerado traz acentos, a normalizacao remove os diacriticos antes de gravar (FR-008).
- **EC-004:** quando o cache esta ausente ou corrompido, o estudo prossegue tratando o cache como vazio (FR-010).
- **EC-005:** quando o Chromium nao esta instalado, o HTML permanece e a mensagem explica a ausencia sem falhar o estudo (FR-001).

## Critérios de sucesso

- **SC-001:** a suite de testes passa com exit code zero e sem rede (FR-002).
- **SC-002:** um estudo em modo mock produz os seis artefatos deterministicos esperados e um plano por ideia (FR-001).
- **SC-003:** a API em modo mock cria um estudo e o detalhe retorna as avaliacoes ordenadas por indice (FR-004).
- **SC-004:** a imagem Docker sobe e responde em liveness com status ok (FR-011).

## Premissas

- **A-001:** o operador tem Docker e o runtime Bun 1.4 disponiveis no ambiente de build.
- **A-002:** os provedores externos implementam o protocolo System One e a API de chat completions.

## Componentes afetados

- `src/domain` e `src/application` — logica de estudo portada do baseline.
- `src/infrastructure` — adapters de LLM, decisor, persistencia e HTTP.
- `src/cli.ts` e `src/index.ts` — pontos de entrada da CLI e do servico.
- `tests/` — suite de testes deterministica.
- `Dockerfile`, `.github/workflows/` — empacotamento e pipeline.
- `README.md` — documentacao reescrita para o runtime Bun e o novo contrato de ambiente.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
| `FR-001` | US-001, SC-002 | execucao da CLI em modo mock gravando a arvore de artefatos |
| `FR-002` | US-001, SC-001 | teste da suite inteira sem rede com adapters mock |
| `FR-003` | US-002, EC-001 | teste de avaliacao contra decisor stub com probabilidades fixas |
| `FR-004` | US-002, SC-003 | teste de integracao da API criando e lendo estudo |
| `FR-005` | US-003 | teste de render das paginas de lista, formulario e detalhe |
| `FR-006` | US-004 | teste do diagnostico com backend stub deterministico |
| `FR-007` | US-004 | teste da recalibracao sobre dados.json sintetico rotulado |
| `FR-008` | EC-003 | teste do verificador com documento com acento e tabela desalinhada |
| `FR-009` | US-002 | teste de repositorio SQLite em memoria com ida e volta |
| `FR-010` | EC-004 | teste do cache reaproveitando chaves e ignorando cache corrompido |
| `FR-011` | EC-005, SC-004 | construcao da imagem e consulta ao endpoint de liveness |
| `FR-012` | SC-004 | execucao do workflow de build publicando a imagem |
| `QR-001` | SC-001 | teste de startup com chave obrigatoria ausente abortando com erro |
| `QR-002` | SC-003 | inspecao de resposta HTTP e log sem chave ou token |
| `QR-003` | SC-003 | teste de requisicao sem token CSRF recusada com 403 |
| `QR-004` | SC-002 | leitura do dados.json gerado pelo modulo de recalibracao |
| `QR-005` | SC-001 | execucao do typecheck estrito e do lint sem erro |
| `FR-013` | US-001, EC-002 | geracao do bloco de dados medidos com todos os numeros do estudo |
| `FR-014` | US-001, SC-002 | comparacao byte a byte do indice e do CSV entre duas execucoes mock |
| `FR-015` | US-003, EC-005 | renderizacao do HTML do estudo e mensagem de ausencia do Chromium |
| `FR-016` | US-002 | medicao de escolha forcada com backend stub somando uma unidade por opcao |
| `FR-017` | US-004 | classificacao das quatro sondas em forte, fraca, cinzenta e ruidosa |
| `FR-018` | US-001, SC-002 | execucao completa em modo mock gravando a arvore de artefatos |
| `FR-019` | US-002, SC-003 | avaliacao de ideia sintetica com indice e tier calculados |
| `FR-020` | US-001, QR-004 | leitura do dados.json gerado pelo pipeline na recalibracao |
| `QR-006` | SC-001 | execucao dos comandos unicos de check, lint e teste |
