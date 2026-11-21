// Build step: dist/styles.css = src/styles.css + src/styles/*.css, importing React Flow's style.css (copied next to
// it as dist/xyflow.css), so consumers import one file: `@relvista/renderer/styles.css`.
//
// React Flow's CSS stays in a file of its own because it uses `@layer xyflow`. Bundlers that
// polyfill cascade layers per file (postcss-preset-env, as in Docusaurus with older browser
// targets) raise the specificity of every unlayered rule in a file that has layers; relvista's
// palettes must keep zero specificity so that a site's CSS can override any `--rv-*` variable.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'package.json'));

const xyflowCss = readFileSync(require.resolve('@xyflow/react/dist/style.css'), 'utf8');
// src/styles.css first (palettes, base rules), then every src/styles/*.css in name order: features
// keep their rules in files of their own (phase 3), so parallel work never edits one stylesheet.
const featureDir = join(root, 'src/styles');
const featureCss = existsSync(featureDir)
  ? readdirSync(featureDir)
      .filter((f) => f.endsWith('.css'))
      .sort()
      .map((f) => `/* src/styles/${f} */\n${readFileSync(join(featureDir, f), 'utf8').trim()}`)
  : [];
const ownCss = [readFileSync(join(root, 'src/styles.css'), 'utf8').trim(), ...featureCss].join(
  '\n\n',
);

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
// Type stubs for the two stylesheet exports (`types` condition in package.json): side-effect
// imports then resolve under `noUncheckedSideEffectImports`, and arethetypeswrong checks them.
const cssTypes = '// Stylesheet: imported for its side effects only.\nexport {};\n';
writeFileSync(join(root, 'dist/styles.css.d.ts'), cssTypes);
writeFileSync(join(root, 'dist/xyflow.css.d.ts'), cssTypes);
console.log(
  `wrote dist/styles.css (${(out.length / 1024).toFixed(1)} KB) and dist/xyflow.css (${(xyflow.length / 1024).toFixed(1)} KB)`,
);
