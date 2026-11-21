// Generates the relvista logo SVGs into brand/.
//
// Usage: node brand/source/final.mjs <Manrope.ttf>   (or set MANROPE_TTF)
// Needs fontkit on NODE_PATH; see brand/README.md. PNGs come from rasterize.mjs.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { outline } from './outline.mjs';

const fontPath = process.argv[2] ?? process.env.MANROPE_TTF;
if (!fontPath) {
  console.error('Usage: node brand/source/final.mjs <Manrope.ttf>  (or set MANROPE_TTF)');
  process.exit(1);
}
const out = fileURLToPath(new URL('..', import.meta.url));
// Round-trip through JSON, as the CLI version of outline.mjs did, so output stays identical.
const txt = (t, w, size) => JSON.parse(JSON.stringify(outline(fontPath, t, w, size)));
const BLUE = '#2f6fed',
  TEAL = '#14a38b',
  NAVY = '#0e1a33';
const mark = (fg, accent) =>
  `<path d="M10 26V15.5C10 10.5 13 8 17 8" stroke="${fg}" stroke-width="6" stroke-linecap="round" fill="none"/><circle cx="25" cy="8" r="3.4" fill="${accent}"/>`;
const w = (name, svg) => writeFileSync(`${out}${name}`, svg);

// mark only (transparent), for light and dark backgrounds
w(
  'mark.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">${mark(BLUE, TEAL)}</svg>\n`,
);
w(
  'mark-white.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">${mark('#ffffff', TEAL)}</svg>\n`,
);
// favicon: the mark, transparent, cropped to it; a lighter blue in dark browser chrome
w(
  'favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4.5 3.5 26 26" fill="none"><style>@media (prefers-color-scheme: dark){.r{stroke:#5b9bff}}</style>${mark(BLUE, TEAL).replace('<path ', '<path class="r" ')}</svg>\n`,
);
// app icons (apple-touch, manifest): the mark on white, centred; maskable keeps it in the safe zone
const tile = (k) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#ffffff"/><g transform="translate(16 16) scale(${k}) translate(-17.7 -16.8)">${mark(BLUE, TEAL)}</g></svg>\n`;
w('source/tile.svg', tile(0.72));
w('source/tile-maskable.svg', tile(0.55));

// lockups: mark + outlined wordmark
const W = txt('relvista', 700, 100);
const lock = (fg, accent, text) => {
  const width = 20 + 104 + 26 + W.width + 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(1)} 120" fill="none"><g transform="translate(20 8) scale(3.25)">${mark(fg, accent)}</g><path transform="translate(150 84)" fill="${text}" d="${W.d}"/></svg>\n`;
};
w('logo-light.svg', lock(BLUE, TEAL, NAVY));
w('logo-dark.svg', lock('#ffffff', TEAL, '#ffffff'));
// Banners, social preview and avatars are rendered in the site style by render-org.mjs.
