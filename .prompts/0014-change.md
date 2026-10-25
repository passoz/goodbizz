# PROMPT: Reconciliar a system spec com o que os Works 0003 a 0013 entregaram

**Status:** Pronto para planejamento
**Work ID:** 0014
**Origem:** `.sources/0005-plano-de-melhoria.md`
**System spec:** `.specs/system.json`
**Baseline:** system spec versão 1, status "Baseline parcial", última reconciliação em 2026-09-29, commit `01fa7c1`

## Delta da system spec

- **Capacidades afetadas:** CAP-008, CAP-011, CAP-013, CAP-014, CAP-015 e CAP-016 mudam o texto de comportamento e a evidência; nenhuma capacidade de produto nova.
- **Regras preservadas:** BR-001 a BR-012, BR-014 e BR-016 a BR-023 mantêm o enunciado; só a evidência troca o arquivo `.py` do baseline pelo arquivo TypeScript que implementa a regra.
- **Regras alteradas:** BR-013 passa a dizer que o texto gerado sai em português acentuado e que só identificadores ficam em ASCII; BR-015 passa a dizer que a chave de cache combina a semente do estudo, a impressão dos provedores efetivos e o hash dos parâmetros da etapa.
- **Contratos afetados:** CON-002 (campo `description`, limite de 50 caracteres no `niche`, `PATCH`, rotas de ideias, rotas `/api/settings/*`, `usage` e `cost`), CON-003 (`/settings`, `/como-ler`, diálogos de exclusão, ordem token e origem no CSRF) e CON-006 (rodapé de data no plano da ideia).
- **Qualidades, entidades e integrações relacionadas:** SQR-003 acompanha BR-013; SQR-005 passa a dizer que a retomada vale para o mesmo estudo com os mesmos provedores; ENT-001 ganha `description` e `usage`; ENT-002 ganha identidade estável e `generatedAt`; entra uma entidade nova para o perfil de provedor (tabela `settings`).
- **Gaps tocados:** GAP-001, GAP-002 e GAP-003 recebem o estado atual; entra um gap novo para a origem não registrada dos cortes de tier de BR-004.
- **Reconciliação esperada após implementação:** `meta.version` igual a 2 e `meta.last_reconciled` com a data de conclusão; cada reconciliação declarada nos prompts 0004 a 0013 aparece aplicada na spec; nenhum arquivo de `src/` muda.

## Problema e resultado

**Problema:** a spec parou no Work 0002 (último commit nela: `6788303`). Os Works 0003 a 0013 mudaram comportamento e declararam reconciliação, mas nenhum editou `.specs/system.json`. A spec contradiz o código em pelo menos quatro pontos: BR-013 e SQR-003 exigem texto sem acento, e o código gera texto acentuado (`src/application/generate-study.ts:409`); BR-015 descreve a chave de cache só por parâmetros, e o código usa a semente do estudo e a impressão dos provedores (`src/application/cache.ts:11`, `src/config/providers.ts:47`); CON-002 e CON-003 não descrevem a descrição do estudo, a exclusão e a adição de ideias, o catálogo de provedores nem o consumo; a tabela `settings` não tem entidade. Todo `pwn work specify` futuro valida contra essa baseline.

**Resultado esperado:** a spec descreve o sistema do commit de entrada do Work, cada enunciado tem evidência num arquivo que existe, e o próximo prompt cita CAP, BR e CON sem herdar contradição.

## Contexto confirmado

- `git log -- .specs/system.json` lista só `8bcc775` (Work 0001) e `6788303` (Work 0002).
- `meta.version` vale 1, `meta.last_reconciled` vale 2026-09-29 e `status` vale "Baseline parcial".
- `pwn validate` dá 26/26 válidos: o schema aceita a spec, o conteúdo é que está velho.
- `pwn work reconcile --dry-run` não acha nada a conciliar: a dívida é de spec, não de código fora da governança.
- Em `src/`, o NFD que remove acento só aparece no slug de pasta (`src/application/reports.ts:10`).
- CAP-011 cita como evidência `generate_study.py::Cache`, do baseline Python.

## Atores e valor

- **ACT-001 Operador/consultor (CLI):** abre o próximo Work contra uma baseline que descreve o código e não precisa redescobrir o sistema arquivo por arquivo.

## Escopo

### Inclui

