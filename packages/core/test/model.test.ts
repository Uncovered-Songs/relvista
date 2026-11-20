import { describe, expect, it } from 'vitest';
import { compileDbml, type DiagramModel, type Table } from '../src/model/index.js';

function compileOk(src: string): DiagramModel {
  const { model, diagnostics } = compileDbml(src);
  expect(diagnostics).toEqual([]);
  expect(model).not.toBeNull();
  return model as DiagramModel;
}

function table(model: DiagramModel, id: string): Table {
  const t = model.tables.find((x) => x.id === id);
  if (!t) throw new Error(`no table ${id}`);
  return t;
}

const SHOP = `Project shop {
  database_type: 'PostgreSQL'
  Note: 'proj note'
  owner: 'data team'
}

Table users as U [headerColor: #3498DB, note: 'tbl note'] {
  id integer [pk, increment]
  email varchar(255) [unique, not null, note: 'mail']
  status status_t [default: 'active']
  created_at timestamp [default: \`now()\`]
  score decimal(10,2) [default: 1.5, check: \`score >= 0\`]
  verified boolean [default: false]
  Indexes {
    (email, status) [unique, name: 'ix_email_status']
    id [pk]
    \`lower(email)\` [type: hash, note: 'expr']
  }
  checks {
    \`id > 0\` [name: 'positive_id']
  }
}

Enum status_t {
  active [note: 'a']
  inactive
}

Enum s2.kind {
  post
}

Table s2.posts {
  id int [pk]
  user_id int [ref: > U.id]
  kind s2.kind
}

Ref r1: s2.posts.id - users.id [delete: cascade, update: no action, color: #ff0000]
Ref: s2.posts.user_id <> users.email [inactive]
Ref: s2.posts.kind >? users.status

TableGroup g1 [color: #00ff00, note: 'gn'] {
  U
  s2.posts
}

Note sticky1 [color: #abcdef] {
  'hello'
}

Records users(id, email) {
  1, 'a@x.io'
  2, 'b@x.io'
}
`;

