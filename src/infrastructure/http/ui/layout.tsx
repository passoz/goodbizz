/**
 * Shell da interface: sistema de design em CSS nativo (glassmorphism) + cabecalho/rodape.
 *
 * Direcao visual: "observatorio noturno". Base ink profunda, aurora em tres gradientes radiais
 * de baixa alpha, paineis de vidro com filme branco e um unico acento (honey) reservado para acao
 * e para leitura "forte". Tipografia pela stack do sistema (sem requisicao externa, sem FOUT);
 * a personalidade vem de escala, peso, tracking e dos numeros em monospace tabular.
 *
 * Acessibilidade: foco visivel, contraste AA, `prefers-reduced-motion` desliga a entrada e
 * `prefers-reduced-transparency` (e ausencia de backdrop-filter) troca o vidro por preenchimento
 * solido. Regra de forma: paineis 20px, controles 12px, pills 999px.
 */
import type { FC, PropsWithChildren } from "hono/jsx";
import { raw } from "hono/html";

export const GLASS_CSS = `
:root {
  --ink-900: #070b13;
  --ink-800: #0c1320;
  --ink-700: #131c2c;
  --mist: #cfd9e8;
  --muted: #9daec6;
  --faint: #8698b1;
  --honey: #e9a13b;
  --honey-deep: #c9821f;
  --mint: #5fd0a8;
  --rose: #ef7a86;
  --violet: #8f7bea;
  --r-panel: 20px;
  --r-control: 12px;
  --r-pill: 999px;
  --fs-micro: 11px;
  --fs-small: 12.5px;
  --fs-body: 14.5px;
  --fs-lead: 17px;
  --fs-h3: 15px;
  --fs-h2: 26px;
  --fs-h1: 40px;
  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  --sans: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

* { box-sizing: border-box; }

html { color-scheme: dark; }

body {
  margin: 0;
  min-height: 100dvh;
  background: var(--ink-900);
  color: var(--mist);
  font: var(--fs-body)/1.6 var(--sans);
  -webkit-font-smoothing: antialiased;
}

/* Aurora: atmosfera de fundo, nunca decoracao de conteudo. Gradientes radiais ja sao suaves, entao
   nao levam filtro de blur, que forcaria uma camada grande a ser rasterizada a cada frame. */
body::before {
  content: "";
  position: fixed;
  inset: -20% -10% auto -10%;
  height: 140vh;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(48% 42% at 12% 8%, rgb(143 123 234 / .30), transparent 62%),
    radial-gradient(42% 38% at 88% 12%, rgb(21 157 143 / .26), transparent 64%),
    radial-gradient(60% 44% at 50% 104%, rgb(233 161 59 / .20), transparent 68%);
}

a { color: var(--mist); text-decoration: none; }
a:hover { color: #ffffff; }
:focus-visible { outline: 2px solid var(--honey); outline-offset: 2px; border-radius: 6px; }

.shell { max-width: 1320px; margin: 0 auto; padding: 28px 24px 80px; }

/* ── Cabecalho ─────────────────────────────────────────────────────────── */
.topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 16px;
  padding: 14px 20px; margin-bottom: 30px;
}
.brand { display: flex; align-items: baseline; gap: 10px; }
.brand h1 { margin: 0; font-size: 22px; letter-spacing: -.02em; color: #ffffff; font-weight: 650; }
.brand span { font-size: var(--fs-small); color: var(--faint); }
.nav { display: flex; gap: 8px; }
.nav a {
  padding: 7px 14px; border-radius: var(--r-pill); font-size: var(--fs-small);
  border: 1px solid transparent; color: var(--muted);
}
.nav a:hover { border-color: rgb(255 255 255 / .16); color: var(--mist); }

/* ── Vidro ─────────────────────────────────────────────────────────────── */
/* Sem backdrop-filter de proposito: o fundo ja e um gradiente suave, entao o desfoque ao vivo
   seria invisivel, e ele e a propriedade de composicao mais cara que existe (trava renderizacao
   por software, print e captura de tela). O efeito de vidro vem do filme translucido, da borda
   clara, do brilho interno no topo e da sombra difusa. */
.glass {
  background:
    linear-gradient(115deg, rgb(255 255 255 / .10), rgb(255 255 255 / .02) 44%, rgb(255 255 255 / .06)),
    linear-gradient(150deg, rgb(12 19 32 / .66), rgb(7 11 19 / .58));
  border: 1px solid rgb(255 255 255 / .14);
  border-radius: var(--r-panel);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / .18),
    inset 0 0 0 1px rgb(255 255 255 / .03),
    0 26px 60px -30px rgb(0 0 0 / .8);
}
.panel { padding: 22px 24px; margin-bottom: 22px; }
.panel > h2, .panel > h3 { margin-top: 0; }
h2 { font-size: var(--fs-h2); letter-spacing: -.02em; color: #ffffff; font-weight: 620; margin: 0 0 6px; }
h3 { font-size: var(--fs-h3); letter-spacing: .01em; color: var(--mist); font-weight: 600; margin: 26px 0 12px; }
.lead { font-size: var(--fs-lead); color: var(--muted); max-width: 68ch; }
.sub { font-size: var(--fs-small); color: var(--faint); max-width: 74ch; margin: 6px 0 0; }

/* ── Acoes ─────────────────────────────────────────────────────────────── */
.btn {
  display: inline-flex; align-items: center; gap: 8px; white-space: nowrap;
  padding: 11px 20px; border-radius: var(--r-pill); cursor: pointer;
  font: 600 var(--fs-body)/1 var(--sans); border: 1px solid rgb(255 255 255 / .16);
  background: rgb(255 255 255 / .06); color: var(--mist);
  transition: transform .12s ease, background .15s ease, border-color .15s ease;
}
.btn:hover { background: rgb(255 255 255 / .11); border-color: rgb(255 255 255 / .26); }
.btn:active { transform: translateY(1px); }
.btn-primary {
  background: linear-gradient(180deg, var(--honey), var(--honey-deep));
  border-color: rgb(255 255 255 / .28); color: #14100a;
  box-shadow: 0 12px 30px -14px rgb(233 161 59 / .7);
}
.btn-primary:hover { background: linear-gradient(180deg, #f2ae4d, #c9821f); color: #14100a; }
.btn[disabled] { opacity: .55; cursor: progress; }

/* ── Formulario ────────────────────────────────────────────────────────── */
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 16px 18px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.field label { font-size: var(--fs-small); color: var(--mist); font-weight: 550; }
.field input[type="text"], .field input[type="number"] {
  width: 100%; padding: 11px 13px; color: var(--mist); font: var(--fs-body)/1.4 var(--sans);
  background: rgb(4 8 15 / .5); border: 1px solid rgb(255 255 255 / .16);
  border-radius: var(--r-control);
}
.field input::placeholder { color: var(--faint); }
.field input:focus { border-color: rgb(233 161 59 / .6); background: rgb(4 8 15 / .72); }
.field .hint { color: var(--faint); }
.check { display: flex; align-items: center; gap: 9px; font-size: var(--fs-small); color: var(--muted); }
.check input { width: 16px; height: 16px; accent-color: var(--honey); }
.form-actions { display: flex; align-items: center; gap: 14px; margin-top: 20px; flex-wrap: wrap; }
#study-error { color: var(--rose); font-size: var(--fs-small); margin: 0; }
#study-error:empty { display: none; }

/* ── Hints e badges ────────────────────────────────────────────────────── */
.hint { font-size: var(--fs-micro); color: var(--faint); font-weight: 400; letter-spacing: .01em; }
.badge {
  display: inline-flex; align-items: center; gap: 6px; padding: 3px 10px;
  border-radius: var(--r-pill); font-size: var(--fs-micro); font-weight: 600;
  border: 1px solid rgb(255 255 255 / .18); background: rgb(255 255 255 / .07); color: var(--mist);
}
.badge-strong { color: var(--honey); border-color: rgb(233 161 59 / .42); background: rgb(233 161 59 / .13); }
.badge-weak { color: var(--faint); }
.badge-unstable { color: var(--violet); border-color: rgb(143 123 234 / .42); background: rgb(143 123 234 / .13); }
.badge-done { color: var(--mint); border-color: rgb(95 208 168 / .4); background: rgb(95 208 168 / .12); }
.badge-running { color: var(--honey); border-color: rgb(233 161 59 / .4); background: rgb(233 161 59 / .12); }
.badge-failed { color: var(--rose); border-color: rgb(239 122 134 / .4); background: rgb(239 122 134 / .12); }
.tier { font: 600 var(--fs-small)/1 var(--mono); padding: 4px 10px; border-radius: var(--r-pill); }
.tier-A { color: #0d1a15; background: linear-gradient(180deg, var(--mint), #3fae8b); }
.tier-B { color: #1a1408; background: linear-gradient(180deg, var(--honey), var(--honey-deep)); }
.tier-C { color: var(--muted); background: rgb(255 255 255 / .09); border: 1px solid rgb(255 255 255 / .16); }

/* ── Metricas ──────────────────────────────────────────────────────────── */
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; list-style: none; padding: 0; margin: 0; }
.metric {
  padding: 14px 16px; border-radius: var(--r-panel);
  background: linear-gradient(160deg, rgb(255 255 255 / .07), rgb(255 255 255 / .02));
  border: 1px solid rgb(255 255 255 / .11);
}
.metric-label { display: block; color: var(--muted); font-size: var(--fs-small); }
.metric .value { display: block; margin-top: 2px; font: 600 22px/1.2 var(--mono); color: #ffffff; font-variant-numeric: tabular-nums; }
.metric .hint { display: block; margin-top: 6px; }
.metric-note { display: block; margin-top: 3px; font-size: var(--fs-micro); color: var(--faint); }
.groups { list-style: none; padding: 0; margin: 0; }

/* ── Tabelas ───────────────────────────────────────────────────────────── */
.table-wrap { overflow: visible; border-radius: var(--r-panel); }
@media (max-width: 900px) {
  /* Abaixo disso a tabela rola na horizontal; o tooltip fica com o title nativo do navegador. */
  .table-wrap { overflow-x: auto; }
}
table { width: 100%; border-collapse: collapse; font-size: var(--fs-small); }
th, td { padding: 11px 14px; text-align: left; border-bottom: 1px solid rgb(255 255 255 / .07); vertical-align: top; }
th { color: var(--faint); font-weight: 550; font-size: var(--fs-micro); letter-spacing: .02em; }
tbody tr:hover { background: rgb(255 255 255 / .035); }
tbody tr:last-child td { border-bottom: none; }
td.num, th.num { text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; }
td.num { color: #ffffff; white-space: nowrap; }
table.rank td:first-child { color: var(--faint); font-family: var(--mono); }

/* ── Grupos de dor ─────────────────────────────────────────────────────── */
.pain-row {
  list-style: none; padding: 11px 14px; margin: 0 0 8px; border-radius: var(--r-control);
  background: rgb(255 255 255 / .04); border-left: 3px solid rgb(255 255 255 / .18);
  font-size: var(--fs-small);
}
.pain-row-forte { border-left-color: var(--honey); }
.pain-row-mista { border-left-color: var(--violet); }
.pain-row-fraca { border-left-color: var(--faint); }

/* ── Artefatos ─────────────────────────────────────────────────────────── */
.files { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; list-style: none; padding: 0; margin: 0; }
.file {
  display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-radius: var(--r-control);
  background: rgb(255 255 255 / .045); border: 1px solid rgb(255 255 255 / .1);
  font-size: var(--fs-small); transition: background .15s ease, border-color .15s ease;
}
.file:hover { background: rgb(255 255 255 / .09); border-color: rgb(255 255 255 / .22); }
.file-path { overflow-wrap: anywhere; }
.file-ext {
  flex: none; font: 600 var(--fs-micro)/1 var(--mono); padding: 4px 7px; border-radius: 6px;
  background: rgb(255 255 255 / .1); color: var(--mist);
}

/* ── Leitor do plano ───────────────────────────────────────────────────── */
pre#plan {
  margin: 0; padding: 20px; max-height: 62vh; overflow: auto;
  background: rgb(3 6 12 / .62); border: 1px solid rgb(255 255 255 / .12);
  border-radius: var(--r-panel); color: var(--mist);
  font: var(--fs-small)/1.65 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere;
}

/* ── Legenda ───────────────────────────────────────────────────────────── */
.legend { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 14px 22px; margin: 0; }
.legend div { margin: 0; }
.legend dt { color: #ffffff; font-size: var(--fs-small); font-weight: 600; }
.legend dd { margin: 3px 0 0; font-size: var(--fs-small); color: var(--muted); }

.empty { padding: 26px; text-align: center; color: var(--muted); }
.alert { padding: 14px 16px; border-radius: var(--r-control); border: 1px solid rgb(239 122 134 / .45); background: rgb(239 122 134 / .1); color: #ffd9dd; }
.footer { margin-top: 34px; color: var(--faint); font-size: var(--fs-micro); text-align: center; }

/* ── Glossario: caixa de explicacao ao passar o mouse ou focar um termo ── */
.has-tip { position: relative; }
.term { border-bottom: 1px dotted rgb(255 255 255 / .4); cursor: help; }
.term:hover { border-bottom-color: var(--honey); color: #ffffff; }
.tip {
  position: absolute; left: 0; bottom: calc(100% + 9px); z-index: 40;
  width: max-content; min-width: 180px; max-width: min(300px, 78vw);
  padding: 9px 11px; border-radius: var(--r-control);
  background: rgb(9 14 24 / .97); color: var(--mist);
  border: 1px solid rgb(255 255 255 / .17);
  box-shadow: 0 20px 44px -20px rgb(0 0 0 / .95);
  font: 400 var(--fs-small)/1.5 var(--sans); letter-spacing: 0; text-align: left; white-space: normal;
  opacity: 0; visibility: hidden; transform: translateY(4px); pointer-events: none;
  transition: opacity .14s ease, transform .14s ease, visibility .14s;
}
.tip-end { left: auto; right: 0; }
.tip-end::after { left: auto; right: 16px; }
.has-tip:hover > .tip,
.has-tip:focus > .tip,
.has-tip:focus-visible > .tip { opacity: 1; visibility: visible; transform: none; }
.tip::after {
  content: ""; position: absolute; left: 16px; top: 100%;
  border: 6px solid transparent; border-top-color: rgb(9 14 24 / .97);
}

/* Sem animacao de entrada: conteudo essencial nunca pode depender de um frame para aparecer
   (aba em background, print, captura de tela e renderizadores sem relogio de animacao). O
   movimento fica so no feedback de interacao (hover/active dos controles). */

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}

/* Preferencia do usuario por menos transparencia: paineis com preenchimento mais solido. */
@media (prefers-reduced-transparency: reduce) {
  .glass { background: var(--ink-800); }
  .metric, .file { background: var(--ink-700); }
}

@media (max-width: 720px) {
  :root { --fs-h1: 30px; --fs-h2: 22px; }
  .panel { padding: 18px 16px; }
  .topbar { flex-direction: column; align-items: flex-start; }
}
`;

