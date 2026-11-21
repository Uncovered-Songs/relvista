import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXAMPLES_DIR = fileURLToPath(new URL('../../../examples/', import.meta.url));

/** Top-level single-file examples. */
export function singleExamples(): Array<{ name: string; text: string }> {
  return readdirSync(EXAMPLES_DIR)
    .filter((n) => n.endsWith('.dbml'))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(EXAMPLES_DIR, name), 'utf8') }));
}

/** Files of a folder example, keyed by path inside the folder. */
export function folderExample(name: string): Record<string, Uint8Array> {
  const root = join(EXAMPLES_DIR, name);
  const out: Record<string, Uint8Array> = {};
  const walk = (dir: string) => {
    for (const n of readdirSync(dir).sort()) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else out[relative(root, p).split('\\').join('/')] = new Uint8Array(readFileSync(p));
    }
  };
  walk(root);
  return out;
}

const enc = new TextEncoder();
const BOM = [0xef, 0xbb, 0xbf];
const lf = (t: string) => t.replace(/\r\n?/g, '\n');

export const VARIANTS: Record<string, (t: string) => Uint8Array> = {
  'as is': (t) => enc.encode(t),
  CRLF: (t) => enc.encode(lf(t).replaceAll('\n', '\r\n')),
  BOM: (t) => new Uint8Array([...BOM, ...enc.encode(t)]),
  'BOM+CRLF': (t) => new Uint8Array([...BOM, ...enc.encode(lf(t).replaceAll('\n', '\r\n'))]),
  mixed: (t) => {
    let i = 0;
    return enc.encode(lf(t).replace(/\n/g, () => ['\n', '\r\n', '\r'][i++ % 3]!));
  },
  CR: (t) => enc.encode(lf(t).replaceAll('\n', '\r')),
  'no final newline': (t) => enc.encode(t.replace(/[\r\n]+$/, '')),
};

export interface ExampleExpectation {
  /** `02-ecommerce` or `12-modules`. */
  id: string;
  /** What the editor shows as the document name: `02-ecommerce.dbml`, or `main.dbml`. */
  fileName: string;
  tables: number;
  refs: number;
}

/** Every example in examples/ with its table count, computed by @relvista/core. */
export async function exampleExpectations(): Promise<ExampleExpectation[]> {
  const { compileDbml } = await import('@relvista/core');
  const out: ExampleExpectation[] = [];
  for (const ex of singleExamples()) {
    const { model } = compileDbml(ex.text);
    out.push({
      id: ex.name.replace(/\.dbml$/, ''),
      fileName: ex.name,
      tables: model!.tables.length,
      refs: model!.refs.length,
    });
  }
  for (const name of readdirSync(EXAMPLES_DIR).sort()) {
    if (!statSync(join(EXAMPLES_DIR, name)).isDirectory()) continue;
    const dec = new TextDecoder();
    const files = Object.fromEntries(
      Object.entries(folderExample(name))
        .filter(([k]) => k.endsWith('.dbml'))
        .map(([k, v]) => [k, dec.decode(v)]),
    );
    const { model } = compileDbml({ files, entry: 'main.dbml' });
    out.push({
      id: name,
      fileName: 'main.dbml',
      tables: model!.tables.length,
      refs: model!.refs.length,
    });
  }
  return out;
}
