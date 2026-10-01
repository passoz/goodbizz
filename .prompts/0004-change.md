# PROMPT: Título curto e descrição do estudo, cache por estudo e configurações agrupadas

**Status:** Pronto para planejamento
**Work ID:** 0004
**Origem:** `.sources/0004-estudo-titulo-cache.md`
**System spec:** `.specs/system.json`
**Baseline:** system spec versao 1, status "Baseline parcial" (2026-09-29), commit `6ccfa23`

## Delta da system spec

- **Capacidades afetadas:** CAP-001 (o estudo nasce com título e descrição), CAP-011 (o cache de respostas passa a ter dono), CAP-013 e CAP-014 (criação por API e pela interface), CAP-015 (persistência ganha a descrição).
- **Regras preservadas:** BR-001, BR-002, BR-010, BR-011, BR-019, BR-023. Nenhuma regra vigente é alterada.
- **Regras alteradas:** nenhuma regra existente muda; o Work acrescenta regras novas ao work spec, sem tocar BR-001 a BR-023.
- **Contratos afetados:** CON-002 (POST /api/studies passa a aceitar `description` e a responder 422 acima de 50 caracteres no nicho), CON-003 (formulário de criação e página de configurações) e CON-001 (flag `--description`). CON-006 não muda: os artefatos em disco mantêm nome e esquema.
- **Qualidades, entidades e integrações relacionadas:** SQR-005 (reexecutar reaproveita o cache e não repete chamada paga) é o requisito de qualidade que a mudança de cache precisa preservar; ENT-001 (Study) ganha o campo de descrição. Integrações INT-001 (LLM) e INT-002 (decisor) recebem o texto concatenado.
- **Gaps tocados:** nenhum gap novo. GAP-003 (drift de retentativa do cliente LLM) já foi resolvido no Work 0002 e não é tocado.
- **Reconciliação esperada após implementação:** CON-002 documenta o campo `description` e o limite de 50 caracteres; CON-003 documenta o agrupamento por provedor na página de configurações; CON-001 documenta `--description`. A spec do Work acrescenta as regras novas em vez de reescrever as vigentes.

## Problema e resultado

**Problema:** três defeitos independentes na criação e na operação de um estudo. Primeiro, o nicho digitado vira o título exibido sem nenhum tratamento: uma frase longa quebra o cabeçalho e o cartão da lista, e não há onde registrar o contexto que alimenta o decisor, então o operador é empurrado a escrever uma frase longa no campo do título. Segundo, as chaves de cache de `brief`, `ideias`, `aval` e `doc` derivam de `niche` e `city` e de mais nada (`src/application/generate-study.ts:266,279,293,354` sobre `src/domain/hash.ts:12`), e não existe invalidação em nenhum ponto: criar um estudo, excluí-lo e criar outro com o mesmo nicho devolve as ideias e as avaliações do estudo anterior, como a reprodução em `.sources/0004-estudo-titulo-cache.md` demonstra com `cache count: 8 hits: 8`. Terceiro, a página de configurações empilha os seis campos dos dois provedores em uma única grade automática, sem agrupamento nem legenda.

**Resultado esperado:** o operador cria um estudo com um título curto capitalizado e uma descrição de contexto; cada estudo tem o seu próprio namespace de cache, de modo que excluir e recriar o mesmo título gera conteúdo de novo; reexecutar um estudo que falhou continua retomando do ponto onde parou; e a página de configurações apresenta os campos agrupados pelo provedor a que pertencem.

## Contexto confirmado

