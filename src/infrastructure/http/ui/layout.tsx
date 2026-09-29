/**
 * Layout HTML da interface. Estilo embutido (nenhum asset externo) e um <main> para a pagina.
 */
import { html } from "hono/html";
import type { FC, PropsWithChildren } from "hono/jsx";

const styles = html`
  :root { color-scheme: light dark; --fg: #16181d; --muted: #5b6472; --line: #d5dae2; --bg: #ffffff; --accent:
  #1f5eff; } * { box-sizing: border-box; } body { margin: 0; padding: 1.5rem; background: var(--bg); color:
  var(--fg); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; } header, main { max-width:
  60rem; margin: 0 auto; } h1 { margin: 0; font-size: 1.5rem; } h1 a, nav a { color: var(--accent);
  text-decoration: none; } nav { margin: 0.25rem 0 1.5rem; color: var(--muted); } section { margin-bottom:
  2rem; } table { width: 100%; border-collapse: collapse; font-size: 0.9rem; } th, td { border-bottom: 1px
  solid var(--line); padding: 0.4rem 0.5rem; text-align: left; vertical-align: top; } .state { border-radius:
  0.25rem; padding: 0.1rem 0.35rem; font-size: 0.8rem; } .state-done { background: #dff5e1; color: #14602a; }
  .state-running { background: #fdf0cd; color: #7a5300; } .state-failed { background: #fbdada; color: #8c1c1c;
  } form label { display: block; margin-bottom: 0.6rem; } input[type="text"], input[type="number"] { display:
  block; width: 100%; max-width: 24rem; padding: 0.35rem; } #study-error { color: #8c1c1c; } pre { overflow-x:
  auto; padding: 0.75rem; border: 1px solid var(--line); border-radius: 0.35rem; background: #f6f7f9; } @media
  (prefers-color-scheme: dark) { :root { --fg: #e7e9ee; --muted: #9aa3b2; --line: #333a45; --bg: #14161a; }
  pre { background: #1c1f25; } }
`;

export const Layout: FC<PropsWithChildren<{ title: string }>> = (props) => (
  <html lang="pt-BR">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>{props.title}</title>
      <style>{styles}</style>
    </head>
    <body>
      <header>
        <h1>
          <a href="/">goodbizz</a>
        </h1>
        <nav>
          <a href="/">Estudos</a> · <a href="/about">Sobre a API</a>
        </nav>
      </header>
      <main>{props.children}</main>
    </body>
  </html>
);
