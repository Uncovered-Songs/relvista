#!/usr/bin/env node
// Builds the fixture twice: build/site with relvista, build/baseline without it (same pages, same
// custom styles). The e2e compares the two, so relvista must leave the site's own look unchanged.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const bin = require.resolve('@docusaurus/core/bin/docusaurus.mjs');
const siteDir = fileURLToPath(new URL('..', import.meta.url));

for (const [outDir, baseline] of [
  ['build/site', false],
  ['build/baseline', true],
]) {
  const r = spawnSync(process.execPath, [bin, 'build', '--out-dir', outDir], {
    cwd: siteDir,
    stdio: 'inherit',
    env: { ...process.env, RELVISTA_COMPAT_BASELINE: baseline ? '1' : '' },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// The catalog docs instance (content outside the site directory, CommonMark sheets) must render
// its pages with relvista registered, and its ```dbml fence must be drawn at build time.
const sheet = readFileSync(
  new URL('../build/site/catalog/systems/toll-db.html', import.meta.url),
  'utf8',
);
for (const [what, ok] of [
  ['the page title', sheet.includes('<h1>Toll database')],
  ['a static diagram', sheet.includes('class="rv-diagram"')],
  ['the diagram tables', sheet.includes('plazas') && sheet.includes('transactions')],
]) {
  if (!ok) {
    console.error(`[compat] build/site/catalog/systems/toll-db.html is missing ${what}`);
    process.exit(1);
  }
}
