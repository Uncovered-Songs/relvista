// Expected diagram contents, computed with @relvista/core straight from examples/.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileDbml, selectView, type CompileInput } from '@relvista/core';

const examplesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'examples');

export interface ExamplePage {
  /** Gallery slug, e.g. `02-ecommerce`. */
  slug: string;
  /** Visible table count per view name (`*` = all tables). */
  tables: Record<string, number>;
}

function collect(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.dbml'))
        files[relative(dir, p).split(sep).join('/')] = readFileSync(p, 'utf8');
    }
  };
  walk(dir);
  return files;
}

export function examplePages(): ExamplePage[] {
  const pages: ExamplePage[] = [];
  for (const name of readdirSync(examplesDir).sort()) {
    const p = join(examplesDir, name);
    let input: CompileInput;
    if (statSync(p).isDirectory()) input = { files: collect(p), entry: 'main.dbml' };
    else if (name.endsWith('.dbml')) input = readFileSync(p, 'utf8');
    else continue;
    const { model } = compileDbml(input);
    if (!model) throw new Error(`examples/${name} does not compile`);
    const tables: Record<string, number> = { '*': model.tables.length };
    for (const v of model.views) tables[v.name] = selectView(model, v.name)?.tables.length ?? 0;
    pages.push({ slug: name.replace(/\.dbml$/, ''), tables });
  }
  return pages;
}
