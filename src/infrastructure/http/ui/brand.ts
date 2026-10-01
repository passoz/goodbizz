/**
 * Marca do GoodBizz: ladrilho arredondado com tres barras ascendentes.
 *
 * As barras usam a ESCALA semantica do produto (vermelho -> amarelo -> verde), a mesma que colore
 * a legenda, o `rank-bar`, os tiers e os selos — da esquerda para a direita, da mesma forma que a
 * legenda da pagina "Como ler". A altura cresce junto com a cor, entao o desenho lê como "melhora",
 * que e o que o estudo mede.
 *
 * Unica fonte de verdade: o topbar renderiza estes mesmos elementos e `/favicon.svg` serializa o
 * documento inteiro a partir daqui. Os rasterios em `public/` (favicon.png, favicon.ico,
 * apple-touch-icon.png) sao derivados dele e precisam ser regerados quando a geometria muda:
 *
 *   bun -e 'import("./src/infrastructure/http/ui/brand.ts").then(m =>
 *     require("fs").writeFileSync("/tmp/goodbizz-favicon.svg", m.faviconSvg()))'
 *   rsvg-convert -w 64 -h 64 /tmp/goodbizz-favicon.svg -o public/favicon.png
 *   rsvg-convert -w 180 -h 180 --background-color=#14100f /tmp/goodbizz-favicon.svg \
 *     -o public/apple-touch-icon.png
 *   magick /tmp/goodbizz-favicon.svg -define icon:auto-resize=32,16 public/favicon.ico
 */

/** Ladrilho: quase-preto quente, o mesmo `--ink` do tema escuro. */
const TILE = { x: 2, y: 2, size: 60, radius: 16, fill: "#14100f" } as const;

/** Barras: largura 10, passo 15, base em y=49 — centradas no ladrilho de 64. */
const BARS = [
  { x: 12, y: 33, height: 16, fill: "#dd5855" },
  { x: 27, y: 24, height: 25, fill: "#bfc115" },
  { x: 42, y: 15, height: 34, fill: "#72ce3b" },
] as const;

const WIDTH = 64;

/** Elementos internos da marca, como string de SVG (o JSX do topbar os reutiliza via `raw`). */
export function markBody(): string {
  const tile = `<rect x="${TILE.x}" y="${TILE.y}" width="${TILE.size}" height="${TILE.size}" rx="${TILE.radius}" fill="${TILE.fill}"/>`;
  const bars = BARS.map(
    (bar) => `<rect x="${bar.x}" y="${bar.y}" width="10" height="${bar.height}" rx="5" fill="${bar.fill}"/>`,
  ).join("");
  return tile + bars;
}

/** Documento SVG autocontenido, servido em `/favicon.svg`. */
export function faviconSvg(): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${WIDTH}" ` +
    `width="${WIDTH}" height="${WIDTH}">${markBody()}</svg>`
  );
}
