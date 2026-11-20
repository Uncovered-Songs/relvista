import { describe, expect, it } from 'vitest';
import { compileDbml, selectView, type DiagramModel } from '../src/model/index.js';

function ok(input: Parameters<typeof compileDbml>[0]): DiagramModel {
  const { model, diagnostics } = compileDbml(input);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  if (!model) throw new Error('no model');
  return model;
}

describe('ids of quoted names containing dots', () => {
  const model = ok(`Table x."y.z" {
  id int [pk]
}
Table "x.y".z {
  id int [pk]
  r int
}
TableGroup g {
  x."y.z"
}
Enum x."e.f" {
  a
}
Ref: x."y.z".id < "x.y".z.r
`);

  it('gives the two tables different ids', () => {
    expect(model.tables.map((t) => [t.id, t.schema, t.name])).toEqual([
      ['x."y.z"', 'x', 'y.z'],
      ['"x.y".z', 'x.y', 'z'],
    ]);
    expect(model.enums.map((e) => e.id)).toEqual(['x."e.f"']);
  });

  it('puts the group on the right table and keeps both ref endpoints apart', () => {
    expect(model.tables.map((t) => t.groupId)).toEqual(['group:g', null]);
    expect(model.groups[0]?.tableIds).toEqual(['x."y.z"']);
    expect(model.refs.map((r) => r.id)).toEqual(['ref:x."y.z"(id)<"x.y".z(r)']);
    expect(model.tables[1]?.columns.find((c) => c.name === 'r')?.isFk).toBe(true);
    expect(model.tables[0]?.columns.find((c) => c.name === 'id')?.isFk).toBe(false);
  });
});

describe('ref ids', () => {
  it('derive from endpoints, so duplicate names and imports do not shift them', () => {
    const src = `Table a {
  id int [pk]
  x int
  y int
}
Ref r: a.x > a.id
Ref r: a.y > a.id
`;
    const ids = ok(src).refs.map((r) => [r.id, r.name]);
    expect(ids).toEqual([
      ['ref:public.a(x)>public.a(id)', 'r'],
      ['ref:public.a(y)>public.a(id)', 'r'],
    ]);
    // Removing the first `Ref r` leaves the second one's id alone.
    const second = ok(src.replace('Ref r: a.x > a.id\n', '')).refs.map((r) => r.id);
    expect(second).toEqual(['ref:public.a(y)>public.a(id)']);

    const multi = ok({
      files: {
        'main.dbml': `use { table b } from './b'\nTable a {\n  id int [pk]\n  x int\n}\nRef r: a.x > a.id\n`,
        'b.dbml': `Table b {\n  id int [pk]\n  q int\n}\nRef r: b.q > b.id\n`,
      },
      entry: 'main.dbml',
    });
    expect(multi.refs.map((r) => r.id)).toContain('ref:public.a(x)>public.a(id)');
  });
});

describe('TablePartial inline refs', () => {
  it('drops a partial ref that duplicates an explicit ref, with a warning', () => {
    const src = `Table users {
  id int [pk]
}
TablePartial p {
  uid int [ref: > users.id]
}
Table t {
  id int
  ~p
}
Ref: t.uid > users.id
`;
    const { model, diagnostics } = compileDbml(src);
    expect(model?.refs.map((r) => [r.id, r.fromPartial])).toEqual([
      ['ref:public.t(uid)>public.users(id)', null],
    ]);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('References with same endpoints exist'),
        start: expect.objectContaining({ line: 5 }),
      }),
    ]);
  });
});

describe('imports under an alias', () => {
  it('resolves view entries by the written name when a local table has the original name', () => {
    const model = ok({
      files: {
        'main.dbml': `use {
  table users as busers
  table inv
} from './b'
Table users {
  id int [pk]
}
DiagramView v {
  Tables {
    busers
  }
}
DiagramView w {
  Tables {
    users
    inv
  }
}
`,
        'b.dbml': `Table users {
  id int [pk]
}
Table inv {
  id int
  uid int [ref: > users.id]
}
`,
      },
      entry: 'main.dbml',
    });
    expect(model.tables.map((t) => t.id)).toEqual(['public.users', 'public.busers', 'public.inv']);
    expect(model.views.map((v) => [v.name, v.tableIds])).toEqual([
      ['v', ['public.busers']],
      ['w', ['public.users', 'public.inv']],
    ]);
    const v = selectView(model, 'v');
    expect(v?.tables.map((t) => t.id)).toEqual(['public.busers']);
  });

  it('resolves view entries written with a table alias', () => {
    const model = ok(`Table users as U {
  id int
}
DiagramView v {
  Tables {
    U
  }
}
`);
    expect(model.views[0]?.tableIds).toEqual(['public.users']);
  });

  it('links columns to an enum imported under another name', () => {
    const model = ok({
      files: {
        'main.dbml': `use {
  enum status as st
  table t
} from './b'
`,
        'b.dbml': `Enum status {
  a
  b
}
Table t {
  s status
}
`,
      },
      entry: 'main.dbml',
    });
    expect(model.enums.map((e) => e.id)).toEqual(['public.st']);
    expect(model.tables[0]?.columns[0]).toMatchObject({ type: 'status', enumId: 'public.st' });
  });
});

describe('source positions', () => {
  it('count a leading BOM on line 1, so line/column index the original string', () => {
    const src = '﻿Table a { id int [ref: > zz.id] }';
    const { diagnostics } = compileDbml(src);
    const d = diagnostics[0];
    expect(d).toBeDefined();
    if (!d) return;
    const lines = src.split('\n');
    expect(lines[d.start.line - 1]?.[d.start.column - 1]).toBe(src[d.start.offset]);
    expect(src[d.start.offset]).toBe('z');
  });
});

describe('input file keys', () => {
  it('rejects two keys that name the same file', () => {
    const { model, diagnostics } = compileDbml({
      files: { 'main.dbml': 'Table a {\n  id int\n}\n', './main.dbml': 'Table b {\n  id int\n}\n' },
      entry: 'main.dbml',
    });
    expect(model).toBeNull();
    expect(diagnostics).toEqual([
      expect.objectContaining({
        severity: 'error',
        file: './main.dbml',
        message: expect.stringContaining("'main.dbml' and './main.dbml'"),
      }),
    ]);
  });
});