/**
 * Glossario: fonte unica das explicacoes curtas que aparecem ao passar o mouse (ou focar pelo
 * teclado) em uma sigla ou nome. Mantenha as frases curtas e sem jargao novo.
 */
export const GLOSSARY: Record<string, string> = {
  "Indice de Acao":
    "Media entre fit e facilidade de venda. Vai de 0 a 2, e maior e melhor. E o criterio de priorizacao entre as ideias.",
  Tier: "Faixa de prioridade: A a partir de 1.84, B a partir de 1.60, C abaixo disso.",
  fit: "Aderencia ao balcao. 2 = resolve a correria do dia sem exigir mudanca de habito; 0 = exige escala corporativa.",
  venda:
    "Facilidade comercial. 2 = ataca perda de dinheiro ou de imagem agora; 0 = beneficio invisivel no curto prazo.",
  disrupcao:
    "Grau de inovacao no setor. 2 = muda o modelo de operacao; 0 = apenas automatiza o que ja existe.",
  WTP: "Willingness to pay, ou disposicao a pagar: probabilidade de 0 a 1 de o dono pagar o ticket mensal informado.",
  dor: "Natureza da consequencia para o dono: dinheiro direto, reputacao publica ou desorganizacao interna.",
  FORTE:
    "Dor com dono claro: escore de 0.65 ou mais e dominante sobre a dor interna. E o sinal que interessa.",
  FRACA:
    "Dor interna de organizacao: nao tira dinheiro nem imagem, entao o dono nao sente urgencia de pagar.",
  INSTAVEL:
    "As parafrases da mesma pergunta divergem (desvio acima de 0.15): a medicao nao e confiavel, revise a mao.",
  INDETERMINADO: "Zona cinzenta entre dor forte e dor interna. Decida olhando o caso, nao pelo numero.",
  solo: "Suporte solo: probabilidade de um consultor manter 30 clientes sem colapsar no atendimento.",
  meta30: "Probabilidade de 30 clientes pagantes em 24 meses. O plano assume 10 a 15 como base, nao 30.",
  desvio:
    "Discrepancia entre as tres parafrases da mesma pergunta. Menor e melhor; acima de 0.15 a leitura vira instavel.",
  ticket:
    "Valor mensal considerado na medicao da disposicao a pagar. Funciona como teto da precificacao, nunca como piso.",
  "System One":
    "Decisor probabilistico externo, treinado para medir chance de compra em vez de escrever prosa convincente.",
  LLM: "Modelo de linguagem. Redige o brief e os planos, mas e proibido de criar numero de mercado.",
  guardrail:
    "Conferencia automatica que exige os numeros medidos no texto final e marca estimativa como [INFERENCE].",
  decisor: "Endpoint externo que responde probabilidades por pergunta. Nao ha inferencia local na imagem.",
  CSRF: "Protecao que exige mesma origem e token assinado em toda acao da interface que muda estado.",
  parafrases:
    "A mesma pergunta escrita de tres formas diferentes. A concordancia entre elas mede a estabilidade da medicao.",
  "escolha forcada":
    "Metodo de dor em que o decisor escolhe entre tres consequencias concretas, sem a opcao tecnologia.",
  "modo simulado":
    "Roda com LLM e decisor simulados: sem credenciais e sem custo, mas a saida nao tem valor de mercado.",
  "[INFERENCE]":
    "Marca de estimativa escrita pelo modelo. Nao e dado pesquisado nem numero medido pelo decisor.",
};