describe('compileDbml: single file', () => {
  const model = compileOk(SHOP);

  it('reads the project block', () => {
    expect(model.project).toEqual({
      name: 'shop',
      note: 'proj note',
      databaseType: 'PostgreSQL',
      settings: { owner: 'data team' },
    });
    expect(model.entry).toBe('main.dbml');
    expect(model.files).toEqual(['main.dbml']);
  });

  it('reads table-level fields', () => {
    const users = table(model, 'public.users');
    expect(users).toMatchObject({
      schema: 'public',
      name: 'users',
      alias: 'U',
      note: 'tbl note',
      headerColor: '#3498DB',
      groupId: 'group:g1',
      partials: [],
    });
    expect(users.span).toMatchObject({ file: 'main.dbml', start: { line: 7, column: 1 } });
    expect(table(model, 's2.posts')).toMatchObject({
      schema: 's2',
      name: 'posts',
      alias: null,
      headerColor: null,
      note: null,
    });
  });

  it('reads every column field', () => {
    const cols = Object.fromEntries(table(model, 'public.users').columns.map((c) => [c.name, c]));
    expect(cols['id']).toMatchObject({
      type: 'integer',
      pk: true,
      increment: true,
      unique: false,
      notNull: false,
      default: null,
    });
    expect(cols['email']).toMatchObject({
      type: 'varchar(255)',
      typeArgs: '255',
      unique: true,
      notNull: true,
      note: 'mail',
    });
    expect(cols['status']).toMatchObject({
      enumId: 'public.status_t',
      default: { kind: 'string', value: 'active' },
    });
    expect(cols['created_at']?.default).toEqual({ kind: 'expression', value: 'now()' });
    expect(cols['score']).toMatchObject({
      typeArgs: '10,2',
      default: { kind: 'number', value: 1.5 },
    });
    expect(cols['score']?.checks).toEqual([
      { name: null, expression: 'score >= 0', fromPartial: null },
    ]);
    expect(cols['verified']?.default).toEqual({ kind: 'boolean', value: 'false' });
    expect(cols['id']?.span.start).toEqual({
      line: 8,
      column: 3,
      offset: SHOP.indexOf('id integer'),
    });
    const kind = table(model, 's2.posts').columns.find((c) => c.name === 'kind');
    expect(kind).toMatchObject({ type: 's2.kind', enumId: 's2.kind' });
  });

  it('reads indexes and checks', () => {
    const users = table(model, 'public.users');
    expect(users.indexes).toEqual([
      {
        name: 'ix_email_status',
        columns: [
          { value: 'email', kind: 'column' },
          { value: 'status', kind: 'column' },
        ],
        unique: true,
        pk: false,
        type: null,
        note: null,
        fromPartial: null,
      },
      {
        name: null,
        columns: [{ value: 'id', kind: 'column' }],
        unique: false,
        pk: true,
        type: null,
        note: null,
        fromPartial: null,
      },
      {
        name: null,
        columns: [{ value: 'lower(email)', kind: 'expression' }],
        unique: false,
        pk: false,
        type: 'hash',
        note: 'expr',
        fromPartial: null,
      },
    ]);
    expect(users.checks).toEqual([
      { name: 'positive_id', expression: 'id > 0', fromPartial: null },
    ]);
  });

  it('reads refs with cardinality, relation and settings', () => {
    const [inline, named, m2m, optional] = model.refs;
    // Inline refs: the parser lists the target first, the holding column second.
    expect(inline).toMatchObject({
      id: 'ref:public.users(id)<s2.posts(user_id)',
      name: null,
      from: {
        tableId: 'public.users',
        columns: ['id'],
        cardinality: 'one',
        optional: false,
        raw: '1',
      },
      to: { tableId: 's2.posts', columns: ['user_id'], cardinality: 'many', raw: '*' },
      relation: '<',
      fkSide: 'to',
      onDelete: null,
      inactive: false,
      color: null,
    });
    expect(named).toMatchObject({
      id: 'ref:s2.posts(id)-public.users(id)',
      name: 'r1',
      from: { tableId: 's2.posts', columns: ['id'], cardinality: 'one' },
      to: { tableId: 'public.users', columns: ['id'], cardinality: 'one' },
      relation: '-',
      fkSide: 'to',
      onDelete: 'cascade',
      onUpdate: 'no action',
      color: '#ff0000',
    });
    expect(m2m).toMatchObject({ relation: '<>', fkSide: null, inactive: true });
    expect(optional).toMatchObject({
      relation: '>?',
      fkSide: 'from',
      to: {
        tableId: 'public.users',
        columns: ['status'],
        cardinality: 'one',
        optional: true,
        raw: '0..1',
      },
    });
    expect(new Set(model.refs.map((r) => r.id)).size).toBe(model.refs.length);
  });

  it('computes isFk from refs', () => {
    const fk = (id: string) =>
      table(model, id)
        .columns.filter((c) => c.isFk)
        .map((c) => c.name);
    expect(fk('s2.posts')).toEqual(['user_id', 'kind']);
    // `r1` is one-to-one: the second endpoint holds the FK, as in @dbml/core's exporters.
    expect(fk('public.users')).toEqual(['id']);
  });

  it('reads enums, groups, sticky notes and records', () => {
    expect(model.enums.map((e) => [e.id, e.values])).toEqual([
      [
        'public.status_t',
        [
          { name: 'active', note: 'a' },
          { name: 'inactive', note: null },
        ],
      ],
      ['s2.kind', [{ name: 'post', note: null }]],
    ]);
    expect(model.groups).toEqual([
      expect.objectContaining({
        id: 'group:g1',
        name: 'g1',
        tableIds: ['public.users', 's2.posts'],
        color: '#00ff00',
        note: 'gn',
      }),
    ]);
    expect(model.stickyNotes).toEqual([
      expect.objectContaining({
        id: 'note:sticky1',
        name: 'sticky1',
        content: 'hello',
        color: '#abcdef',
      }),
    ]);
    expect(model.records).toEqual({ 'public.users': 2 });
    expect(model.views).toEqual([]);
  });

  it('omits project and records when absent', () => {
    const m = compileOk('Table a {\n  id int\n}\n');
    expect(m.project).toBeUndefined();
    expect(m.records).toBeUndefined();
  });
});