- Reescrever BR-013, BR-015, SQR-003 e SQR-005 com o comportamento atual.
- Atualizar CAP-008, CAP-011, CAP-013, CAP-014, CAP-015, CAP-016, CON-002, CON-003 e CON-006 com as reconciliações declaradas nos prompts 0004 a 0013.
- Registrar a entidade de perfil de provedor e os campos novos de ENT-001 e ENT-002.
- Trocar a evidência que aponta para `.py` pelo arquivo TypeScript que implementa a regra.
- Registrar o estado de GAP-001, GAP-002 e GAP-003 e o gap novo dos cortes de tier.
- Subir `meta.version` para 2 e gravar `meta.last_reconciled`.

### Não inclui

- Mudar código em `src/`, `README.md`, migrações ou artefatos em disco.
- Mudar limiares (BR-004, BR-006, BR-007) ou as perguntas do decisor.
- Corrigir o `--timeout` da CLI (Work próprio, previsto na origem).
- Remover o baseline Python.

## Cenários de usuário

### US-001 — A spec diz o que o código faz (P1)

**Ator:** operador.
**Valor independente:** ele escreve o próximo prompt citando regras e contratos sem conferir cada um no código.
**Verificação independente:** leitura de BR-013, BR-015, SQR-003, SQR-005, CON-002 e CON-003 contra o código do commit de entrada, mais `pwn validate` sem erro.

1. **Given** a spec reconciliada, **When** o operador lê BR-013, BR-015, SQR-003 e SQR-005, **Then** cada enunciado descreve o comportamento de `src/` no commit de entrada (FR-001, FR-002)
2. **Given** a spec reconciliada, **When** o operador lê CON-002 e CON-003, **Then** toda rota montada em `src/infrastructure/http/api.ts` e `src/infrastructure/http/ui/routes.tsx` aparece no contrato (FR-003)
3. **Given** a spec reconciliada, **When** o operador procura a tabela `settings`, **Then** acha a entidade de perfil de provedor e os campos novos de ENT-001 e ENT-002 (FR-004)

### US-002 — Evidência rastreável (P2)

**Ator:** operador.
**Valor independente:** cada regra aponta para o arquivo que a implementa, e uma evidência órfã aparece na checagem.
**Verificação independente:** a checagem do Work percorre os campos `evidence` da spec e falha quando um arquivo citado não existe.

1. **Given** a spec reconciliada, **When** a checagem percorre os campos `evidence`, **Then** nenhum aponta para arquivo inexistente nem para o baseline Python quando há implementação TypeScript (FR-005, QR-001)

### US-003 — Gaps com estado atual (P3)

**Ator:** operador.
**Valor independente:** ele sabe quais lacunas continuam abertas antes de planejar o próximo Work.
**Verificação independente:** cada gap da spec tem estado e evidência do estado.

1. **Given** a spec reconciliada, **When** o operador lê a seção de gaps, **Then** GAP-001, GAP-002 e GAP-003 têm estado aberto ou fechado com evidência, e o gap novo registra a origem não documentada dos cortes de tier (FR-006, FR-007)

## Contrato observável

- **Entradas:** `.specs/system.json` versão 1 e o código do commit de entrada do Work.
- **Saídas e efeitos:** `.specs/system.json` versão 2 com enunciados, evidências, entidades e gaps atualizados; nenhum efeito em runtime, API, interface ou artefato.
- **Erros:** se o schema do pwn recusar a spec, `pwn validate` sai com código 1 e o Work não fecha; se uma evidência apontar para arquivo inexistente, a checagem do Work falha.

## Requisitos

### Funcionais

- **FR-001:** BR-013 e SQR-003 dizem que o texto gerado sai em português acentuado e que só slug de pasta, chaves de `dados.json`, cabeçalho do CSV e flags da CLI ficam em ASCII.
- **FR-002:** BR-015, CAP-011 e SQR-005 dizem que a chave de cache combina semente do estudo, impressão dos provedores efetivos e hash dos parâmetros da etapa, e que a retomada vale para o mesmo estudo com os mesmos provedores.
- **FR-003:** CON-002 e CON-003 listam todas as rotas montadas em `api.ts` e `routes.tsx` no commit de entrada, com entradas, saídas e erros de cada uma.
- **FR-004:** a spec tem uma entidade para o perfil de provedor da tabela `settings`, e ENT-001 e ENT-002 listam os campos `description`, `usage`, identidade da ideia e `generatedAt`.
- **FR-005:** todo campo `evidence` da spec aponta para um arquivo que existe no repositório e cita a implementação TypeScript quando ela existe.
- **FR-006:** GAP-001, GAP-002 e GAP-003 registram estado aberto ou fechado, com a evidência que sustenta o estado.
- **FR-007:** um gap novo registra que a origem dos cortes de tier de BR-004 (1.84 e 1.60) não está documentada no repositório.
- **FR-008:** `meta.version` vale 2 e `meta.last_reconciled` registra a data de conclusão do Work.

