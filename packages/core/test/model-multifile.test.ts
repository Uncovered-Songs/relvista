import { describe, expect, it } from 'vitest';
import { compileDbml } from '../src/model/index.js';

const FILES = {
  'main.dbml': `use { table users } from './users.dbml'
use * from './lib/enums.dbml'
reuse { table orgs } from './orgs.dbml'

Table posts {
  id int [pk]
  user_id int [ref: > users.id]
  kind kind_t
}
`,
  'users.dbml': `use { table orgs } from './orgs.dbml'
Table users {
  id int [pk]
  org_id int [ref: > orgs.id]
}
Table secret {
  id int
}
`,
  'orgs.dbml': `Table orgs {
  id int [pk]
}
`,
  'lib/enums.dbml': `Enum kind_t {
  a
  b
}
Table lib_t {
  x int
}
`,
};

describe('compileDbml: multiple files', () => {
  it('merges what the entry imports with use / reuse, and nothing else', () => {
    const { model, diagnostics } = compileDbml({ files: FILES, entry: 'main.dbml' });
    expect(diagnostics).toEqual([]);
    expect(model?.tables.map((t) => [t.id, t.span.file]).sort()).toEqual([
      ['public.lib_t', 'lib/enums.dbml'],
      ['public.orgs', 'orgs.dbml'],
      ['public.posts', 'main.dbml'],
      ['public.users', 'users.dbml'],
    ]);
    expect(model?.tables.some((t) => t.name === 'secret')).toBe(false);
    expect(model?.enums.map((e) => e.id)).toEqual(['public.kind_t']);
    expect(model?.tables.find((t) => t.name === 'posts')?.columns[2]?.enumId).toBe('public.kind_t');
    // Refs between imported tables come along (users → orgs is declared in users.dbml).
    expect(model?.refs.map((r) => r.id).sort()).toEqual([
      'ref:public.orgs(id)<public.users(org_id)',
      'ref:public.users(id)<public.posts(user_id)',
    ]);
    expect(model?.entry).toBe('main.dbml');
    expect([...(model?.files ?? [])].sort()).toEqual([
      'lib/enums.dbml',
      'main.dbml',
      'orgs.dbml',
      'users.dbml',
    ]);
  });

  it('compiles another file as entry', () => {
    const { model } = compileDbml({ files: FILES, entry: 'users.dbml' });
    expect(model?.tables.map((t) => t.name).sort()).toEqual(['orgs', 'secret', 'users']);
  });

  it('uses the name an import alias gives, also in DiagramViews', () => {
    const { model, diagnostics } = compileDbml({
      files: {
        '/db/main.dbml': `use { table users as u } from './users.dbml'
use { tablepartial stamps } from './users.dbml'
Table posts {
  id int [pk]
  user_id int [ref: > u.id]
  ~stamps
}
DiagramView only_users {
  Tables {
    u
  }
}
`,
        '/db/users.dbml': `Table users {
  id int [pk]
}
TablePartial stamps {
  created timestamp
}
`,
      },
      entry: '/db/main.dbml',
    });
    expect(diagnostics).toEqual([]);
    expect(model?.tables.map((t) => t.id)).toEqual(['public.posts', 'public.u']);
    expect(model?.tables[0]?.columns.map((c) => c.name)).toEqual(['id', 'user_id', 'created']);
    expect(model?.refs[0]?.from.tableId).toBe('public.u');
    expect(model?.views[0]?.tableIds).toEqual(['public.u']);
  });

  it('reports errors inside an imported file against that file', () => {
    const { model, diagnostics } = compileDbml({
      files: {
        'main.dbml': "use { table b } from './b.dbml'\nTable a {\n  id int [ref: > b.id]\n}\n",
        'b.dbml': 'Table b {\n  id int\n  x !!\n}\n',
      },
      entry: 'main.dbml',
    });
    expect(model).toBeNull();
    expect(diagnostics.map((d) => [d.file, d.code, d.start.line])).toEqual([
      ['b.dbml', 1009, 4],
      ['b.dbml', 3022, 3],
      ['main.dbml', 5013, 1],
    ]);
  });

  it('reports a missing imported file', () => {
    const { model, diagnostics } = compileDbml({
      files: { 'main.dbml': "use { table b } from './missing.dbml'\nTable a {\n  id int\n}\n" },
      entry: 'main.dbml',
    });
    expect(model).toBeNull();
    expect(diagnostics[0]).toMatchObject({
      file: 'main.dbml',
      code: 4001,
      start: { line: 1, column: 22 },
    });
  });

  it('reports a missing entry file instead of returning an empty model', () => {
    const { model, diagnostics } = compileDbml({
      files: { 'a.dbml': 'Table a {\n  id int\n}\n' },
      entry: 'nope.dbml',
    });
    expect(model).toBeNull();
    expect(diagnostics).toEqual([
      expect.objectContaining({ severity: 'error', file: 'nope.dbml' }),
    ]);
  });
});