/**
 * Termo com caixa de explicacao. O texto do glossario vive no DOM (o leitor de tela encontra),
 * mas so fica visivel no hover ou no foco por teclado.
 */
export const Term: FC<{ of: string; children?: string; end?: boolean }> = (props) => (
  <span class={`term has-tip${props.end === true ? " tip-end" : ""}`} tabindex="0">
    {props.children ?? props.of}
    <span class="tip" role="tooltip">
      {GLOSSARY[props.of] ?? ""}
    </span>
  </span>
);

export const Layout: FC<PropsWithChildren<{ title: string }>> = (props) => (
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{props.title}</title>
      {/* `raw` e obrigatorio: dentro de <style> o JSX escaparia `>` e `"`, quebrando
          combinadores filho e valores com aspas (ex.: content). */}
      <style>{raw(GLASS_CSS)}</style>
    </head>
    <body>
      <div class="shell">
        <header class="topbar glass">
          <div class="brand">
            <h1>goodbizz</h1>
            <span>estudos de nicho com decisor System One</span>
          </div>
          <nav class="nav">
            <a href="/">Estudos</a>
            <a href="/about">API</a>
          </nav>
        </header>
        <main>{props.children}</main>
        <p class="footer">
          Numeros medidos por um <Term of="decisor">decisor probabilistico</Term>. Texto redigido por um{" "}
          <Term of="LLM">LLM</Term> sob <Term of="guardrail">guardrail</Term>: nenhum valor de mercado e
          inventado.
        </p>
      </div>
    </body>
  </html>
);
