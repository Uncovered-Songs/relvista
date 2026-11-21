// Outlines a line of text in a variable font as one SVG path.
//
// Library: `outline(fontPath, text, wght, size)` returns `{ d, width, ascent, xHeight }`.
// CLI: `node outline.mjs <font.ttf> <text> <wght> <size>` prints the same object as JSON.
//
// fontkit is not a repo dependency. Install it in a throwaway folder and point NODE_PATH at it
// (see brand/README.md).
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

export function outline(fontPath, text, wght, size) {
  const fontkit = require('fontkit');
  const base = fontkit.openSync(fontPath);
  const f = base.getVariation({ wght: Number(wght) });
  const run = f.layout(text);
  const scale = Number(size) / f.unitsPerEm;
  let x = 0,
    d = '';
  for (let i = 0; i < run.glyphs.length; i++) {
    const g = run.glyphs[i],
      p = run.positions[i];
    const path = g.path.scale(scale, -scale).translate(x + p.xOffset * scale, 0);
    d += path.toSVG();
    x += p.xAdvance * scale;
  }
  return { d, width: x, ascent: f.ascent * scale, xHeight: f.xHeight * scale };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [, , fontPath, text, wght, size] = process.argv;
  console.log(JSON.stringify(outline(fontPath, text, wght, size)));
}
