# Snapshot da origem — Work 0004

Capturado em 2026-10-01, a partir do pedido do operador e do estado observado no
repositório (commit `6ccfa23`, `main` limpo).

## Pedido do operador (verbatim, em partes)

> preciso de uma adicao na criacao do estudo. alem do nicho devo fornecer uma
> pequena descricao que só servira para ser concatenada ao nicho antes de ser
> processada. o motivo é que o nicho vira titulo do estudo e se e fornecer um
> titulo/nicho grande terei problemas na exibicao do titulo (e ponha o
> titulo/nicho em camel case e ponha linite de 50 caracteres no nicho).
>
> veja tb que se eu criar um estudo com um nicho, apaga lo e depois criar outro
> ele estava retornando com o estudo antigo. certifique se que ele apague e faca
> de novo se pedir o mesmo nicho. e estudos imcompletos que tenham cache nao
> devem ser reiniciados para ficarem completos se houver um problema na execucao,
> devem continuar de onde pararam ate ficarem completos qdo coloco para serem
> concluidos.
>
> faca uma melhoria no layout das configuracoes, ta uma bagunca a posicao dos
> inputs, sem semantica. use pwn. obs outro agente comecou a fazer sem pwn

## Decisões tomadas pelo operador na sessão de descoberta (2026-10-01)

1. **Formato do título:** capitalizar cada palavra mantendo os espaços
   (`clinicas odontologicas em cidade media` vira `Clinicas Odontologicas Em
   Cidade Media`). A palavra "camel case" do pedido foi resolvida nesta escolha.
2. **Limite de 50 caracteres:** vale sobre o texto digitado no campo do nicho,
   com `maxlength` na interface e validação 422 na API.
3. **Descrição:** não aparece como texto na tela do estudo; só é gravada e
   concatenada ao título no momento do processamento.

## Bug de cache, reproduzido

Script descartável contra SQLite `:memory:` com os mocks determinísticos
(`LlmMock`/`DeciderMock`), nicho `clinicas odontologicas`, 3 ideias:

```
A ideas: Ficha do cliente | Triagem de WhatsApp | Confirmacao de horario
B ideas: Ficha do cliente | Triagem de WhatsApp | Confirmacao de horario
SAME IDEA NAMES? true
cache count: 8 hits: 8
```

O segundo estudo (`B`) foi servido inteiro pelo cache do primeiro (`A`): as
chaves de cache são `sha256(kind|niche|city|...)` truncado
(`src/domain/hash.ts:12`, chamadas em `src/application/generate-study.ts:266,279,293,354`),
sem nada que separe um estudo do outro. Não existe invalidação: a busca por
`cacheEntries` alcança apenas `get`, `put` e `count`.

## Retomada, medida no estado atual

O mesmo harness, com um LLM que falha no primeiro documento e depois passa:

```
first run failed (expected)
prompts first: BRIEF,IDEIAS,DOC,DOC
prompts retry: DOC | state: done | evals: 2
```

Ou seja: reexecutar um estudo que falhou já reaproveita brief, ideias e
avaliações via cache, e regenera apenas o documento ausente. O requisito do
operador é preservar esse comportamento — a mudança do cache não pode reiniciar o
estudo. O texto atual da interface mente sobre isso: `pages.tsx` diz
"Executar de novo refaz o pipeline do começo".

## Superfície de configurações, estado atual

`SettingsPage` (`src/infrastructure/http/ui/pages.tsx:985`) renderiza os 6 campos
de `PROVIDER_FIELDS` (`src/config/providers.ts:33`) em um único `div.form-grid`
com `grid-template-columns: repeat(auto-fit, minmax(230px, 1fr))`
(`src/infrastructure/http/ui/layout.tsx:500`). Não há agrupamento por provedor,
nem legenda, nem vínculo entre o texto de ajuda e o campo: os dois provedores
(LLM e decisor) ficam intercalados na mesma grade.

## Limite do que este snapshot comprova

- O cache é de respostas de API em SQLite, descartável por natureza; apagar
  entradas de um estudo não afeta nenhum outro.
- O modo simulado é determinístico, então a reprodução acima prova o
  compartilhamento de chave (`cache count` e `hits`), não a variedade do texto.
- O `app.db` do repositório não foi inspecionado: a evidência vem de harness
  isolado em memória.
