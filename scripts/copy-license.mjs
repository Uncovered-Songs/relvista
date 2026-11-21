// Keeps the committed LICENSE copies in packages/*/LICENSE identical to the root LICENSE.
// npm only puts files that are inside a package folder into its tarball, so every published
// package carries its own copy (CONTRIBUTING.md, "Packaging").
//
//   node scripts/copy-license.mjs           write the copies
//   node scripts/copy-license.mjs --check   exit 1 if a copy is missing or differs (CI, packages:check)
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PUBLISHED_PACKAGES = ['core', 'renderer', 'docusaurus-plugin'];

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Returns the package LICENSE paths (repo-relative) that are missing or differ from the root one. */
export function staleLicenses() {
  const license = readFileSync(join(root, 'LICENSE'), 'utf8');
  return PUBLISHED_PACKAGES.map((dir) => join(root, 'packages', dir, 'LICENSE'))
    .filter((file) => !existsSync(file) || readFileSync(file, 'utf8') !== license)
    .map((file) => relative(root, file));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  const stale = staleLicenses();
  if (check) {
    if (stale.length) {
      console.error(
        `copy-license: ${stale.join(', ')} differ from LICENSE; run \`node scripts/copy-license.mjs\``,
      );
      process.exit(1);
    }
    console.log('copy-license: every package LICENSE matches the root LICENSE');
  } else {
    const license = readFileSync(join(root, 'LICENSE'), 'utf8');
    for (const file of stale) writeFileSync(join(root, file), license);
    console.log(
      stale.length ? `copy-license: wrote ${stale.join(', ')}` : 'copy-license: up to date',
    );
  }
}
