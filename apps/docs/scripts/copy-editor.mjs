#!/usr/bin/env node
// Copies the editor app (apps/editor/dist) into the docs build, so one GitHub Pages artifact
// serves the docs at / and the editor at /editor/ (design phase2 §7.2).
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(siteDir, '..', '..');
const dist = join(repoRoot, 'apps', 'editor', 'dist');
const target = join(siteDir, 'build', 'editor');

if (!existsSync(join(dist, 'index.html'))) {
  console.error(
    `copy-editor: ${relative(repoRoot, dist)}/index.html is missing. Build the editor first: pnpm --filter relvista-editor build`,
  );
  process.exit(1);
}
if (!existsSync(join(siteDir, 'build'))) {
  console.error('copy-editor: apps/docs/build is missing. Run docusaurus build first.');
  process.exit(1);
}
rmSync(target, { recursive: true, force: true });
// Source maps stay out of the Pages artifact (the Monaco map alone is 15 MB).
cpSync(dist, target, { recursive: true, filter: (src) => !src.endsWith('.map') });
console.log(`copied ${relative(repoRoot, dist)} to ${relative(repoRoot, target)}`);
