// Records which npm packages end up in a production bundle, for scripts/third-party-notices.mjs.
// The editor's Vite config and the docs site's webpack hook call this with the module ids of
// every emitted chunk; the list lands in node_modules/.cache (never committed, never deployed).
import { mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const cacheDir = join(repoRoot, 'node_modules', '.cache', 'relvista-third-party');

/**
 * Copies of other packages inside a package's own files: `{ package: [[directory, dependency]] }`.
 * A module under that directory belongs to the dependency (the version the enclosing package
 * declares), not to the enclosing package. monaco-editor's ThirdPartyNotices.txt covers its other
 * vendored code (marked, …) but not DOMPurify.
 */
export const VENDORED = {
  'monaco-editor': [['esm/vs/base/browser/dompurify/', 'dompurify']],
};

/** Root directory of package `name` as resolved from the package at `fromRoot`, or null. */
export function resolvePackageFrom(fromRoot, name) {
  const req = createRequire(join(fromRoot, 'package.json'));
  for (const request of [`${name}/package.json`, name]) {
    let dir;
    try {
      dir = dirname(realpathSync(req.resolve(request)));
    } catch {
      continue;
    }
    // `exports` may hide package.json: walk up from the entry point to the package root.
    for (; dir !== dirname(dir); dir = dirname(dir)) {
      const pkg = join(dir, 'package.json');
      if (existsSync(pkg) && JSON.parse(readFileSync(pkg, 'utf8')).name === name) {
        return dir.split(sep).join('/');
      }
    }
  }
  return null;
}

/**
 * Package root of a module path (`…/node_modules/@scope/name/lib/x.js?url` →
 * `…/node_modules/@scope/name`), or null for code outside node_modules (our own packages).
 *
 * Some packages ship copies of their dependencies inside their own build, without a package.json
 * (`@dbml/core/lib/node_modules/antlr4/…`); those resolve to the installed dependency of the
 * enclosing package, which is where the copy came from. Likewise for copies that sit inside a
 * package's own tree under another name (VENDORED below).
 */
export function packageRootOf(id) {
  const path = String(id).replace(/^\0/, '').split('?')[0].split(sep).join('/');
  const at = path.lastIndexOf('/node_modules/');
  if (at < 0) return null;
  const rest = path.slice(at + '/node_modules/'.length).split('/');
  const take = rest[0]?.startsWith('@') ? 2 : 1;
  if (rest.length <= take || rest[0] === '.pnpm' || rest[0] === '.cache') return null;
  const name = rest.slice(0, take).join('/');
  const root = path.slice(0, at) + '/node_modules/' + name;
  if (existsSync(join(root, 'package.json'))) {
    const inner = rest.slice(take).join('/');
    const copy = (VENDORED[name] ?? []).find(([dir]) => inner.startsWith(dir));
    if (!copy) return root;
    const dep = resolvePackageFrom(root, copy[1]);
    if (!dep) throw new Error(`${name} vendors ${copy[1]}, which does not resolve from ${root}`);
    return dep;
  }
  const outer = packageRootOf(path.slice(0, at) + '/x');
  return outer ? resolvePackageFrom(outer, name) : null;
}

/** Writes `<bundle>.json`: the sorted package roots, relative to the repository root. */
export function writePackageList(bundle, moduleIds) {
  const roots = new Set();
  for (const id of moduleIds) {
    const root = packageRootOf(id);
    if (root && existsSync(join(root, 'package.json'))) {
      roots.add(relative(repoRoot, root).split(sep).join('/'));
    }
  }
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, `${bundle}.json`);
  writeFileSync(file, `${JSON.stringify([...roots].sort(), null, 2)}\n`);
  return file;
}

/** Reads a list written by writePackageList; null when that bundle was not built yet. */
export function readPackageList(bundle) {
  const file = join(cacheDir, `${bundle}.json`);
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}