### Qualidade e restrições

- **QR-001:** nenhum arquivo em `src/`, `drizzle/` ou `README.md` muda no Work.
- **QR-002:** `bun test`, `bun run check`, `bunx eslint .` e `bunx prettier --check .` passam no fim do Work com o mesmo resultado do commit de entrada.
- **QR-003:** `pwn validate` termina sem erro de schema na spec reconciliada.

## Casos de borda

- **EC-001:** se um prompt de 0004 a 0013 declarou uma reconciliação que o código não entregou, a spec registra o comportamento do código e um gap de drift, e não o comportamento prometido (FR-003, FR-006).
- **EC-002:** se uma regra só existe no baseline Python e não tem implementação TypeScript, a evidência continua no arquivo `.py` e um gap de drift registra a lacuna (FR-005).
- **EC-003:** GAP-002 só fecha se `README.md` e `.env.example` já usam `LLM_*` e `DECISION_*`; senão continua aberto com a diferença registrada (FR-006).

## Critérios de sucesso

- **SC-001:** `pwn validate` passa com 0 erros e a spec mostra `meta.version` igual a 2 (FR-008, QR-003).
- **SC-002:** a checagem de evidência do Work termina sem arquivo inexistente (FR-005).
- **SC-003:** `bun test`, `bun run check`, `bunx eslint .` e `bunx prettier --check .` passam, e `git diff --stat` do Work não lista arquivo em `src/` (QR-001, QR-002).
- **SC-004:** `pwn work gate --all --work 0014` aprovado com a cadeia completa (FR-001, FR-002, FR-003, FR-004, FR-006, FR-007).

## Premissas

- **A-001:** o schema `system.schema.json` do pwn aceita `meta.version` 2 sem mudança de estrutura.
- **A-002:** quando um prompt antigo e o código divergem, o código do commit de entrada é a fonte de verdade.

## Componentes afetados

- `.specs/system.json` — enunciados, evidências, entidades, gaps e meta.
- `.pwn/work/0014/` e `.todo/0014-tasks.md` — cadeia de planejamento e plano do Work.

## Rastreabilidade

| Requisito | Cobertura | Evidencia esperada |
|---|---|---|
| `FR-001` | US-001, SC-004 | diff de BR-013 e SQR-003 conferido contra `generate-study.ts:409` e `reports.ts:10` |
| `FR-002` | US-001, SC-004 | diff de BR-015, CAP-011 e SQR-005 conferido contra `cache.ts` e `providers.ts` |
| `FR-003` | US-001, EC-001, SC-004 | lista de rotas de `api.ts` e `routes.tsx` comparada com CON-002 e CON-003 |
| `FR-004` | US-001, SC-004 | entidade de perfil de provedor e campos de ENT-001 e ENT-002 conferidos contra `schema.ts` |
| `FR-005` | US-002, EC-002, SC-002 | saída da checagem de evidência sem arquivo inexistente |
| `FR-006` | US-003, EC-001, EC-003, SC-004 | estado de GAP-001 a GAP-003 com a evidência de cada estado |
| `FR-007` | US-003, SC-004 | gap novo com a origem não registrada dos cortes de tier de BR-004 |
| `FR-008` | SC-001 | `pwn validate` com 0 erros e `meta.version` igual a 2 |
| `QR-001` | SC-003 | `git diff --stat` do Work sem arquivo em `src/`, `drizzle/` ou `README.md` |
| `QR-002` | SC-003 | saída de `bun test`, `bun run check`, eslint e prettier no fim do Work |
| `QR-003` | SC-001 | `pwn validate` sem erro de schema em `.specs/system.json` |
