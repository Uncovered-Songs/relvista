#!/usr/bin/env node
// Generates the API reference (api/**) from the TSDoc of @relvista/core, @relvista/renderer and
// @relvista/docusaurus-plugin with typedoc + typedoc-plugin-markdown (typedoc.json,
// docs/design/phase3-v1.md §9). Everything written here is git-ignored. Runs before
// `docusaurus build` and `docusaurus start`.
//
// The pages are their own docs plugin instance (id `api`, served at /docs/api; see
// docusaurus.config.ts) with their own sidebar: in the main docs instance, their ~300 sidebar
// links and the page count would weigh on every docs page (the sidebar metadata chunk, and
// Docusaurus' `common` chunk, which needs half of all pages to share a module).
//
// Fails (exit 1) on any typedoc warning (an export without a summary, a broken {@link}, a type
// referenced but not exported), when a package is missing from the output, or when a page grows
// past MAX_PAGE_BYTES. After typedoc it writes the sidebar metadata Docusaurus needs: a
// `_category_.json` per folder and a `sidebar_label` (the bare symbol name) per page.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Application } from 'typedoc';

const siteDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(siteDir, 'api');
/** Pages stay well below what the browser and Docusaurus' MDX compiler handle comfortably. */
const MAX_PAGE_BYTES = 200 * 1024;

/** Package folders in sidebar order (after `excludeScopesInPaths`), with their labels. */
const PACKAGES = [
  ['core', '@relvista/core'],
  ['renderer', '@relvista/renderer'],
  ['docusaurus-plugin', '@relvista/docusaurus-plugin'],
];
/** Member folders typedoc-plugin-markdown writes, in the order its index pages list them. */
const KIND_FOLDERS = [
  ['classes', 'Classes'],
  ['interfaces', 'Interfaces'],
  ['type-aliases', 'Type aliases'],
  ['variables', 'Variables'],
  ['functions', 'Functions'],
];

function fail(message) {
  console.error(`api-docs: ${message}`);
  process.exit(1);
}

async function generate() {
  // Relative paths in typedoc.json (and its compilerOptions.baseUrl) are relative to this folder.
  process.chdir(siteDir);
  const app = await Application.bootstrapWithPlugins({ options: join(siteDir, 'typedoc.json') });
  const strict = () => app.logger.hasErrors() || app.logger.hasWarnings();
  if (strict()) fail('typedoc options are invalid (see above)');
  const project = await app.convert();
  if (!project || strict()) fail('typedoc could not convert the packages (see above)');
  app.validate(project);
  if (strict()) fail('the API reference has warnings (see above); fix the TSDoc');
  await app.generateOutputs(project);
  if (strict()) fail('typedoc could not write the API reference (see above)');
}

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function writeJson(file, value) {
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

/** Docusaurus treats `index`, `README` and `<folder>` docs as their folder's category page. */
function isCategoryIndexName(file) {
  const name = basename(file, '.md').toLowerCase();
  return name === 'index' || name === 'readme' || name === basename(dirname(file)).toLowerCase();
}

function decorate() {
  for (const [i, [folder, label]] of PACKAGES.entries()) {
    const dir = join(outDir, folder);
    if (!existsSync(join(dir, 'index.md'))) fail(`no pages were generated for ${label}`);
    writeJson(join(dir, '_category_.json'), { label, position: i + 1, collapsed: true });
  }
  const dirs = new Set(walk(outDir).map((f) => dirname(f)));
  for (const dir of dirs) {
    const kind = KIND_FOLDERS.findIndex(([name]) => name === basename(dir));
    if (kind !== -1) {
      // No category page: a member folder only groups pages (and `Index.md`, the core `Index`
      // interface, must stay an ordinary page).
      writeJson(join(dir, '_category_.json'), {
        label: KIND_FOLDERS[kind][1],
        position: kind + 1,
        collapsed: true,
        link: null,
      });
    } else if (dir !== outDir && !existsSync(join(dir, '_category_.json'))) {
      // Modules of a package with several entry points (the plugin's `plugin` and `themeConfig`).
      writeJson(join(dir, '_category_.json'), { label: basename(dir), collapsed: true });
    }
  }

  for (const file of walk(outDir)) {
    if (!file.endsWith('.md')) continue;
    const size = statSync(file).size;
    if (size > MAX_PAGE_BYTES)
      fail(`${relative(siteDir, file)} is ${size} bytes (limit ${MAX_PAGE_BYTES})`);
    const isModuleIndex = basename(file) === 'index.md';
    const front = [];
    if (!isModuleIndex) {
      front.push(`sidebar_label: ${JSON.stringify(basename(file, '.md'))}`);
      if (isCategoryIndexName(file)) {
        // Keep the page at its own URL instead of its folder's.
        const slug = '/' + relative(outDir, file).split(sep).join('/');
        front.push(`slug: ${JSON.stringify(slug.replace(/\.md$/, ''))}`);
      }
    }
    // The reference's front page: first in its sidebar, with no "Previous" link.
    if (file === join(outDir, 'index.md'))
      front.push('sidebar_position: 0', 'pagination_prev: null');
    if (front.length === 0) continue;
    const text = readFileSync(file, 'utf8');
    writeFileSync(file, `---\n${front.join('\n')}\n---\n\n${text}`);
  }
}

await generate();
decorate();
console.log(`api-docs: wrote ${relative(siteDir, outDir)}/ (${walk(outDir).length} files)`);
