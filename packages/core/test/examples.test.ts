// Integration test: every project in examples/ compiles through the diagram model without errors,
// and a layout covering all of its tables survives serialize -> parse unchanged.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  compileDbml,
  emptyLayout,
  parseLayout,
  serializeLayout,
  tableId,
  type CompileInput,
  type Layout,
} from '../src/index.js';

const examplesDir = fileURLToPath(new URL('../../../examples/', import.meta.url));

/** All `.dbml` files under `dir`, keyed by POSIX path relative to `dir`. */
function collectDbml(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.dbml')) {
        files[relative(dir, full).split(sep).join('/')] = readFileSync(full, 'utf8');
      }
    }
  };
  walk(dir);
  return files;
}

/** Top-level `.dbml` files are single-file projects; top-level folders are multi-file projects. */
function loadExamples(): [string, CompileInput][] {
  const examples: [string, CompileInput][] = [];
  for (const name of readdirSync(examplesDir).sort()) {
    const full = join(examplesDir, name);
    if (statSync(full).isDirectory()) {
      examples.push([`${name}/`, { files: collectDbml(full), entry: 'main.dbml' }]);
    } else if (name.endsWith('.dbml')) {
      examples.push([name, readFileSync(full, 'utf8')]);
    }
  }
  return examples;
}

const examples = loadExamples();

describe('examples/', () => {
  it('contains examples, including at least one multi-file project', () => {
    expect(examples.length).toBeGreaterThan(0);
    expect(examples.some(([, input]) => typeof input !== 'string')).toBe(true);
  });

  describe.each(examples)('%s', (_name, input) => {
    const { model, diagnostics } = compileDbml(input);

    it('compiles with zero error diagnostics and a non-empty table list', () => {
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(model).not.toBeNull();
      expect(model!.tables.length).toBeGreaterThan(0);
    });

    it('round-trips a layout with a node for every table', () => {
      const ids = model!.tables.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
      // The model and the layout library must agree on table ids.
      for (const t of model!.tables) expect(t.id).toBe(tableId(t.schema, t.name));

      const layout: Layout = emptyLayout();
      const nodes = layout.views['*']!.nodes;
      ids.forEach((id, i) => {
        nodes[id] = { x: (i % 8) * 280.5, y: Math.floor(i / 8) * 200.25 };
      });

      const parsed = parseLayout(serializeLayout(layout));
      if (!parsed.ok) throw new Error(JSON.stringify(parsed.errors));
      expect(parsed.layout).toEqual(layout);
      expect(Object.keys(parsed.layout.views['*']!.nodes).sort()).toEqual([...ids].sort());
    });
  });
});
