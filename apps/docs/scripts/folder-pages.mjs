#!/usr/bin/env node
// With `trailingSlash: false`, Docusaurus writes the page of `/docs/api` to `docs/api.html`, and
// the pages under it to `docs/api/…`. GitHub Pages answers `/docs/api` for such a pair with a 301
// to the folder, `/docs/api/`, and then a 404, as there is no `docs/api/index.html`: the API
// reference, the gallery and every package page would only open through in-site navigation.
// This copies each such page into its folder as `index.html`, so direct loads, reloads and links
// (the npm READMEs link to /docs/api/) reach it. Runs after `docusaurus build`.
import { copyFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const build = join(siteDir, process.argv[2] ?? 'build');

/** Copies `X.html` to `X/index.html` wherever a folder `X/` has no index; returns the copies. */
export function addFolderIndexes(dir) {
  const copied = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (!statSync(path).isDirectory()) continue;
    const page = `${path}.html`;
    const index = join(path, 'index.html');
    if (existsSync(page) && !existsSync(index)) {
      copyFileSync(page, index);
      copied.push(index);
    }
    copied.push(...addFolderIndexes(path));
  }
  return copied;
}

if (!existsSync(join(build, 'index.html'))) {
  console.error('folder-pages: the docs build is missing. Run docusaurus build first.');
  process.exit(1);
}
const copied = addFolderIndexes(build);
console.log(`folder-pages: ${copied.length} folder index pages (${relative(siteDir, build)})`);