- **O bug do cache é de compartilhamento de chave, não de exclusão.** `SqliteStudyRepository.delete` (`src/infrastructure/repositories.ts:303`) apaga estudo e avaliações na mesma transação. O que sobra é o cache, porque a chave não tem dono. A correção precisa dar identidade ao estudo dentro da chave, e não limpar cache por nicho — dois estudos com o mesmo nicho passariam a competir.
- **A retomada já funciona e é requisito de qualidade explícito.** SQR-005 diz que reexecutar reaproveita o cache sem repetir chamada paga. Medido no snapshot: retomar um estudo que falhou no passo 5 gera uma única chamada de documento. Qualquer solução de cache que apague o que está gravado ao reexecutar violaria SQR-005.
- **Uma única semente por estudo resolve os dois requisitos.** Usar o `id` do estudo na chave de cache separa estudos distintos e mantém a retomada do mesmo estudo, porque o `id` sobrevive à reexecução e só morre na exclusão.
- **A normalização do título é função pura de domínio.** `titleCase` não depende de rede, de banco nem de relógio, e `src/domain` não pode importar `src/infrastructure`.
- **O limite de 50 caracteres vale sobre o texto digitado**, por decisão do operador: `maxlength` no campo e 422 na API. A capitalização preserva o comprimento, então o título gravado também cabe em 50.
- **A descrição só serve ao processamento.** Ela é gravada no registro para sobreviver à reexecução e entra concatenada ao título em `generateBrief`, `generateIdeas`, `dataBlock`, `studyContext` e `scopeNotice`. Não vira título, não ganha coluna em `dados.json` e não aparece como texto próprio na tela.

## Atores e valor

- **ACT-001 Operador/consultor (CLI):** cria estudos com um título curto, informa o contexto em `--description` e acompanha o texto do estudo sem o cabeçalho estourado.
- **ACT-002 Cliente da API HTTP:** envia `description` no corpo de `POST /api/studies` e recebe 422 descritivo quando o nicho passa de 50 caracteres.
- **ACT-003 Usuário da interface web:** vê o campo de contexto no formulário, o título capitalizado na lista e no detalhe, e os campos de configuração separados por provedor.
- **ACT-004 e ACT-005 (provedores externos):** recebem no prompt o título com a descrição concatenada, em vez de um título solto.

## Escopo

### Inclui

- Função pura de domínio que capitaliza cada palavra do título mantendo os espaços e preservando acentos, com o limite de 50 caracteres como constante exportada.
- Campo `description` no contrato do estudo, na configuração resolvida, no registro persistido e na coluna nova da tabela `studies`, com migração aditiva.
- Concatenação do título com a descrição em `generateBrief`, `generateIdeas`, `dataBlock`, `studyContext` e `scopeNotice`, sem alterar a forma do `dados.json`.
- Chave de cache prefixada pelo identificador do estudo, com `purge` no port de cache e remoção das entradas do estudo na exclusão.
- Regressão que prova a retomada e correção do texto da interface que hoje promete reiniciar o pipeline.
- Campo de descrição no formulário de criação, no `POST /ui/studies` e na flag `--description` da CLI.
- Página de configurações com um grupo por provedor, legenda e descrição da função do grupo.

### Não inclui

- Limpeza global do cache de respostas ou qualquer rotina de expurgo por tempo.
- Alteração do esquema de artefatos em disco (CON-006): nomes de arquivo, pastas e chaves do `dados.json` ficam como estão.
- Streaming de tokens, reordenar ideias por arraste e a fila distribuída de execução.
- Mudar o limite de 40 ideias por estudo ou o teto de 600 s do campo `timeout` em `POST /api/studies`.
- Reescrever SQR-003 (artefatos sem acento), que é drift conhecido e não é tocado por este Work.

## Cenários de usuário

### US-001 — Operador cria um estudo com título curto e contexto separado (P1)

**Ator:** operador na interface web e na CLI.
**Valor independente:** permite manter o título legível na tela sem perder o contexto que orienta o decisor.
**Verificação independente:** o título gravado tem cada palavra capitalizada, e o prompt enviado ao provedor contém a descrição concatenada ao título.

1. **Given** um nicho de 30 caracteres com acentos e uma descrição de contexto, **When** o operador cria o estudo, **Then** o título gravado aparece capitalizado com os espaços preservados e o prompt do LLM contém a descrição junto do título (FR-001, FR-002, FR-003)

### US-002 — Operador exclui e recria um estudo com o mesmo título (P1)

**Ator:** operador na interface web.
**Valor independente:** garante que um estudo novo é novo, em vez de uma cópia servida pelo cache do estudo apagado.
**Verificação independente:** o provedor de texto é chamado de novo na recriação, e o inventário do cache não guarda entradas do estudo excluído.

