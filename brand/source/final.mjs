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
const grad = `<linearGradient id="rvg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BLUE}"/><stop offset="1" stop-color="${TEAL}"/></linearGradient>`;
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
// favicon: gradient rounded tile
w(
  'favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs>${grad}</defs><rect width="32" height="32" rx="7" fill="url(#rvg)"/><g transform="translate(4.5 4.5) scale(0.72)">${mark('#ffffff', '#ffffff')}</g></svg>\n`,
);
// avatar: full-bleed square
w(
  'avatar.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs>${grad}</defs><rect width="512" height="512" fill="url(#rvg)"/><g transform="translate(82 82) scale(10.75)">${mark('#ffffff', '#ffffff')}</g></svg>\n`,
);

// lockups: mark + outlined wordmark
const W = txt('relvista', 700, 100);
const lock = (fg, accent, text) => {
  const width = 20 + 104 + 26 + W.width + 20;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width.toFixed(1)} 120" fill="none"><g transform="translate(20 8) scale(3.25)">${mark(fg, accent)}</g><path transform="translate(150 84)" fill="${text}" d="${W.d}"/></svg>\n`;
};
w('logo-light.svg', lock(BLUE, TEAL, NAVY));
w('logo-dark.svg', lock('#ffffff', TEAL, '#ffffff'));

// banner and social preview: gradient, mark + wordmark + tagline
const T = txt('DBML entity-relationship diagrams, open source', 600, 40);
const banner = (wd, ht) => {
  const k = 4.2,
    mw = 32 * k,
    gap = 36,
    ww = W.width * 1.4,
    block = mw + gap + ww;
  const x0 = (wd - block) / 2,
    y0 = ht / 2 - 70;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${wd} ${ht}"><defs>${grad}</defs><rect width="${wd}" height="${ht}" fill="url(#rvg)"/>
<g transform="translate(${x0} ${y0 - 24}) scale(${k})">${mark('#ffffff', '#ffffff')}</g>
<path transform="translate(${x0 + mw + gap} ${y0 + 92}) scale(1.4)" fill="#ffffff" d="${W.d}"/>
<path transform="translate(${(wd - T.width) / 2} ${y0 + 190})" fill="#ffffff" fill-opacity="0.92" d="${T.d}"/></svg>\n`;
};
w('social-preview.svg', banner(1280, 640));
w('banner.svg', banner(1280, 400));
