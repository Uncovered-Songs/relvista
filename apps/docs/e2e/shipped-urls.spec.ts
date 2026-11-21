// The repository moved to github.com/relvista/relvista (decision 0002, amendment): the old Pages
// host answers 404 for every path, so no shipped file may still point there.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const siteDir = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));

/** Every file under `dir`, recursively. */
function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = `${dir}/${name}`;
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

test('no shipped file names the pre-move host', () => {
  const STALE = /uncovered-songs\.github\.io|github\.com\/Uncovered-Songs/i;
  const shipped = [
    ...walk(`${siteDir}build`),
    'schemas/layout.schema.json',
    'README.md',
    ...[
      ['core', 'dist'],
      ['renderer', 'dist'],
      ['docusaurus-plugin', 'lib'],
    ].flatMap(([p, out]) => [
      ...walk(`${repoRoot}packages/${p}/${out}`),
      `packages/${p}/package.json`,
      `packages/${p}/README.md`,
    ]),
    'packages/core/layout.schema.json',
  ].map((f) => (f.startsWith('/') ? f : `${repoRoot}${f}`));
  expect(shipped.length).toBeGreaterThan(100);
  const hits = shipped.filter(
    (f) =>
      /\.(html|js|mjs|cjs|css|json|map|md|txt|xml|svg|d\.ts)$/.test(f) &&
      STALE.test(readFileSync(f, 'utf8')),
  );
  expect(hits).toEqual([]);
});