1. **Given** um estudo concluído cujo cache está populado, **When** o operador o exclui e cria outro com o mesmo título, **Then** as ideias e as avaliações são geradas de novo e nenhuma resposta do estudo excluído é reaproveitada (FR-004, FR-005)

### US-003 — Operador conclui um estudo que falhou no meio (P1)

**Ator:** operador na interface web e na CLI.
**Valor independente:** evita pagar de novo por fases já concluídas quando o provedor falha no meio do pipeline.
**Verificação independente:** retomar um estudo que falhou no passo 5 dispara apenas as chamadas do passo ausente.

1. **Given** um estudo que falhou ao gerar documentos e já tem brief, ideias e avaliações em cache, **When** o operador manda concluir, **Then** o estudo termina e o provedor de texto é chamado apenas para o documento que faltava (FR-006)

### US-004 — Operador revisa os provedores na página de configurações (P2)

**Ator:** operador na interface web.
**Valor independente:** permite conferir e trocar a configuração de um provedor sabendo quais campos pertencem a ele.
**Verificação independente:** a página traz dois grupos com legenda, um por provedor, e cada campo aparece sob o seu grupo.

1. **Given** a página de configurações com os dois provedores configurados, **When** o operador a abre, **Then** os campos aparecem em dois blocos com legenda, o do provedor de texto e o do provedor de decisão (FR-007, FR-008)

## Contrato observável

- **Entradas:** `POST /api/studies` passa a aceitar `description` (texto, opcional) além de `niche`; `PATCH /api/studies/:id` continua aceitando só `niche`; `POST /ui/studies` passa a aceitar `description`; a CLI ganha `--description`. O nicho continua sendo um texto de 2 a 50 caracteres.
- **Saídas e efeitos:** o nicho é gravado capitalizado, com os espaços preservados e a pontuação das palavras mantida; a descrição é gravada no registro e exposta em `publicStudy`; nada muda no `dados.json` nem nos nomes de artefato; a página de configurações passa a renderizar dois grupos por provedor com os mesmos nomes de campo do formulário.
- **Erros:** nicho com menos de 2 caracteres continua 422; nicho com mais de 50 caracteres digitados passa a responder 422 com mensagem que cita o limite; `description` acima do teto do contrato responde 422; a exclusão de um estudo inexistente continua 404; nenhuma rota nova é criada.

## Requisitos

### Funcionais

- **FR-001:** o título do estudo é gravado capitalizado por palavra, com os espaços e os acentos preservados e no máximo 50 caracteres digitados.
- **FR-002:** a criação e a renomeação aceitam uma descrição de contexto, gravada junto do registro do estudo.
- **FR-003:** a descrição é concatenada ao título antes de toda chamada ao provedor de texto ou ao decisor.
- **FR-004:** a chave de cache de um estudo inclui o identificador dele, de modo que dois estudos nunca compartilhem resposta.
- **FR-005:** excluir um estudo remove as entradas de cache que pertencem a ele, sem tocar nas dos demais estudos.
- **FR-006:** reexecutar um estudo que falhou reaproveita as respostas em cache daquele estudo e recalcula apenas o que faltava.
- **FR-007:** a página de configurações apresenta os campos agrupados por provedor, cada grupo com legenda que nomeia o provedor.
- **FR-008:** a interface e a CLI expõem o campo de descrição e o limite de 50 caracteres do título.

### Qualidade e restrições

- **QR-001:** a exclusão de um estudo não remove entradas de cache de nenhum outro estudo, e o cache continua persistido em SQLite pelo mesmo adaptador.
- **QR-002:** a normalização do título vive em `src/domain`, é função pura e `src/domain` continua sem importar `src/infrastructure`.
- **QR-003:** a suíte existente permanece verde, o esquema dos artefatos em disco não muda (CON-006) e nenhum campo novo entra no objeto serializado do `dados.json`.

## Casos de borda

