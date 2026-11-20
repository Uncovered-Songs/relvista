// Build step: dist/styles.css = React Flow's style.css + src/styles.css, so consumers import one
// file (`@relvista/renderer/styles.css`) and need no CSS resolution of their own.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));

const xyflowCss = readFileSync(require.resolve('@xyflow/react/dist/style.css'), 'utf8');
const ownCss = readFileSync(join(root, 'src/styles.css'), 'utf8');

const out = [
  '/* @relvista/renderer — includes @xyflow/react/dist/style.css (MIT, xyflow) */',
  xyflowCss.trim(),
  '',
  ownCss.trim(),
  '',
].join('\n');

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/styles.css'), out);
console.log(`wrote dist/styles.css (${(out.length / 1024).toFixed(1)} KB)`);
