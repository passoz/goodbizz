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
  --paper: #f7f3ed;
  --muted: #d9cfc6;
  --faint: #b5a89d;

  --r-panel: 26px;
  --r-surface: 18px;
  --r-control: 12px;
  --r-pill: 999px;

  /* Acento de acao: laranja do operador. A escala vermelho->verde segue exclusiva dos DADOS
     (indice, tier, dor, desvio, estado); o laranja marca o que e clicavel. */
  --accent: #d78133;
  --accent-hover: #e28f47;
  --accent-ink: #1c1206;

  /* Material: superficies grandes sao mais grossas (blur maior) que chips e controles. Receita
     Apple (vibrancy): desfoque + saturacao alta; o anel vem de sombra em vez de borda dura, para
     adaptar a qualquer fundo sem virar contorno branco. */
  --blur-panel: blur(28px) saturate(180%);
  --blur-chrome: blur(20px) saturate(180%);
  --ring: 0 0 0 1px oklch(1 0 0 / 0.09);
  --ring-strong: 0 0 0 1px oklch(1 0 0 / 0.16);
  --shadow-panel:
    var(--ring),
    0 1px 2px -1px oklch(0 0 0 / 0.55),
    0 28px 56px -28px oklch(0 0 0 / 0.75);
  --shadow-panel-hover:
    var(--ring-strong),
    0 2px 4px -2px oklch(0 0 0 / 0.6),
    0 36px 68px -30px oklch(0 0 0 / 0.82);
  --shadow-chrome: var(--ring), 0 18px 40px -22px oklch(0 0 0 / 0.7);

  --fs-micro: 13px;
  --fs-small: 15px;
  --fs-body: 17px;
  --fs-lead: 20px;
  --fs-h3: 19px;
  --fs-h2: 33px;
  --fs-h1: 47px;

  --mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  --sans: ui-sans-serif, system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

* { box-sizing: border-box; }

html { color-scheme: dark; }
html[data-theme="light"] { color-scheme: light; }

/* ── Tema claro ────────────────────────────────────────────────────────── */
/* O tema padrao (escuro) fica intacto: este bloco so reescreve superficie, linha, texto forte e os
   selos quando o atributo data-theme vale "light". O fundo quente e saturado continua sendo a fonte
   de cor do vidro — no claro ele entra com metade da forca, senao a pagina vira um adesivo colorido. */