- **EC-001:** digitado um título com 51 caracteres, a criação responde 422 com mensagem que cita o limite de 50 e nada é gravado (FR-001).
- **EC-002:** digitado um título com acentos e pontuação, cada palavra é capitalizada e os acentos e o restante do texto permanecem (FR-001).
- **EC-003:** criado um estudo sem descrição, o prompt continua sem texto concatenado e nada é acrescentado ao título (FR-002, FR-003).
- **EC-004:** excluído um estudo e criado outro com o mesmo título, as ideias e as avaliações são geradas de novo em vez de servidas do cache antigo (FR-004, FR-005).
- **EC-005:** reexecutado um estudo que falhou no passo 5, as fases de brief, ideias e avaliação não voltam a chamar o provedor (FR-006).
- **EC-006:** aberta a página de configurações sem JavaScript, os dois grupos continuam visíveis e o formulário sem script segue aceitando o mesmo patch (FR-007).

## Critérios de sucesso

- **SC-001:** o teste de domínio prova a capitalização com acentos preservados e a recusa acima de 50 caracteres (FR-001, QR-002).
- **SC-002:** o teste de serviço prova que excluir remove as entradas de cache do estudo e que a recriação do mesmo título dispara geração nova (FR-004, FR-005, QR-001).
- **SC-003:** o teste de serviço prova a retomada, com o provedor de texto chamado apenas para o documento ausente (FR-006).
- **SC-004:** o teste de UI prova os dois grupos de provedor com legenda e o campo de descrição no formulário (FR-007, FR-008).

## Premissas

- **A-001:** o operador aceita que o limite de 50 caracteres vale sobre o texto digitado e que o detalhe longo passa a viver na descrição.
- **A-002:** o cache de respostas em SQLite é descartável e apagar as entradas de um estudo não afeta nenhum outro.
- **A-003:** a descrição não precisa aparecer como texto na tela do estudo; basta ficar gravada e alimentar o processamento.

## Componentes afetados

- `src/domain/naming.ts` — novo, com `titleCase`, `MAX_NICHE_LENGTH` e a concatenação do sujeito.
- `src/domain/types.ts` e `src/config/runtime.ts` — campos `description` e `cacheSeed` no contrato do estudo.
- `src/infrastructure/schema.ts`, `drizzle/` e `src/infrastructure/repositories.ts` — coluna e persistência da descrição.
- `src/application/generation.ts`, `src/application/reports.ts` e `src/config/runtime.ts` — o sujeito concatenado nos prompts e no aviso de escopo.
- `src/domain/ports.ts`, `src/infrastructure/cache-repository.ts` e `src/application/cache.ts` — chave com escopo e `purge`.
- `src/application/study-service.ts` — semente de cache por estudo, purga na exclusão e descrição no registro.
- `src/infrastructure/http/api.ts`, `src/infrastructure/http/ui/pages.tsx`, `src/infrastructure/http/ui/routes.tsx`, `src/infrastructure/http/ui/layout.tsx`, `src/config/providers.ts` e `src/cli.ts` — superfícies.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
|---|---|---|
| `FR-001` | US-001, EC-001, EC-002, SC-001 | teste de `titleCase` com acentos, pontuacao e recusa acima de 50 caracteres |
| `FR-002` | US-001, EC-003 | teste de persistencia que grava e le a descricao no registro do estudo |
| `FR-003` | US-001, EC-003 | teste que captura o prompt e encontra a descricao concatenada ao titulo |
| `FR-004` | US-002, EC-004, SC-002 | teste que compara as chaves de cache de dois estudos de mesmo titulo |
| `FR-005` | US-002, EC-004, SC-002 | teste que conta as entradas de cache antes e depois da exclusao |
| `FR-006` | US-003, EC-005, SC-003 | teste que retoma um estudo falho e conta as chamadas ao provedor de texto |
| `FR-007` | US-004, EC-006, SC-004 | teste de pagina que confere os dois grupos com legenda por provedor |
| `FR-008` | US-004, SC-004 | teste de formulario e da CLI que confere o campo de descricao e o limite declarado |
| `QR-001` | US-002, SC-002 | teste que exclui um estudo e confere que o cache do outro permanece |
| `QR-002` | SC-001 | typecheck estrito e leitura de `src/domain` sem import de infraestrutura |
| `QR-003` | SC-002, SC-003 | suite completa verde, com os nomes de artefato e as chaves do dados.json intactos |
