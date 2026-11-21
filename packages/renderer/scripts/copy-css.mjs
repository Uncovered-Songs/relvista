// Build step: dist/styles.css = src/styles.css, importing React Flow's style.css (copied next to
// it as dist/xyflow.css), so consumers import one file: `@relvista/renderer/styles.css`.
//
// React Flow's CSS stays in a file of its own because it uses `@layer xyflow`. Bundlers that
// polyfill cascade layers per file (postcss-preset-env, as in Docusaurus with older browser
// targets) raise the specificity of every unlayered rule in a file that has layers; relvista's
// palettes must keep zero specificity so that a site's CSS can override any `--rv-*` variable.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));

const xyflowCss = readFileSync(require.resolve('@xyflow/react/dist/style.css'), 'utf8');
const ownCss = readFileSync(join(root, 'src/styles.css'), 'utf8');

const xyflow = ['/* @xyflow/react/dist/style.css (MIT, xyflow) */', xyflowCss.trim(), ''].join(
  '\n',
);
const out = [
  "/* @relvista/renderer (includes React Flow's CSS, MIT, xyflow) */",
  "@import './xyflow.css';",
  '',
  ownCss.trim(),
  '',
].join('\n');

mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/xyflow.css'), xyflow);
writeFileSync(join(root, 'dist/styles.css'), out);
console.log(
  `wrote dist/styles.css (${(out.length / 1024).toFixed(1)} KB) and dist/xyflow.css (${(xyflow.length / 1024).toFixed(1)} KB)`,
);
