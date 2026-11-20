// Build step: copies the files tsc does not emit (CSS modules) from src/ to lib/.
import { cpSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');
const lib = join(root, 'lib');

let copied = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.css')) {
      cpSync(p, join(lib, relative(src, p)));
      copied++;
    }
  }
};
walk(src);
console.log(`copied ${copied} asset(s) to lib/`);