html[data-theme="light"] {
  --ink: #f2ece3;
  --ink-2: #fbf8f3;
  --paper: #1c1613;
  --muted: #57493f;
  --faint: #7c6e63;
  --accent-ink: #2a1704;
  --ring: 0 0 0 1px oklch(0 0 0 / 0.08);
  --ring-strong: 0 0 0 1px oklch(0 0 0 / 0.14);
  --shadow-panel:
    var(--ring),
    0 1px 2px -1px oklch(0.3 0.03 60 / 0.22),
    0 26px 50px -28px oklch(0.3 0.03 60 / 0.34);
  --shadow-panel-hover:
    var(--ring-strong),
    0 2px 5px -2px oklch(0.3 0.03 60 / 0.26),
    0 34px 62px -30px oklch(0.3 0.03 60 / 0.4);
  --shadow-chrome: var(--ring), 0 16px 36px -22px oklch(0.3 0.03 60 / 0.3);
}
html[data-theme="light"] body::before {
  background:
    radial-gradient(54% 46% at 4% 2%, rgb(221 88 85 / .3), transparent 68%),
    radial-gradient(50% 44% at 98% 4%, rgb(215 129 51 / .28), transparent 68%),
    radial-gradient(52% 46% at 90% 92%, rgb(114 206 59 / .26), transparent 70%),
    radial-gradient(46% 40% at 4% 96%, rgb(191 193 21 / .24), transparent 72%),
    radial-gradient(78% 62% at 46% 48%, rgb(159 219 67 / .16), transparent 74%);
}
html[data-theme="light"] body::after {
  background: linear-gradient(180deg, rgb(255 252 247 / .42), rgb(255 252 247 / .72));
}
html[data-theme="light"] .glass {
  background:
    linear-gradient(140deg, oklch(1 0 0 / 0.72), oklch(1 0 0 / 0.44) 46%, oklch(1 0 0 / 0.6)),
    rgb(255 253 249 / 0.62);
  box-shadow:
    var(--shadow-panel),
    inset 0 1px 0 oklch(1 0 0 / 0.85);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  html[data-theme="light"] .glass { background: rgb(255 253 249 / 0.96); }
}
html[data-theme="light"] .topbar.glass {
  background: rgb(255 253 249 / 0.72);
  box-shadow:
    var(--shadow-chrome),
    inset 0 1px 0 oklch(1 0 0 / 0.9);
}
html[data-theme="light"] .nav a:hover,
html[data-theme="light"] .btn,
html[data-theme="light"] .chip,
html[data-theme="light"] .badge,
html[data-theme="light"] .metric,
html[data-theme="light"] .file,
html[data-theme="light"] .pain-row {
  background: oklch(0 0 0 / 0.045);
  box-shadow: inset 0 0 0 1px oklch(0 0 0 / 0.07);
}
html[data-theme="light"] .btn:hover,
html[data-theme="light"] .file:hover {
  background: oklch(0 0 0 / 0.08);
  box-shadow: inset 0 0 0 1px oklch(0 0 0 / 0.12);
}
html[data-theme="light"] .btn-primary {
  background: var(--accent);
  color: var(--accent-ink);
  box-shadow:
    inset 0 0 0 1px oklch(0 0 0 / 0.12),
    0 12px 26px -14px rgb(215 129 51 / 0.75);
}
html[data-theme="light"] .btn-ghost { background: transparent; box-shadow: inset 0 0 0 1px oklch(0 0 0 / 0.16); }
html[data-theme="light"] .field input[type="text"],
html[data-theme="light"] .field input[type="number"],
html[data-theme="light"] .field input[type="password"] {
  background: rgb(255 255 255 / 0.8);
  border-color: oklch(0 0 0 / 0.14);
  color: var(--paper);
}
html[data-theme="light"] .field input:focus { background: #fff; }
html[data-theme="light"] .file-ext { background: oklch(0 0 0 / 0.09); }
html[data-theme="light"] th,
html[data-theme="light"] td { border-bottom-color: oklch(0 0 0 / 0.1); }
html[data-theme="light"] tbody tr:hover { background: oklch(0 0 0 / 0.035); }
html[data-theme="light"] .brand h1,
html[data-theme="light"] h2,
html[data-theme="light"] .study-card h3,
html[data-theme="light"] .metric .value,
html[data-theme="light"] .score,
html[data-theme="light"] td.num,
html[data-theme="light"] .file-ext,
html[data-theme="light"] .legend dt,
html[data-theme="light"] .study-top b,
html[data-theme="light"] .term:hover { color: var(--paper); }
html[data-theme="light"] .tip { background: rgb(255 253 249 / 0.98); color: var(--paper); }
html[data-theme="light"] .tip::after { border-top-color: rgb(255 253 249 / 0.98); }
html[data-theme="light"] .b-red { color: #7d1d1a; background: rgb(221 88 85 / 0.16); box-shadow: inset 0 0 0 1px rgb(221 88 85 / 0.36); }
html[data-theme="light"] .b-orange { color: #7a4410; background: rgb(215 129 51 / 0.16); box-shadow: inset 0 0 0 1px rgb(215 129 51 / 0.36); }
html[data-theme="light"] .b-yellow { color: #5d5c0a; background: rgb(191 193 21 / 0.18); box-shadow: inset 0 0 0 1px rgb(191 193 21 / 0.4); }
html[data-theme="light"] .b-lime { color: #3f5c0d; background: rgb(159 219 67 / 0.2); box-shadow: inset 0 0 0 1px rgb(159 219 67 / 0.42); }
html[data-theme="light"] .b-green { color: #235710; background: rgb(114 206 59 / 0.2); box-shadow: inset 0 0 0 1px rgb(114 206 59 / 0.44); }
html[data-theme="light"] .alert { background: rgb(221 88 85 / 0.12); box-shadow: inset 0 0 0 1px rgb(221 88 85 / 0.4); color: #7d1d1a; }
html[data-theme="light"] #study-error { color: #8c2320; }
html[data-theme="light"] .term { border-bottom-color: oklch(0 0 0 / 0.4); }

/* ── Botao de tema (3 estados: auto, claro, escuro) ─────────────────────── */
.topbar-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.theme-toggle {
  display: inline-flex; align-items: center; gap: 2px; padding: 3px; border-radius: var(--r-pill);
  background: oklch(1 0 0 / 0.08); box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.1);
}
.theme-btn {
  appearance: none; border: 0; cursor: pointer; padding: 7px 13px; border-radius: var(--r-pill);
  font: 570 var(--fs-micro)/1 var(--sans); letter-spacing: 0.01em;
  color: var(--muted); background: transparent;
  transition-property: background-color, color, box-shadow; transition-duration: 150ms;
}
.theme-btn:hover { color: var(--paper); background: oklch(1 0 0 / 0.1); }
.theme-btn[aria-pressed="true"] {
  color: var(--accent-ink); background: var(--accent); font-weight: 700;
  box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.24);
}
html[data-theme="light"] .theme-toggle { background: oklch(0 0 0 / 0.05); box-shadow: inset 0 0 0 1px oklch(0 0 0 / 0.08); }
html[data-theme="light"] .theme-btn { color: var(--muted); }
html[data-theme="light"] .theme-btn:hover { color: var(--paper); background: oklch(0 0 0 / 0.07); }
html[data-theme="light"] .theme-btn[aria-pressed="true"] { color: var(--accent-ink); }

/* ── Progresso do estudo em execucao ───────────────────────────────────── */
.progress-head { display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
.progress-phase { font: 700 var(--fs-small)/1 var(--mono); color: var(--paper); font-variant-numeric: tabular-nums; }
.progress-elapsed {
  font: 560 var(--fs-micro)/1 var(--sans); color: var(--muted); letter-spacing: 0.01em;
}
.progress-elapsed.progress-stalled { color: var(--r-orange); }
.progress-steps { display: flex; gap: 6px; margin: 14px 0 0; padding: 0; list-style: none; }
.progress-steps li {
  flex: 1; height: 6px; border-radius: var(--r-pill); background: oklch(1 0 0 / 0.14);
  transition-property: background-color; transition-duration: 200ms;
}
.progress-steps li[data-done="1"] { background: var(--r-lime); }
.progress-steps li[data-live="1"] { background: var(--r-orange); }
.progress-label {
  margin: 14px 0 0; font-size: var(--fs-body); line-height: 1.45; font-weight: 560; color: var(--paper);
}
.progress-step-line {
  margin: 8px 0 0; font: var(--fs-small)/1.5 var(--mono); color: var(--paper);
  overflow-wrap: anywhere; min-height: 1.5em;
}
.progress-note { margin: 8px 0 0; font-size: var(--fs-micro); color: var(--muted); }
.progress-stalled { color: var(--r-orange); }
html[data-theme="light"] .progress-steps li { background: oklch(0 0 0 / 0.1); }
html[data-theme="light"] .progress-steps li[data-done="1"] { background: var(--r-green); }
html[data-theme="light"] .progress-steps li[data-live="1"] { background: var(--r-orange); }

/* ── Ideia clicavel no ranking ─────────────────────────────────────────── */
.idea-link {
  display: inline-flex; align-items: baseline; gap: 8px; color: var(--paper);
  border-bottom: 1px solid oklch(1 0 0 / 0.3);
  transition-property: border-color, color; transition-duration: 150ms;
}
.idea-link:hover, .idea-link:focus-visible { color: var(--accent-hover); border-bottom-color: var(--accent); }
.idea-chip {
  font: 660 var(--fs-micro)/1 var(--sans); color: var(--accent-ink); background: var(--accent);
  padding: 4px 9px; border-radius: var(--r-pill); opacity: .5;
  transition-property: opacity; transition-duration: 150ms;
}
.idea-link:hover .idea-chip, .idea-link:focus-visible .idea-chip { opacity: 1; }
html[data-theme="light"] .idea-link { border-bottom-color: oklch(0 0 0 / 0.3); }

/* ── Modal do plano (dialog nativo: ESC, foco e backdrop vem do navegador) */
.modal {
  width: min(920px, 92vw); max-height: 86vh; margin: auto; padding: 0; border: 0;
  border-radius: var(--r-panel); color: var(--paper);
  background: rgb(23 17 16 / 0.97);
  box-shadow:
    0 0 0 1px oklch(1 0 0 / 0.12),
    0 44px 84px -32px rgb(0 0 0 / 0.9);
  overflow: hidden;
}
.modal[open] { display: flex; flex-direction: column; }
.modal-confirm { width: min(520px, 92vw); }
.modal::backdrop { background: rgb(10 7 7 / 0.66); backdrop-filter: blur(4px); }
.modal-head {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: 18px;
  padding: 18px 22px; border-bottom: 1px solid oklch(1 0 0 / 0.1);
}
.modal-head h3 { margin: 0; }
.modal-close {
  appearance: none; cursor: pointer; border: 0; padding: 10px 18px; border-radius: var(--r-pill);
  font: 620 var(--fs-small)/1 var(--sans); color: var(--paper); background: oklch(1 0 0 / 0.1);
  box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.14);
  transition-property: background-color; transition-duration: 150ms;
}
.modal-close:hover { background: oklch(1 0 0 / 0.18); }
.modal-close:active { scale: 0.96; }
.modal-body { padding: 22px 26px 32px; overflow: auto; overscroll-behavior: contain; }
.modal-loading { margin: 0; color: var(--muted); }

/* ── Markdown interpretado (mesmo mdToHtml do HTML/PDF exportado) ──────── */
.plan-body { font-size: var(--fs-body); line-height: 1.65; max-width: 76ch; }
.plan-body h1 { font-size: 1.5em; margin: 0 0 0.6em; letter-spacing: -0.02em; color: #fff; }
.plan-body h2 { font-size: 1.24em; margin: 1.7em 0 0.5em; color: #fff; letter-spacing: -0.015em; }
.plan-body h3 { font-size: 1.08em; margin: 1.4em 0 0.4em; }
.plan-body p { margin: 0.85em 0; }
.plan-body ul, .plan-body ol { margin: 0.85em 0; padding-left: 1.5em; }
.plan-body li { margin: 0.32em 0; }
.plan-body strong { color: #fff; font-weight: 660; }
.plan-body code { font: 0.9em var(--mono); background: oklch(1 0 0 / 0.1); padding: 0.14em 0.4em; border-radius: 6px; }
.plan-body pre {
  margin: 1em 0; padding: 14px 16px; border-radius: var(--r-control); overflow-x: auto;
  background: rgb(10 8 8 / 0.5); box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.08);
}
.plan-body pre code { background: none; padding: 0; }
.plan-body blockquote {
  margin: 1.1em 0; padding: 0.7em 1.1em; border-left: 4px solid var(--accent);
  border-radius: 0 var(--r-control) var(--r-control) 0; background: oklch(1 0 0 / 0.06);
}
.plan-body hr { border: 0; border-top: 1px solid oklch(1 0 0 / 0.14); margin: 1.7em 0; }
.plan-body a { color: var(--accent-hover); text-decoration: underline; }
.plan-body table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: var(--fs-small); }
.plan-body th, .plan-body td {
  padding: 10px 12px; text-align: left; vertical-align: top;
  border-bottom: 1px solid oklch(1 0 0 / 0.12);
}
.plan-body th { color: var(--muted); font-size: var(--fs-micro); font-weight: 620; }

html[data-theme="light"] .modal { background: rgb(255 253 249 / 0.98); box-shadow: 0 0 0 1px oklch(0 0 0 / 0.1), 0 44px 84px -34px oklch(0.3 0.03 60 / 0.42); }
html[data-theme="light"] .modal::backdrop { background: rgb(43 32 22 / 0.42); }
html[data-theme="light"] .modal-head { border-bottom-color: oklch(0 0 0 / 0.1); }
html[data-theme="light"] .modal-close { background: oklch(0 0 0 / 0.06); box-shadow: inset 0 0 0 1px oklch(0 0 0 / 0.1); }
html[data-theme="light"] .modal-close:hover { background: oklch(0 0 0 / 0.11); }
html[data-theme="light"] .plan-body h1,
html[data-theme="light"] .plan-body h2,
html[data-theme="light"] .plan-body strong { color: var(--paper); }
html[data-theme="light"] .plan-body code { background: oklch(0 0 0 / 0.06); }
html[data-theme="light"] .plan-body pre { background: oklch(0 0 0 / 0.04); box-shadow: inset 0 0 0 1px oklch(0 0 0 / 0.08); }
html[data-theme="light"] .plan-body blockquote { background: oklch(0 0 0 / 0.04); }
html[data-theme="light"] .plan-body hr,
html[data-theme="light"] .plan-body th,
html[data-theme="light"] .plan-body td { border-color: oklch(0 0 0 / 0.1); }

body {
  margin: 0;
  min-height: 100dvh;
  background: var(--ink);
  color: var(--paper);
  font: var(--fs-body)/1.65 var(--sans);
  /* Vibrancy: sobre material translucido o texto precisa de contraste alto e um leve tracking,
     em vez de cinza chapado. */
  letter-spacing: 0.002em;
  font-optical-sizing: auto;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* Fundo quente e saturado: e ele que da corpo ao vidro. Sem cor atras, vidro nao existe. */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(54% 46% at 4% 2%, rgb(221 88 85 / .6), transparent 68%),
    radial-gradient(50% 44% at 98% 4%, rgb(215 129 51 / .54), transparent 68%),
    radial-gradient(52% 46% at 90% 92%, rgb(114 206 59 / .5), transparent 70%),
    radial-gradient(46% 40% at 4% 96%, rgb(191 193 21 / .46), transparent 72%),
    radial-gradient(78% 62% at 46% 48%, rgb(159 219 67 / .3), transparent 74%);
}
body::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background: linear-gradient(180deg, rgb(20 16 15 / .12), rgb(20 16 15 / .38));
}

a { color: inherit; text-decoration: none; }
:focus-visible { outline: 3px solid var(--r-lime); outline-offset: 3px; border-radius: 8px; }

.shell { max-width: 1180px; margin: 0 auto; padding: 26px 22px 76px; }

/* ── Cabecalho ─────────────────────────────────────────────────────────── */
.topbar {
  display: flex; align-items: center; justify-content: space-between; gap: 18px;
  padding: 12px 18px; margin-bottom: 30px;
}
/* Chrome estrutural: material mais pesado (base mais escura, desfoque menor) que os paineis de
   conteudo. Peso de material comunica hierarquia. */
.topbar.glass {
  background: rgb(18 13 12 / 0.62);
  box-shadow:
    var(--shadow-chrome),
    inset 0 1px 0 oklch(1 0 0 / 0.14);
  backdrop-filter: var(--blur-chrome);
  -webkit-backdrop-filter: var(--blur-chrome);
}
.brand { display: flex; align-items: baseline; gap: 12px; }
.brand h1 { margin: 0; font-size: 25px; letter-spacing: -.025em; color: #fff; font-weight: 680; }
/* A marca e a volta para a lista: link discreto (sem sublinhado, cor herdada) que nao mexe no
   alinhamento do topbar. O foco visivel continua vindo do :focus-visible global. */
.brand h1 a { color: inherit; text-decoration: none; cursor: pointer; }
.brand h1 a:hover { color: var(--accent-hover); }
.nav { display: flex; align-items: center; gap: 6px; }
.nav a {
  padding: 9px 16px; border-radius: var(--r-pill); font-size: var(--fs-small); font-weight: 560;
  color: var(--paper); letter-spacing: 0.006em;
  transition-property: background-color, box-shadow;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
}
.nav a:hover { background: oklch(1 0 0 / 0.12); box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.14); }
.nav a.nav-cta {
  background: var(--accent);
  color: var(--accent-ink); font-weight: 640;
  box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.26);
}
.nav a.nav-cta:hover { background: var(--accent-hover); box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.34); }

/* ── Vidro ─────────────────────────────────────────────────────────────── */
/* Material, nao contorno. Tres decisoes carregam o efeito:
   1. o filme branco e fraco e o material e escuro o bastante para o texto manter contraste;
   2. o desfoque e alto e saturado, entao a cor do fundo atravessa e o vidro ganha vida;
   3. o anel e uma sombra de 1px (alpha 0.09), nao uma borda branca solida, que era o que deixava
      a superficie com cara de adesivo. */
.glass {
  background:
    linear-gradient(140deg, oklch(1 0 0 / 0.1), oklch(1 0 0 / 0.02) 46%, oklch(1 0 0 / 0.06)),
    rgb(26 18 16 / 0.3);
  border: 0;
  border-radius: var(--r-panel);
  box-shadow:
    var(--shadow-panel),
    inset 0 1px 0 oklch(1 0 0 / 0.16);
}
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass {
    backdrop-filter: var(--blur-panel);
    -webkit-backdrop-filter: var(--blur-panel);
  }
}
/* Sem desfoque, o filme branco teria de carregar tudo sozinho: sobe a opacidade e para de
   fingir transparencia. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .glass {
    background: rgb(29 23 23 / 0.94);
  }
}
.panel { padding: 24px 26px; margin-bottom: 22px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 18px; flex-wrap: wrap; }
.panel-head h3 { margin: 0; }
.panel-head .btn { padding: 10px 18px; font-size: var(--fs-small); }
h2 { font-size: var(--fs-h2); letter-spacing: -.025em; color: #fff; font-weight: 650; margin: 0 0 8px; }
h3 { font-size: var(--fs-h3); color: var(--paper); font-weight: 620; margin: 28px 0 14px; }
.lead { font-size: var(--fs-lead); color: var(--paper); max-width: 62ch; margin: 0; }
.sub { font-size: var(--fs-small); color: var(--muted); max-width: 72ch; margin: 8px 0 0; }

/* ── Cabecalho de pagina ───────────────────────────────────────────────── */
.page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 22px; }
.page-head h2 { margin: 0; }

/* ── Cabecalho do estudo: titulo a esquerda, acoes a direita ───────────── */
/* O download do estudo inteiro e uma acao de nivel de pagina, nao um detalhe da lista de
   arquivos: ele vive aqui, alinhado ao titulo. */
.study-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 26px; }
.study-head-main { min-width: 0; }
.study-head .sub { margin-top: 10px; }
.study-head-actions { display: flex; align-items: center; gap: 10px; flex: none; flex-wrap: wrap; }

