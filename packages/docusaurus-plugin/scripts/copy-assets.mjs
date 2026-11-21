// Build step: copies the files tsc does not emit (CSS modules) from src/ to lib/.
import { cpSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const lib = join(root, 'lib');

let copied = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.css')) {
      cpSync(p, join(lib, relative(src, p)));
      copied++;
    }
  }
};
walk(src);
console.log(`copied ${copied} asset(s) to lib/`);

// The static (build-time) diagrams follow the site's dark mode without JavaScript: copy the dark
// palette of @relvista/renderer (its single source of truth) under the site's dark selector.
const require = createRequire(join(root, 'package.json'));
const rendererCss = readFileSync(require.resolve('@relvista/renderer/styles.css'), 'utf8');
const dark = rendererCss.match(
  /:where\(\[data-rv-color-mode='dark'\]\):where\(:not\(\.rv-viewer \*\)\)\s*\{([^}]*)\}/,
);
if (!dark)
  throw new Error('copy-assets: the dark palette was not found in @relvista/renderer/styles.css');
const marker = '/* @relvista:static-dark-palette */';
const staticCss = join(lib, 'client', 'static.css');
const css = readFileSync(staticCss, 'utf8');
if (!css.includes(marker))
  throw new Error(`copy-assets: ${marker} is missing in client/static.css`);
writeFileSync(
  staticCss,
  css.replace(
    marker,
    [
      ":where(html[data-theme='dark'] .relvista-static-box, html[data-theme='dark'] .relvista-static-box > svg.rv-diagram) {",
      dark[1].replace(/^\n+|\s+$/g, ''),
      '}',
    ].join('\n'),
  ),
);
console.log('static dark palette written to lib/client/static.css');
