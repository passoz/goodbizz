/**
 * Shell da interface: sistema de design em CSS nativo (glassmorphism) + cabecalho/rodape.
 *
 * Direcao visual: vidro sobre um fundo quente e saturado. A paleta informada pelo operador
 * (#DD5855 -> #D78133 -> #BFC115 -> #9FDB43 -> #72CE3B) e usada como ESCALA SEMANTICA, nao como
 * decoracao: vermelho = sinal ruim ou quente, laranja = atencao, amarelo = medio, limao e verde =
 * bom. A mesma escala colore os blobs de fundo, os selos, os valores e as barras.
 *
 * Tipografia pela stack do sistema (sem requisicao externa, sem FOUT); a personalidade vem de
 * escala, peso, tracking e dos numeros em monospace tabular. Regra de forma: paineis 26px,
 * controles 14px, pills 999px.
 *
 * Acessibilidade: foco visivel, contraste AA, `prefers-reduced-motion` desliga transicoes e
 * `prefers-reduced-transparency` troca vidro por preenchimento solido.
 */
import type { FC, PropsWithChildren } from "hono/jsx";
import { raw } from "hono/html";

export const GLASS_CSS = `
:root {
  --r-red: #dd5855;
  --r-orange: #d78133;
  --r-yellow: #bfc115;
  --r-lime: #9fdb43;
  --r-green: #72ce3b;

  --ink: #14100f;
  --ink-2: #1d1717;
  --paper: #f6f1ea;
  --muted: #c9bcb3;
  --faint: #a2948a;

  --r-panel: 26px;
  --r-control: 14px;
  --r-pill: 999px;

  --fs-micro: 11.5px;
  --fs-small: 13px;
  --fs-body: 15px;
  --fs-lead: 17.5px;
  --fs-h3: 16px;
  --fs-h2: 28px;
  --fs-h1: 42px;

  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  --sans: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

* { box-sizing: border-box; }

html { color-scheme: dark; }

body {
  margin: 0;
  min-height: 100dvh;
  background: var(--ink);
  color: var(--paper);
  font: var(--fs-body)/1.6 var(--sans);
  -webkit-font-smoothing: antialiased;
}

/* Fundo quente e saturado: e ele que da corpo ao vidro. Sem cor atras, vidro nao existe. */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(42% 38% at 6% 2%, rgb(221 88 85 / .62), transparent 66%),
    radial-gradient(38% 34% at 94% 6%, rgb(215 129 51 / .56), transparent 66%),
    radial-gradient(36% 32% at 86% 94%, rgb(114 206 59 / .5), transparent 68%),
    radial-gradient(32% 30% at 8% 96%, rgb(191 193 21 / .46), transparent 70%),
    radial-gradient(34% 30% at 28% 40%, rgb(215 129 51 / .24), transparent 70%),
    radial-gradient(48% 42% at 52% 52%, rgb(159 219 67 / .26), transparent 72%);
}
body::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: linear-gradient(180deg, rgb(20 16 15 / .26), rgb(20 16 15 / .6));
}

a { color: inherit; text-decoration: none; }
:focus-visible { outline: 3px solid var(--r-lime); outline-offset: 3px; border-radius: 8px; }

.shell { max-width: 1180px; margin: 0 auto; padding: 26px 22px 76px; }

/* ── Cabecalho ─────────────────────────────────────────────────────────── */
.topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 18px;
  padding: 14px 20px; margin-bottom: 30px;
}
.brand { display: flex; align-items: baseline; gap: 12px; }
.brand h1 { margin: 0; font-size: 23px; letter-spacing: -.025em; color: #fff; font-weight: 680; }
.brand span { font-size: var(--fs-small); color: var(--muted); }
.nav { display: flex; align-items: center; gap: 8px; }
.nav a {
  padding: 9px 16px; border-radius: var(--r-pill); font-size: var(--fs-small); font-weight: 550;
  border: 1px solid transparent; color: var(--paper);
}
.nav a:hover { background: rgb(255 255 255 / .1); border-color: rgb(255 255 255 / .22); }
.nav a.nav-cta {
  background: linear-gradient(120deg, var(--r-lime), var(--r-green));
  color: #16210c; border-color: rgb(255 255 255 / .3);
}

/* ── Vidro ─────────────────────────────────────────────────────────────── */
/* Filme translucido claro + borda luminosa + brilho especular no topo + sombra profunda, sobre um
   fundo saturado. O desfoque ao vivo entra quando o navegador suporta; sem ele o vidro continua
   legivel porque o filme, a borda e o brilho carregam o efeito. */
.glass {
  background:
    linear-gradient(140deg, rgb(255 255 255 / .17), rgb(255 255 255 / .06) 44%, rgb(255 255 255 / .11)),
    rgb(255 255 255 / .05);
  border: 1px solid rgb(255 255 255 / .3);
  border-radius: var(--r-panel);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / .5),
    inset 0 0 0 1px rgb(255 255 255 / .07),
    0 32px 70px -34px rgb(0 0 0 / .9);
}
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass {
    backdrop-filter: blur(16px) saturate(160%);
    -webkit-backdrop-filter: blur(16px) saturate(160%);
  }
}
.panel { padding: 24px 26px; margin-bottom: 22px; }
h2 { font-size: var(--fs-h2); letter-spacing: -.025em; color: #fff; font-weight: 650; margin: 0 0 8px; }
h3 { font-size: var(--fs-h3); color: var(--paper); font-weight: 620; margin: 28px 0 14px; }
.lead { font-size: var(--fs-lead); color: var(--paper); max-width: 62ch; margin: 0; }
.sub { font-size: var(--fs-small); color: var(--muted); max-width: 72ch; margin: 8px 0 0; }

/* ── Cabecalho de pagina ───────────────────────────────────────────────── */
.page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
.page-head h2 { margin: 0; }

/* ── Acoes ─────────────────────────────────────────────────────────────── */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 9px; white-space: nowrap;
  padding: 13px 24px; border-radius: var(--r-pill); cursor: pointer;
  font: 620 var(--fs-body)/1 var(--sans); color: var(--paper);
  border: 1px solid rgb(255 255 255 / .26); background: rgb(255 255 255 / .1);
  transition: transform .12s ease, background .15s ease, border-color .15s ease;
}
.btn:hover { background: rgb(255 255 255 / .17); }
.btn:active { transform: translateY(1px); }
.btn-primary {
  background: linear-gradient(120deg, var(--r-lime), var(--r-green));
  color: #16210c; border-color: rgb(255 255 255 / .34);
  box-shadow: 0 16px 34px -16px rgb(114 206 59 / .75);
}
.btn-primary:hover { background: linear-gradient(120deg, #b0e75a, #7fdb49); }
.btn-ghost { background: transparent; border-color: rgb(255 255 255 / .3); }
.btn[disabled] { opacity: .6; cursor: progress; }

/* ── Formulario ────────────────────────────────────────────────────────── */
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 20px; }
.field { display: flex; flex-direction: column; gap: 7px; }
.field label { font-size: var(--fs-small); color: var(--paper); font-weight: 580; }
.field input[type="text"], .field input[type="number"] {
  width: 100%; padding: 13px 15px; color: var(--paper); font: var(--fs-body)/1.4 var(--sans);
  background: rgb(10 8 8 / .42); border: 1px solid rgb(255 255 255 / .26);
  border-radius: var(--r-control);
}
.field input::placeholder { color: var(--faint); }
.field input:focus { border-color: rgb(159 219 67 / .8); background: rgb(10 8 8 / .6); }
.field .hint { color: var(--muted); }
.check { display: flex; align-items: center; gap: 10px; font-size: var(--fs-small); color: var(--paper); }
.check input { width: 17px; height: 17px; accent-color: var(--r-lime); }
.form-actions { display: flex; align-items: center; gap: 16px; margin-top: 26px; flex-wrap: wrap; }
#study-error { color: #ffd2cf; font-size: var(--fs-small); margin: 0; }
#study-error:empty { display: none; }

/* ── Hints e selos ─────────────────────────────────────────────────────── */
.hint { font-size: var(--fs-micro); color: var(--muted); font-weight: 450; letter-spacing: .01em; }
.badge {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px;
  border-radius: var(--r-pill); font-size: var(--fs-micro); font-weight: 650;
  border: 1px solid rgb(255 255 255 / .24); background: rgb(255 255 255 / .1); color: var(--paper);
}
.b-red { color: #ffdbd9; background: rgb(221 88 85 / .3); border-color: rgb(221 88 85 / .6); }
.b-orange { color: #ffe6cd; background: rgb(215 129 51 / .3); border-color: rgb(215 129 51 / .6); }
.b-yellow { color: #f8f7c4; background: rgb(191 193 21 / .28); border-color: rgb(191 193 21 / .58); }
.b-lime { color: #eefbd6; background: rgb(159 219 67 / .28); border-color: rgb(159 219 67 / .6); }
.b-green { color: #e4fbdb; background: rgb(114 206 59 / .3); border-color: rgb(114 206 59 / .62); }
.tier { font: 700 var(--fs-small)/1 var(--mono); padding: 6px 13px; border-radius: var(--r-pill); color: #16210c; }
.tier-A { background: linear-gradient(120deg, var(--r-lime), var(--r-green)); }
.tier-B { background: linear-gradient(120deg, var(--r-yellow), var(--r-lime)); }
.tier-C { background: linear-gradient(120deg, var(--r-orange), var(--r-yellow)); color: #241a08; }

/* ── Cartoes de estudo: a entrada e o cartao inteiro ───────────────────── */
.studies { display: grid; gap: 16px; list-style: none; padding: 0; margin: 0; }
.study-card {
  position: relative;
  display: flex; align-items: center; justify-content: space-between; gap: 26px;
  padding: 22px 26px; border-radius: var(--r-panel);
  transition: transform .16s ease, border-color .16s ease, box-shadow .16s ease;
}
/* Link esticado: o titulo carrega o href e o ::after cobre o cartao inteiro, entao qualquer
   clique abre o estudo sem perder o alvo real para leitor de tela e teclado. */
.stretch::after { content: ""; position: absolute; inset: 0; z-index: 1; border-radius: inherit; }
.stretch:focus-visible { outline: none; }
.stretch:focus-visible::after { outline: 3px solid var(--r-lime); outline-offset: 3px; }
.study-card .term, .study-card .badge { position: relative; z-index: 2; }
.study-card .open-cta { pointer-events: none; }
.study-card:hover {
  transform: translateY(-2px);
  border-color: rgb(255 255 255 / .5);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / .55), 0 40px 80px -36px rgb(0 0 0 / .95);
}
.study-card h3 { margin: 0; font-size: 21px; color: #fff; letter-spacing: -.02em; }
.study-meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0; }
.chip {
  font-size: var(--fs-micro); color: var(--paper); padding: 5px 11px; border-radius: var(--r-pill);
  background: rgb(255 255 255 / .12); border: 1px solid rgb(255 255 255 / .2);
}
.study-top { margin: 12px 0 0; font-size: var(--fs-small); color: var(--muted); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.study-top b { color: #fff; font-weight: 620; }
.study-id { font: var(--fs-micro)/1 var(--mono); color: var(--faint); margin: 10px 0 0; }
.study-side { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; flex: none; }
.open-cta {
  display: inline-flex; align-items: center; gap: 8px; padding: 11px 18px; border-radius: var(--r-pill);
  font-size: var(--fs-small); font-weight: 620; color: #16210c;
  background: linear-gradient(120deg, var(--r-lime), var(--r-green));
}
.study-card:hover .open-cta { background: linear-gradient(120deg, #b0e75a, #7fdb49); }

/* ── Metricas ──────────────────────────────────────────────────────────── */
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(196px, 1fr)); gap: 14px; list-style: none; padding: 0; margin: 0; }
.metric {
  padding: 16px 18px; border-radius: 20px; position: relative; overflow: hidden;
  background: rgb(255 255 255 / .09); border: 1px solid rgb(255 255 255 / .2);
}
.metric::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 4px; background: var(--tone, rgb(255 255 255 / .2)); }
.metric-label { display: block; color: var(--paper); font-size: var(--fs-small); }
.metric .value { display: block; margin-top: 3px; font: 700 26px/1.15 var(--mono); color: #fff; font-variant-numeric: tabular-nums; }
.metric .hint { display: block; margin-top: 7px; }
.metric-note { display: block; margin-top: 4px; font-size: var(--fs-micro); color: var(--faint); }
.tone-red { --tone: var(--r-red); }
.tone-orange { --tone: var(--r-orange); }
.tone-yellow { --tone: var(--r-yellow); }
.tone-lime { --tone: var(--r-lime); }
.tone-green { --tone: var(--r-green); }
.tone-text { color: var(--tone); }

/* ── Tabelas ───────────────────────────────────────────────────────────── */
.table-wrap { overflow: visible; border-radius: var(--r-panel); }
@media (max-width: 900px) {
  /* Abaixo disso a tabela rola na horizontal; o tooltip fica com o title nativo do navegador. */
  .table-wrap { overflow-x: auto; }
}
table { width: 100%; border-collapse: collapse; font-size: var(--fs-small); }
th, td { padding: 12px 14px; text-align: left; border-bottom: 1px solid rgb(255 255 255 / .12); vertical-align: top; }
th { color: var(--muted); font-weight: 580; font-size: var(--fs-micro); letter-spacing: .02em; }
tbody tr:hover { background: rgb(255 255 255 / .06); }
tbody tr:last-child td { border-bottom: none; }
td.num, th.num { text-align: right; font-family: var(--mono); font-variant-numeric: tabular-nums; }
td.num { color: #fff; white-space: nowrap; }
table.rank td:first-child { color: var(--muted); font-family: var(--mono); }
.rank-bar { display: block; height: 5px; border-radius: var(--r-pill); background: var(--tone, rgb(255 255 255 / .3)); margin-top: 6px; }

/* ── Grupos de dor ─────────────────────────────────────────────────────── */
.groups { list-style: none; padding: 0; margin: 0; }
.pain-row {
  padding: 13px 16px; margin: 0 0 9px; border-radius: var(--r-control);
  background: rgb(255 255 255 / .07); border-left: 4px solid var(--tone, rgb(255 255 255 / .25));
  font-size: var(--fs-small); color: var(--paper);
}
.pain-forte { --tone: var(--r-red); }
.pain-mista { --tone: var(--r-orange); }
.pain-fraca { --tone: var(--r-yellow); }
.pain-skip { --tone: rgb(255 255 255 / .25); }

/* ── Artefatos ─────────────────────────────────────────────────────────── */
.files { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 12px; list-style: none; padding: 0; margin: 0; }
.file {
  display: flex; align-items: flex-start; gap: 12px; padding: 13px 16px; border-radius: var(--r-control);
  background: rgb(255 255 255 / .08); border: 1px solid rgb(255 255 255 / .18);
  font-size: var(--fs-small); transition: background .15s ease, border-color .15s ease;
}
.file:hover { background: rgb(255 255 255 / .15); border-color: rgb(255 255 255 / .34); }
.file-path { overflow-wrap: anywhere; }
.file-ext {
  flex: none; font: 700 var(--fs-micro)/1 var(--mono); padding: 5px 8px; border-radius: 7px;
  background: rgb(255 255 255 / .16); color: #fff;
}

/* ── Leitor do plano ───────────────────────────────────────────────────── */
pre#plan {
  margin: 0; padding: 22px; max-height: 62vh; overflow: auto;
  background: rgb(8 6 6 / .55); border: 1px solid rgb(255 255 255 / .2);
  border-radius: var(--r-panel); color: var(--paper);
  font: var(--fs-small)/1.7 var(--mono); white-space: pre-wrap; overflow-wrap: anywhere;
}

/* ── Legenda ───────────────────────────────────────────────────────────── */
.legend { display: grid; grid-template-columns: repeat(auto-fit, minmax(268px, 1fr)); gap: 18px 26px; margin: 0; }
.legend dt { color: #fff; font-size: var(--fs-small); font-weight: 620; }
.legend dd { margin: 5px 0 0; font-size: var(--fs-small); color: var(--muted); }
.scale { display: flex; gap: 6px; margin-top: 10px; }
.scale i { height: 8px; flex: 1; border-radius: var(--r-pill); }
.scale i:nth-child(1) { background: var(--r-red); }
.scale i:nth-child(2) { background: var(--r-orange); }
.scale i:nth-child(3) { background: var(--r-yellow); }
.scale i:nth-child(4) { background: var(--r-lime); }
.scale i:nth-child(5) { background: var(--r-green); }
.scale-labels { display: flex; justify-content: space-between; font-size: var(--fs-micro); color: var(--faint); margin-top: 4px; }

/* ── Estados vazios ────────────────────────────────────────────────────── */
.empty { padding: 34px 26px; text-align: center; color: var(--paper); }
.empty p { margin: 0 auto 18px; max-width: 46ch; color: var(--muted); }
.alert { padding: 15px 18px; border-radius: var(--r-control); border: 1px solid rgb(221 88 85 / .6); background: rgb(221 88 85 / .16); color: #ffdbd9; }
.footer { margin-top: 36px; color: var(--muted); font-size: var(--fs-micro); text-align: center; }

/* ── Glossario: caixa de explicacao ao passar o mouse ou focar um termo ── */
.has-tip { position: relative; }
.term { border-bottom: 1px dotted rgb(255 255 255 / .5); cursor: help; }
.term:hover { border-bottom-color: var(--r-lime); color: #fff; }
.tip {
  position: absolute; left: 0; bottom: calc(100% + 10px); z-index: 40;
  width: max-content; min-width: 190px; max-width: min(310px, 78vw);
  padding: 10px 13px; border-radius: var(--r-control);
  background: rgb(18 14 13 / .97); color: var(--paper);
  border: 1px solid rgb(255 255 255 / .24);
  box-shadow: 0 24px 48px -22px rgb(0 0 0 / .95);
  font: 400 var(--fs-small)/1.55 var(--sans); letter-spacing: 0; text-align: left; white-space: normal;
  opacity: 0; visibility: hidden; transform: translateY(4px); pointer-events: none;
}
.tip-end { left: auto; right: 0; }
.tip-end::after { left: auto; right: 18px; }
.has-tip:hover > .tip,
.has-tip:focus > .tip,
.has-tip:focus-visible > .tip { opacity: 1; visibility: visible; transform: none; }
.tip::after {
  content: ""; position: absolute; left: 18px; top: 100%;
  border: 7px solid transparent; border-top-color: rgb(18 14 13 / .97);
}

/* Sem animacao de entrada: conteudo essencial nunca pode depender de um frame para aparecer
   (aba em background, print, captura de tela e renderizadores sem relogio de animacao). */

@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; }
}

/* Preferencia do usuario por menos transparencia: vidro vira preenchimento solido. */
@media (prefers-reduced-transparency: reduce) {
  .glass { background: var(--ink-2); backdrop-filter: none; -webkit-backdrop-filter: none; }
  .metric, .file, .chip { background: var(--ink-2); }
}

@media (max-width: 760px) {
  :root { --fs-h1: 32px; --fs-h2: 23px; }
  .panel { padding: 20px 18px; }
  .topbar { flex-direction: column; align-items: flex-start; gap: 12px; }
  .study-card { flex-direction: column; align-items: flex-start; gap: 18px; }
  .study-side { align-items: flex-start; }
  .page-head { flex-direction: column; align-items: flex-start; }
}
`;

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
  escala:
    "Vermelho e laranja apontam sinal quente ou ruim; amarelo e medio; limao e verde apontam sinal bom.",
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
            <a class="nav-cta" href="/new">
              Novo estudo
            </a>
          </nav>
        </header>
        <main>{props.children}</main>
        <p class="footer">
          Numeros medidos por um <Term of="decisor">decisor probabilistico</Term>. Texto redigido por um{" "}
          <Term of="LLM">LLM</Term> sob <Term of="guardrail">guardrail</Term>. As cores seguem a{" "}
          <Term of="escala">escala</Term> vermelho (ruim) a verde (bom).
        </p>
      </div>
    </body>
  </html>
);