/* ── Acoes ─────────────────────────────────────────────────────────────── */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 9px; white-space: nowrap;
  padding: 13px 24px; border-radius: var(--r-pill); cursor: pointer;
  font: 640 var(--fs-body)/1 var(--sans); color: var(--paper); letter-spacing: 0.004em;
  background: oklch(1 0 0 / 0.1); border: 0;
  box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.12);
  transition-property: background-color, box-shadow, scale;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
}
.btn:hover { background: oklch(1 0 0 / 0.16); box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.2); }
/* Feedback no pressionar, imediato: 0.96 e o valor que da tato sem exagero. */
.btn:active { scale: 0.96; transition-duration: 100ms; }
.btn-primary {
  background: var(--accent);
  color: var(--accent-ink);
  box-shadow:
    inset 0 0 0 1px oklch(1 0 0 / 0.26),
    0 14px 30px -14px rgb(215 129 51 / 0.7);
}
.btn-primary:hover { background: var(--accent-hover); }
.btn-ghost { background: transparent; box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.22); }
.btn-danger {
  background: var(--r-red);
  color: #2a0d0c;
  box-shadow:
    inset 0 0 0 1px oklch(0 0 0 / 0.2),
    0 14px 30px -14px rgb(221 88 85 / 0.7);
}
.btn-danger:hover { background: #e26865; }
.btn-sm { padding: 9px 16px; font-size: var(--fs-micro); }
.btn[disabled] { opacity: .6; cursor: progress; }

/* ── Formulario ────────────────────────────────────────────────────────── */
.form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 20px; }
.field { display: flex; flex-direction: column; gap: 7px; }
.field label { font-size: var(--fs-small); color: var(--paper); font-weight: 580; }
.field input[type="text"], .field input[type="number"], .field input[type="password"] {
  width: 100%; padding: 13px 15px; color: var(--paper); font: var(--fs-body)/1.4 var(--sans);
  background: rgb(10 8 8 / 0.42); border: 1px solid oklch(1 0 0 / 0.16);
  border-radius: var(--r-control);
}
.field input::placeholder { color: var(--faint); }
.field input:hover { border-color: oklch(1 0 0 / 0.24); }
.field input:focus {
  border-color: rgb(159 219 67 / 0.85);
  background: rgb(10 8 8 / 0.6);
  box-shadow: 0 0 0 3px rgb(159 219 67 / 0.22);
}
.field .hint { color: var(--muted); }
.check { display: flex; align-items: center; gap: 10px; font-size: var(--fs-small); color: var(--paper); }
.check input { width: 17px; height: 17px; accent-color: var(--r-lime); }
.form-actions { display: flex; align-items: center; gap: 16px; margin-top: 26px; flex-wrap: wrap; }
/* Form de renomear no cabecalho do estudo: com JS o campo inline fica escondido (o gatilho abre
   o dialogo); sem JS o noscript do layout o revela e ele e o campo de verdade. */
