import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  compileDbml,
  selectView,
  type CompileInput,
  type DiagramModel,
} from '../src/model/index.js';
import { subsetModel } from '../src/analysis/index.js';

const examplesDir = fileURLToPath(new URL('../../../examples/', import.meta.url));

function collectDbml(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.dbml'))
        files[relative(dir, full).split(sep).join('/')] = readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return files;
}

function loadExamples(): [string, DiagramModel][] {
  const out: [string, DiagramModel][] = [];
  for (const name of readdirSync(examplesDir).sort()) {
    const full = join(examplesDir, name);
    let input: CompileInput | null = null;
    if (statSync(full).isDirectory()) input = { files: collectDbml(full), entry: 'main.dbml' };
    else if (name.endsWith('.dbml')) input = readFileSync(full, 'utf8');
    if (input === null) continue;
    const { model } = compileDbml(input);
    if (!model) throw new Error(`${name} did not compile`);
    out.push([name, model]);
  }
  return out;
}

const examples = loadExamples();

describe('subsetModel', () => {
  it('has views to compare against', () => {
    expect(examples.reduce((n, [, m]) => n + m.views.length, 0)).toBeGreaterThan(3);
  });

  for (const [name, model] of examples) {
    for (const view of model.views) {
      it(`${name}: view ${view.name} matches selectView`, () => {
        const expected = selectView(model, view.name) as DiagramModel;
        const got = subsetModel(model, { tableIds: view.tableIds, noteIds: view.noteIds });
        expect(got.tables).toEqual(expected.tables);
        expect(got.refs).toEqual(expected.refs);
        // selectView keeps groups the view lists; a subset keeps groups with kept members.
        expect(got.groups).toEqual(expected.groups.filter((g) => g.tableIds.length > 0));
        expect(got.stickyNotes).toEqual(expected.stickyNotes);
        expect(got.records).toEqual(expected.records);
        expect(got.enums).toBe(model.enums);
        expect(got.views).toBe(model.views);
      });
    }
  }

  it('keeps model order, ignores unknown ids and drops emptied groups', () => {
    const { model } = compileDbml(`
Table a { id int [pk] }
Table b { id int [ref: > a.id] }
Table c { id int [ref: > b.id] }
TableGroup g1 { a
  b }
TableGroup g2 { c }
Note n1 { 'x' }
Note n2 { 'y' }
`);
    if (!model) throw new Error('no model');
    const s = subsetModel(model, {
      tableIds: ['public.b', 'missing', 'public.a'],
      noteIds: ['note:n2'],
    });
    expect(s.tables.map((t) => t.id)).toEqual(['public.a', 'public.b']);
    expect(s.refs.map((r) => r.id)).toEqual(model.refs.slice(0, 1).map((r) => r.id));
    expect(s.groups.map((g) => [g.id, g.tableIds])).toEqual([
      ['group:g1', ['public.a', 'public.b']],
    ]);
    expect(s.stickyNotes.map((n) => n.id)).toEqual(['note:n2']);
    // No notes unless listed.
    expect(subsetModel(model, { tableIds: ['public.c'] }).stickyNotes).toEqual([]);
    const only = subsetModel(model, { tableIds: ['public.a'] });
    expect(only.groups.map((g) => [g.id, g.tableIds])).toEqual([['group:g1', ['public.a']]]);
    // The input is not modified.
    expect(model.groups[0]?.tableIds).toEqual(['public.a', 'public.b']);
  });
});