describe('compileDbml: table partials', () => {
  const model = compileOk(`TablePartial a [headerColor: #111111, note: 'from a'] {
  id int [pk]
  x int
  owner_id int [ref: > owners.id]
  Indexes {
    x
  }
  checks {
    \`x > 0\` [name: 'x_pos']
  }
}
TablePartial b [headerColor: #222222] {
  x varchar
  y int
}
Table owners {
  id int [pk]
}
Table t [note: 'own'] {
  ~a
  x bigint
  ~b
  z int
}
`);

  it('expands partials like @dbml/core: own fields win, later partials win, injection order kept', () => {
    const t = table(model, 'public.t');
    expect(t.partials).toEqual(['a', 'b']);
    expect(t.columns.map((c) => [c.name, c.type, c.fromPartial])).toEqual([
      ['id', 'int', 'a'],
      ['owner_id', 'int', 'a'],
      ['x', 'bigint', null],
      ['y', 'int', 'b'],
      ['z', 'int', null],
    ]);
    expect(t.note).toBe('own');
    expect(t.headerColor).toBe('#222222');
    expect(t.indexes).toEqual([
      expect.objectContaining({ columns: [{ value: 'x', kind: 'column' }], fromPartial: 'a' }),
    ]);
    expect(t.checks).toEqual([{ name: 't.x_pos', expression: 'x > 0', fromPartial: 'a' }]);
  });

  it('synthesises refs for inline refs inside partials', () => {
    expect(model.refs).toEqual([
      expect.objectContaining({
        id: 'ref:public.owners(id)<public.t(owner_id)',
        from: expect.objectContaining({ tableId: 'public.owners', columns: ['id'] }),
        to: expect.objectContaining({
          tableId: 'public.t',
          columns: ['owner_id'],
          cardinality: 'many',
        }),
        fromPartial: 'a',
      }),
    ]);
    expect(table(model, 'public.t').columns.find((c) => c.name === 'owner_id')?.isFk).toBe(true);
  });
});

describe('compileDbml: diagnostics', () => {
  it('reports a syntax error with 1-based line/column and no model', () => {
    const src = 'Table a {\n  id int [pk]\n  name varchar [nul]\n}\n';
    const { model, diagnostics } = compileDbml(src);
    expect(model).toBeNull();
    const offset = src.indexOf('nul]');
    expect(diagnostics).toEqual([
      {
        severity: 'error',
        code: 3025,
        message: expect.stringContaining("'nul'"),
        file: 'main.dbml',
        start: { line: 3, column: 17, offset },
        end: { line: 3, column: 20, offset: offset + 3 },
      },
    ]);
  });

  it('reports an unclosed block', () => {
    const { model, diagnostics } = compileDbml('Table a {\n  id int [pk]\n');
    expect(model).toBeNull();
    expect(diagnostics[0]).toMatchObject({
      severity: 'error',
      message: "Expect a closing brace '}'",
      start: { line: 3, column: 1 },
    });
  });

  it('reports unknown ref targets', () => {
    const { diagnostics } = compileDbml('Table a {\n  id int\n}\nRef: a.id > b.id\n');
    expect(diagnostics).toEqual([
      expect.objectContaining({ code: 4000, start: { line: 4, column: 13, offset: 33 } }),
    ]);
  });

  it('keeps the model when the parser still returns one', () => {
    const { model, diagnostics } = compileDbml(
      'Table a {\n  id int\n}\nRecords a(id) {\n  1\n}\nRecords a(id) {\n  2\n}\n',
    );
    expect(diagnostics.map((d) => d.code)).toContain(3087);
    expect(model?.tables.map((t) => t.id)).toEqual(['public.a']);
  });

  it('strips a BOM and counts CRLF lines; offsets index the original string', () => {
    const src = '﻿Table a {\r\n  id int\r\n  x\r\n}\r\n';
    const { diagnostics } = compileDbml(src);
    expect(diagnostics).toEqual([
      expect.objectContaining({
        message: 'A column must have a type',
        start: { line: 3, column: 3, offset: src.indexOf('x') },
      }),
    ]);
  });

  it('never throws', () => {
    for (const bad of [
      '',
      '}}}',
      'Table',
      'Ref: >',
      '\u0000\u0001',
      'Table a { id int [ref: > a.id, ref: < a.id] }',
    ]) {
      expect(() => compileDbml(bad)).not.toThrow();
    }
    expect(compileDbml('').model).toMatchObject({ tables: [], refs: [] });
  });
});
