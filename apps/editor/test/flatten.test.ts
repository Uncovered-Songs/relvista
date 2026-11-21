/**
 * Multi-file SQL export (design phase3 §6.3): the model flattened to one DBML file compiles to the
 * same tables, columns, refs, enums and groups, and the @dbml/core exporters accept it. Single-file
 * workspaces keep passing the entry text unchanged.
 */
import { exporter } from '@dbml/core';
import { compileDbml, type DiagramModel } from '@relvista/core';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { flattenModel, sqlSourceOf } from '../src/sql/flatten.js';
import { EXAMPLES_DIR } from './helpers.js';

function folder(name: string): Record<string, string> {
  const root = join(EXAMPLES_DIR, name);
  const files: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const f of readdirSync(dir).sort()) {
      const q = join(dir, f);
      if (statSync(q).isDirectory()) walk(q);
      else if (f.endsWith('.dbml'))
        files[relative(root, q).split('\\').join('/')] = readFileSync(q, 'utf8');
    }
  };
  walk(root);
  return files;
}

function shape(m: DiagramModel) {
  return {
    tables: m.tables.map((t) => ({
      id: t.id,
      headerColor: t.headerColor,
      note: t.note,
      columns: t.columns.map((c) => ({
        name: c.name,
        type: c.enumId ? `enum:${c.enumId}` : c.type.replace(/\s+/g, ' '),
        pk: c.pk,
        unique: c.unique,
        notNull: c.notNull,
        increment: c.increment,
        default: c.default,
        note: c.note,
        checks: c.checks.map((ch) => ch.expression),
      })),
      indexes: t.indexes.map((i) => ({
        columns: i.columns,
        unique: i.unique,
        pk: i.pk,
        name: i.name,
        type: i.type,
      })),
      checks: t.checks.map((ch) => ({ name: ch.name, expression: ch.expression })),
    })),
    refs: m.refs.map((r) => ({
      id: r.id,
      name: r.name,
      relation: r.relation,
      onDelete: r.onDelete,
      onUpdate: r.onUpdate,
      inactive: r.inactive,
    })),
    enums: m.enums.map((e) => ({ id: e.id, values: e.values })),
    groups: m.groups.map((g) => ({ id: g.id, tableIds: g.tableIds, color: g.color })),
  };
}

const sortBy = <T>(xs: T[], k: (x: T) => string) => [...xs].sort((a, b) => (k(a) < k(b) ? -1 : 1));

function normalized(m: DiagramModel) {
  const s = shape(m);
  return { ...s, refs: sortBy(s.refs, (r) => r.id), tables: s.tables };
}

const WORKSPACES: Array<{ name: string; files: Record<string, string>; entry: string }> = [
  { name: '12-modules', files: folder('12-modules'), entry: 'main.dbml' },
  ...readdirSync(EXAMPLES_DIR)
    .filter((n) => n.endsWith('.dbml'))
    .sort()
    .map((n) => ({
      name: n,
      files: { [n]: readFileSync(join(EXAMPLES_DIR, n), 'utf8') },
      entry: n,
    })),
];

describe('flattenModel', () => {
  it('flattened 12-modules compiles to the same tables and refs', () => {
    const files = folder('12-modules');
    const model = compileDbml({ files, entry: 'main.dbml' }).model!;
    const flat = flattenModel(model);
    const back = compileDbml(flat);
    expect(back.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(back.model!.tables.map((t) => t.id)).toEqual(model.tables.map((t) => t.id));
    expect(back.model!.refs.map((r) => r.id).sort()).toEqual(model.refs.map((r) => r.id).sort());
    expect(normalized(back.model!)).toEqual(normalized(model));
  });

  describe.each(WORKSPACES)('$name', ({ files, entry }) => {
    const model = compileDbml({ files, entry }).model!;
    it('round-trips through a single file', () => {
      const back = compileDbml(flattenModel(model));
      expect(back.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(normalized(back.model!)).toEqual(normalized(model));
    });

    it('is accepted by every @dbml/core exporter', () => {
      const flat = flattenModel(model);
      for (const format of ['postgres', 'mysql', 'mssql', 'oracle'] as const) {
        const sql = exporter.export(flat, format);
        if (model.tables.length) expect(sql, format).toMatch(/CREATE TABLE/i);
      }
    });
  });

  it('single-file workspaces export the entry text unchanged', () => {
    const text = readFileSync(join(EXAMPLES_DIR, '02-ecommerce.dbml'), 'utf8');
    const model = compileDbml(text).model;
    expect(sqlSourceOf({ 'a.dbml': text }, 'a.dbml', model)).toBe(text);
    const files = folder('12-modules');
    const m = compileDbml({ files, entry: 'main.dbml' }).model;
    expect(sqlSourceOf(files, 'main.dbml', m)).toBe(flattenModel(m!));
  });

  it('quotes awkward names, types and strings', () => {
    const src = [
      'Table "my schema"."odd table" {',
      '  "first col" "double precision" [not null, note: \'it\\\'s "x"\\nline 2\']',
      '  id int [pk, default: `now()`]',
      '}',
    ].join('\n');
    const model = compileDbml(src).model!;
    const back = compileDbml(flattenModel(model));
    expect(back.diagnostics).toEqual([]);
    expect(normalized(back.model!)).toEqual(normalized(model));
  });
});