.rename-form { display: flex; align-items: center; gap: 8px; }
.rename-inline {
  display: none;
  width: 190px; padding: 9px 12px; border-radius: var(--r-control); color: var(--paper);
  font: var(--fs-small)/1.3 var(--sans); background: rgb(10 8 8 / 0.42);
  border: 1px solid oklch(1 0 0 / 0.16);
}
.rename-inline:focus { border-color: rgb(159 219 67 / 0.85); box-shadow: 0 0 0 3px rgb(159 219 67 / 0.22); }
html[data-theme="light"] .rename-inline {
  background: rgb(255 255 255 / 0.8);
  border-color: oklch(0 0 0 / 0.14);
  color: var(--paper);
}
#study-error, #run-error { color: #ffd2cf; font-size: var(--fs-small); margin: 0; }
#study-error:empty, #run-error:empty, #rename-error:empty { display: none; }

/* ── Hints e selos ─────────────────────────────────────────────────────── */
.hint { font-size: var(--fs-micro); color: var(--muted); font-weight: 480; letter-spacing: 0.012em; }
.badge {
  display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px;
  border-radius: var(--r-pill); font-size: var(--fs-micro); font-weight: 660; letter-spacing: 0.012em;
  color: var(--paper); background: oklch(1 0 0 / 0.1);
  box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.12);
}
.b-red { color: #ffdbd9; background: rgb(221 88 85 / 0.34); box-shadow: inset 0 0 0 1px rgb(221 88 85 / 0.5); }
.b-orange { color: #ffe6cd; background: rgb(215 129 51 / 0.34); box-shadow: inset 0 0 0 1px rgb(215 129 51 / 0.5); }
.b-yellow { color: #f8f7c4; background: rgb(191 193 21 / 0.32); box-shadow: inset 0 0 0 1px rgb(191 193 21 / 0.48); }
.b-lime { color: #eefbd6; background: rgb(159 219 67 / 0.32); box-shadow: inset 0 0 0 1px rgb(159 219 67 / 0.5); }
.b-green { color: #e4fbdb; background: rgb(114 206 59 / 0.34); box-shadow: inset 0 0 0 1px rgb(114 206 59 / 0.52); }
.tier { font: 700 var(--fs-small)/1 var(--mono); padding: 6px 13px; border-radius: var(--r-pill); color: #16210c; }
.tier-A { background: var(--r-green); }
.tier-B { background: var(--r-lime); }
.tier-C { background: var(--r-yellow); }

/* ── Cartoes de estudo: a entrada e o cartao inteiro ───────────────────── */
.studies { display: grid; gap: 16px; list-style: none; padding: 0; margin: 0; }
.study-card {
  position: relative;
  display: flex; align-items: center; justify-content: space-between; gap: 26px;
  padding: 22px 26px; border-radius: var(--r-panel);
  transition-property: transform, box-shadow;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
}
/* Link esticado: o titulo carrega o href e o ::after cobre o cartao inteiro, entao qualquer
   clique abre o estudo sem perder o alvo real para leitor de tela e teclado. */
.stretch::after { content: ""; position: absolute; inset: 0; z-index: 1; border-radius: inherit; }
.stretch:focus-visible { outline: none; }
.stretch:focus-visible::after { outline: 3px solid var(--r-lime); outline-offset: 3px; }
.study-card .term, .study-card .badge, .study-card .delete-form { position: relative; z-index: 2; }
.study-card .open-cta { pointer-events: none; }
.study-card:hover {
  transform: translateY(-2px);
  box-shadow:
    var(--shadow-panel-hover),
    inset 0 1px 0 oklch(1 0 0 / 0.2);
}
.study-card h3 { margin: 0; font-size: 24px; color: #fff; letter-spacing: -.02em; }
.study-meta { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0; }
.chip {
  font-size: var(--fs-micro); color: var(--paper); padding: 5px 11px; border-radius: var(--r-pill);
  background: oklch(1 0 0 / 0.09); box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.08);
  letter-spacing: 0.012em;
}
.study-top { margin: 12px 0 0; font-size: var(--fs-small); color: var(--muted); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.study-top b { color: #fff; font-weight: 620; }
.study-id { font: var(--fs-micro)/1 var(--mono); color: var(--faint); margin: 10px 0 0; }
.study-side { display: flex; flex-direction: column; align-items: flex-end; gap: 12px; flex: none; }
.study-score { display: flex; align-items: center; gap: 12px; }
.score { font: 700 37px/1 var(--mono); font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
.score-side { display: flex; flex-direction: column; align-items: flex-start; gap: 5px; }
.score-side .hint { max-width: 18ch; }
.open-cta {
  display: inline-flex; align-items: center; gap: 8px; padding: 11px 18px; border-radius: var(--r-pill);
  font-size: var(--fs-small); font-weight: 640; color: var(--accent-ink);
  background: var(--accent);
  box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.24);
}
.study-card:hover .open-cta { background: var(--accent-hover); }

/* ── Metricas ──────────────────────────────────────────────────────────── */
.metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(196px, 1fr)); gap: 14px; list-style: none; padding: 0; margin: 0; }
.metric {
  padding: 16px 18px; border-radius: var(--r-surface); position: relative;
  background: oklch(1 0 0 / 0.08); box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.07);
}
/* A barra de tom acompanha o raio do canto (era overflow: hidden no card, que recortava o
   tooltip do glossario — o balao vive ACIMA do elemento). */
.metric::before {
  content: ""; position: absolute; inset: 0 auto 0 0; width: 4px;
  background: var(--tone, rgb(255 255 255 / .2));
  border-radius: var(--r-surface) 0 0 var(--r-surface);
}
.metric-label { display: block; color: var(--paper); font-size: var(--fs-small); }
.metric .value { display: block; margin-top: 4px; font: 700 30px/1.15 var(--mono); color: #fff; font-variant-numeric: tabular-nums; }
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
th, td { padding: 14px 16px; text-align: left; border-bottom: 1px solid rgb(255 255 255 / .12); vertical-align: top; }
th { color: var(--muted); font-weight: 620; font-size: var(--fs-micro); letter-spacing: .02em; }
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
  display: flex; align-items: flex-start; gap: 12px; padding: 13px 16px; border-radius: var(--r-surface);
  background: oklch(1 0 0 / 0.07); box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.07);
  font-size: var(--fs-small);
  transition-property: background-color, box-shadow;
  transition-duration: 150ms;
  transition-timing-function: ease-out;
}
.file:hover { background: oklch(1 0 0 / 0.14); box-shadow: inset 0 0 0 1px oklch(1 0 0 / 0.16); }
.file-path { overflow-wrap: anywhere; }
.file-ext {
  flex: none; font: 700 var(--fs-micro)/1 var(--mono); padding: 5px 8px; border-radius: 7px;
  background: rgb(255 255 255 / .16); color: #fff;
}

/* ── Leitor do plano ───────────────────────────────────────────────────── */
/* Removido: o plano da melhor ideia deixou de ser renderizado na pagina. Os mesmos markdown
   continuam baixaveis na secao de artefatos (e no .zip). */

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
.alert {
  padding: 15px 18px; border-radius: var(--r-surface);
  background: rgb(221 88 85 / 0.2);
  box-shadow: inset 0 0 0 1px rgb(221 88 85 / 0.5);
  border: 0;
  color: #ffdbd9;
}
.footer { margin-top: 36px; color: var(--muted); font-size: var(--fs-micro); text-align: center; }

/* ── Glossario: caixa de explicacao ao passar o mouse ou focar um termo ── */
.has-tip { position: relative; }
.term { border-bottom: 1px dotted rgb(255 255 255 / .5); cursor: help; }
.term:hover { border-bottom-color: var(--r-lime); color: #fff; }
.tip {
  position: absolute; left: 0; bottom: calc(100% + 10px); z-index: 40;
  width: max-content; min-width: 190px; max-width: min(310px, 78vw);
  padding: 10px 13px; border-radius: var(--r-control);
  background: rgb(18 14 13 / 0.97); color: var(--paper);
  box-shadow:
    0 0 0 1px oklch(1 0 0 / 0.14),
    0 24px 48px -22px rgb(0 0 0 / 0.95);
  border: 0;
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

/* Preferencia do usuario por menos transparencia: sobe a opacidade e larga o desfoque, sem perder
   o anel que separa as superficies. */
@media (prefers-reduced-transparency: reduce) {
  .glass, .topbar.glass {
    background: var(--ink-2);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .metric, .file, .chip, .badge { background: rgb(29 23 23 / 0.92); }
}

@media (max-width: 760px) {
  :root { --fs-h1: 34px; --fs-h2: 26px; }
  .panel { padding: 20px 18px; }
  .topbar { flex-direction: column; align-items: flex-start; gap: 12px; }
  .study-card { flex-direction: column; align-items: flex-start; gap: 18px; }
  .study-side { align-items: flex-start; }
  .page-head { flex-direction: column; align-items: flex-start; }
  .study-head { flex-direction: column; gap: 18px; }
}
`;

export const GLOSSARY: Record<string, string> = {
  "Índice de Ação":
    "Média entre fit e facilidade de venda. Vai de 0 a 2, e maior é melhor. É o critério de priorização entre as ideias.",
  Tier: "Faixa de prioridade: A a partir de 1.84, B a partir de 1.60, C abaixo disso.",
  fit: "Aderência ao balcão. 2 = resolve a correria do dia sem exigir mudança de hábito; 0 = exige escala corporativa.",
  venda:
    "Facilidade comercial. 2 = ataca perda de dinheiro ou de imagem agora; 0 = benefício invisível no curto prazo.",
  disrupção:
    "Grau de inovação no setor. 2 = muda o modelo de operação; 0 = apenas automatiza o que já existe.",
  WTP: "Willingness to pay, ou disposição a pagar: probabilidade de 0 a 1 de o dono pagar o ticket mensal informado.",
  dor: "Natureza da consequência para o dono: dinheiro direto, reputação pública ou desorganização interna.",
  FORTE:
    "Dor com dono claro: escore de 0.65 ou mais é dominante sobre a dor interna. É o sinal que interessa.",
  FRACA:
    "Dor interna de organização: não tira dinheiro nem imagem, então o dono não sente urgência de pagar.",
  INSTAVEL:
    "As paráfrases da mesma pergunta divergem (desvio acima de 0.15): a medição não é confiável, revise à mão.",
  INDETERMINADO: "Zona cinzenta entre dor forte e dor interna. Decida olhando o caso, não pelo número.",
  solo: "Suporte solo: probabilidade de um consultor manter 30 clientes sem colapsar no atendimento.",
  meta30: "Probabilidade de 30 clientes pagantes em 24 meses. O plano assume 10 a 15 como base, não 30.",
  desvio:
    "Discrepância entre as três paráfrases da mesma pergunta. Menor é melhor; acima de 0.15 a leitura vira instável.",
  ticket:
    "Valor mensal considerado na medição da disposição a pagar. Funciona como teto da precificação, nunca como piso.",
  "System One":
    "Decisor probabilístico externo, treinado para medir chance de compra em vez de escrever prosa convincente.",
  LLM: "Modelo de linguagem. Redige o brief e os planos, mas é proibido de criar número de mercado.",
  guardrail:
    "Conferência automática que exige os números medidos no texto final e marca estimativa como [INFERENCE].",
  decisor: "Endpoint externo que responde probabilidades por pergunta. Não há inferência local na imagem.",
  CSRF: "Proteção que exige mesma origem e token assinado em toda ação da interface que muda estado.",
  paráfrases:
    "A mesma pergunta escrita de três formas diferentes. A concordância entre elas mede a estabilidade da medição.",
  "escolha forçada":
    "Método de dor em que o decisor escolhe entre três consequências concretas, sem a opção tecnologia.",
  "modo simulado":
    "Roda com LLM e decisor simulados: sem credenciais e sem custo, mas a saída não tem valor de mercado.",
  "[INFERENCE]":
    "Marca de estimativa escrita pelo modelo. Não é dado pesquisado nem número medido pelo decisor.",
  escala:
    "Vermelho e laranja apontam sinal quente ou ruim; amarelo é médio; limão e verde apontam sinal bom.",
  tokens: "Contagem de tokens informada pelos provedores: entrada é o texto enviado, saída é o texto gerado.",
  custo:
    "Estimativa a partir dos tokens medidos e dos preços de tabela configurados; não é a fatura do provedor.",
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

/**
 * Aplica o tema escolhido ANTES do primeiro paint (senao a pagina pisca no tema errado ao
 * carregar). "auto" nao escreve atributo: o CSS cai no tema escuro padrao e o sistema decide
 * quando o usuario nunca escolheu.
 */
const THEME_BOOT = `
(function () {
  try {
    var saved = localStorage.getItem("goodbizz-theme");
    if (saved === "light" || saved === "dark") {
      document.documentElement.setAttribute("data-theme", saved);
    }
  } catch (error) {
    /* modo privado sem storage: segue o padrao */
  }
})();`;

/** Liga os tres botoes, persiste a escolha e acompanha o sistema enquanto estiver em "auto". */
const THEME_WIRE = `
(function () {
  var KEY = "goodbizz-theme";
  var buttons = Array.prototype.slice.call(document.querySelectorAll(".theme-btn"));
  function stored() {
    try {
      var value = localStorage.getItem(KEY);
      return value === "light" || value === "dark" ? value : "auto";
    } catch (error) {
      return "auto";
    }
  }
  function apply(mode) {
    var root = document.documentElement;
    if (mode === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", mode);
    buttons.forEach(function (button) {
      button.setAttribute("aria-pressed", button.dataset.themeSet === mode ? "true" : "false");
    });
  }
  apply(stored());
  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      var mode = button.dataset.themeSet;
      try {
        if (mode === "auto") localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, mode);
      } catch (error) {
        /* sem storage a escolha vale so nesta pagina */
      }
      apply(mode);
    });
  });
  if (window.matchMedia) {
    var query = window.matchMedia("(prefers-color-scheme: light)");
    var onChange = function () {
      if (stored() === "auto") apply("auto");
    };
    if (query.addEventListener) query.addEventListener("change", onChange);
    else if (query.addListener) query.addListener(onChange);
  }
})();`;

export const Layout: FC<PropsWithChildren<{ title: string }>> = (props) => (
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{props.title}</title>
      {/* `raw` e obrigatorio: dentro de <style>/<script> o JSX escaparia `>` e `"`, quebrando
          combinadores filho e valores com aspas (ex.: content). */}
      <script>{raw(THEME_BOOT)}</script>
      <style>{raw(GLASS_CSS)}</style>
      {/* Sem JS o campo de renomear volta a aparecer: ele e o formulario de verdade nesse caso. */}
      <noscript>
        <style>{raw(".rename-inline { display: inline-block; }")}</style>
      </noscript>
    </head>
    <body>
      <div class="shell">
        <header class="topbar glass">
          <div class="brand">
            <h1>
              <a href="/">GoodBizz</a>
            </h1>
          </div>
          <div class="topbar-actions">
            <div class="theme-toggle" role="group" aria-label="Tema da interface">
              <button type="button" class="theme-btn" data-theme-set="auto" aria-pressed="false">
                Auto
              </button>
              <button type="button" class="theme-btn" data-theme-set="light" aria-pressed="false">
                Claro
              </button>
              <button type="button" class="theme-btn" data-theme-set="dark" aria-pressed="false">
                Escuro
              </button>
            </div>
            <nav class="nav">
              <a href="/">Estudos</a>
              <a href="/como-ler">Como ler</a>
              <a href="/settings">Configurações</a>
              <a href="/about">API</a>
              <a class="nav-cta" href="/new">
                Novo estudo
              </a>
            </nav>
          </div>
        </header>
        <main>{props.children}</main>
        <p class="footer">
          Números medidos por um <Term of="decisor">decisor probabilístico</Term>. Texto redigido por um{" "}
          <Term of="LLM">LLM</Term> sob <Term of="guardrail">guardrail</Term>. As cores seguem a{" "}
          <Term of="escala">escala</Term> vermelho (ruim) a verde (bom).
        </p>
      </div>
      <script>{raw(THEME_WIRE)}</script>
    </body>
  </html>
);
