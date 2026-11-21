import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileDbml, type CompileInput, type DiagramModel } from '../src/model/index.js';
import { diffModels, formatDiff, mergeForDiff, type ModelDiff } from '../src/analysis/index.js';

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

function compile(input: CompileInput): DiagramModel {
  const { model, diagnostics } = compileDbml(input);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  if (!model) throw new Error('no model');
  return model;
}

function loadExamples(): [string, DiagramModel][] {
  const out: [string, DiagramModel][] = [];
  for (const name of readdirSync(examplesDir).sort()) {
    const full = join(examplesDir, name);
    if (statSync(full).isDirectory())
      out.push([name, compile({ files: collectDbml(full), entry: 'main.dbml' })]);
    else if (name.endsWith('.dbml')) out.push([name, compile(readFileSync(full, 'utf8'))]);
  }
  return out;
}

const examples = loadExamples();
const example = (name: string) => examples.find(([n]) => n === name)?.[1] as DiagramModel;

const BASE = `
Project shop {
  database_type: 'PostgreSQL'
}
Enum status {
  open
  closed
}
Table users {
  id int [pk]
  email varchar [not null]
  name varchar
}
Table orders {
  id int [pk]
  user_id int [ref: > users.id]
  status status
  total numeric(10,2)
  indexes {
    user_id
  }
}
Table products {
  id int [pk]
  title varchar
}
Ref: orders.id - products.id
TableGroup sales [color: #112233] {
  orders
  products
}
Note todo {
  'later'
}
DiagramView main {
  Tables { users }
}
`;

/** Applies text replacements to BASE, failing loudly when a pattern is missing. */
function edited(...edits: Array<[string | RegExp, string]>): string {
  let src = BASE;
  for (const [from, to] of edits) {
    const next = src.replace(from, to);
    if (next === src) throw new Error(`edit did not apply: ${String(from)}`);
    src = next;
  }
  return src;
}

const base = compile(BASE);

/** The non-empty parts of a diff, without `summary`/`empty`, for exact comparisons. */
function entries(d: ModelDiff): Partial<ModelDiff> {
  const out: Record<string, unknown> = {};
  for (const key of ['tables', 'refs', 'enums', 'groups', 'notes', 'views', 'project'] as const) {
    if (d[key].length > 0) out[key] = d[key];
  }
  return out as Partial<ModelDiff>;
}

const tableEntry = (id: string, rest: Partial<ModelDiff['tables'][number]> = {}) => ({
  id,
  status: 'changed',
  changes: [],
  columns: [],
  indexes: [],
  checks: [],
  ...rest,
});

describe('diffModels', () => {
  for (const [name, model] of examples) {
    it(`${name}: identity diff is empty`, () => {
      const d = diffModels(model, model);
      expect(d.empty).toBe(true);
      expect(d.summary).toEqual({ added: 0, removed: 0, changed: 0 });
      expect(entries(d)).toEqual({});
      // A fresh compile of the same source is equal too.
      expect(formatDiff(d)).toBe('No changes');
    });
  }

  it('add column', () => {
    const d = diffModels(base, compile(edited(['name varchar\n', 'name varchar\n  age int\n'])));
    expect(entries(d)).toEqual({
      tables: [
        tableEntry('public.users', { columns: [{ name: 'age', status: 'added', changes: [] }] }),
      ],
    });
    expect(d.summary).toEqual({ added: 0, removed: 0, changed: 1 });
    expect(d.empty).toBe(false);
  });

  it('drop column', () => {
    const d = diffModels(base, compile(edited(['  name varchar\n', ''])));
    expect(entries(d)).toEqual({
      tables: [
        tableEntry('public.users', { columns: [{ name: 'name', status: 'removed', changes: [] }] }),
      ],
    });
  });

  it('change type and settings', () => {
    const d = diffModels(
      base,
      compile(edited(['email varchar [not null]', "email text [unique, default: 'x']"])),
    );
    expect(entries(d)).toEqual({
      tables: [
        tableEntry('public.users', {
          columns: [
            {
              name: 'email',
              status: 'changed',
              changes: [
                { field: 'type', before: 'varchar', after: 'text' },
                { field: 'notNull', before: true, after: false },
                { field: 'unique', before: false, after: true },
                { field: 'default', before: null, after: { kind: 'string', value: 'x' } },
              ],
            },
          ],
        }),
      ],
    });
  });

  it('column order alone is no change', () => {
    const d = diffModels(
      base,
      compile(
        edited([
          '  email varchar [not null]\n  name varchar\n',
          '  name varchar\n  email varchar [not null]\n',
        ]),
      ),
    );
    expect(d.empty).toBe(true);
  });

  it('rename table with the same columns → renamedFrom, refs and groups follow', () => {
    const after = compile(
      edited(
        ['Table orders {', 'Table purchases {'],
        ['Ref: orders.id', 'Ref: purchases.id'],
        ['  orders\n  products', '  purchases\n  products'],
      ),
    );
    const d = diffModels(base, after);
    expect(entries(d)).toEqual({
      tables: [
        tableEntry('public.purchases', {
          renamedFrom: 'public.orders',
          changes: [{ field: 'name', before: 'orders', after: 'purchases' }],
        }),
      ],
    });
    expect(d.summary).toEqual({ added: 0, removed: 0, changed: 1 });
    const off = diffModels(base, after, { detectRenames: false });
    expect(off.tables.map((t) => [t.id, t.status])).toEqual([
      ['public.purchases', 'added'],
      ['public.orders', 'removed'],
    ]);
    expect(off.refs.map((r) => r.status)).toEqual(['added', 'added', 'removed', 'removed']);
    expect(off.groups).toEqual([
      {
        id: 'group:sales',
        status: 'changed',
        changes: [
          {
            field: 'tables',
            before: ['public.orders', 'public.products'],
            after: ['public.purchases', 'public.products'],
          },
        ],
      },
    ]);
  });

  it('rename with different columns is add + remove', () => {
    const d = diffModels(
      base,
      compile(
        edited(
          [
            'Table products {\n  id int [pk]\n  title varchar',
            'Table items {\n  id int [pk]\n  label varchar',
          ],
          ['products.id', 'items.id'],
          ['  products\n}', '  items\n}'],
        ),
      ),
    );
    expect(d.tables.map((t) => [t.id, t.status, t.renamedFrom])).toEqual([
      ['public.items', 'added', undefined],
      ['public.products', 'removed', undefined],
    ]);
  });

  it('add ref', () => {
    const after = compile(
      edited(['Ref: orders.id', 'Ref: products.title > users.name\nRef: orders.id']),
    );
    const d = diffModels(base, after);
    const added = after.refs.find((r) => r.from.tableId === 'public.products');
    expect(entries(d)).toEqual({ refs: [{ id: added?.id, status: 'added', changes: [] }] });
    expect(d.summary).toEqual({ added: 1, removed: 0, changed: 0 });
  });

  it('toggle inactive and change ref settings', () => {
    const after = compile(
      edited([
        'Ref: orders.id - products.id',
        'Ref: orders.id - products.id [inactive, delete: cascade]',
      ]),
    );
    const d = diffModels(base, after);
    const ref = base.refs.find(
      (r) => r.to.tableId === 'public.products' || r.from.tableId === 'public.products',
    );
    expect(entries(d)).toEqual({
      refs: [
        {
          id: ref?.id,
          status: 'changed',
          changes: [
            { field: 'onDelete', before: null, after: 'cascade' },
            { field: 'inactive', before: false, after: true },
          ],
        },
      ],
    });
  });

  it('change group colour', () => {
    const d = diffModels(base, compile(edited(['#112233', '#445566'])));
    expect(entries(d)).toEqual({
      groups: [
        {
          id: 'group:sales',
          status: 'changed',
          changes: [{ field: 'color', before: '#112233', after: '#445566' }],
        },
      ],
    });
  });

  it('group membership order is no change; membership is', () => {
    expect(
      diffModels(base, compile(edited(['  orders\n  products', '  products\n  orders']))).empty,
    ).toBe(true);
    const d = diffModels(base, compile(edited(['  orders\n  products', '  orders'])));
    expect(d.groups.map((g) => g.changes.map((c) => c.field))).toEqual([['tables']]);
    expect(d.tables).toEqual([
      tableEntry('public.products', {
        changes: [{ field: 'group', before: 'group:sales', after: null }],
      }),
    ]);
  });

  it('add and remove views', () => {
    const added = diffModels(
      base,
      compile(
        edited([
          'DiagramView main',
          'DiagramView extra {\n  Tables { orders }\n}\nDiagramView main',
        ]),
      ),
    );
    expect(entries(added)).toEqual({ views: [{ name: 'extra', status: 'added' }] });
    const removed = diffModels(base, compile(edited([/DiagramView main \{[^}]*\}\n\}/, ''])));
    expect(entries(removed)).toEqual({ views: [{ name: 'main', status: 'removed' }] });
    const changed = diffModels(
      base,
      compile(edited(['Tables { users }', 'Tables { users\n orders }'])),
    );
    expect(entries(changed)).toEqual({ views: [{ name: 'main', status: 'changed' }] });
  });

  it('enum values', () => {
    const d = diffModels(base, compile(edited(['  open\n  closed', '  open\n  pending'])));
    expect(entries(d)).toEqual({
      enums: [
        {
          id: 'public.status',
          status: 'changed',
          values: [
            { name: 'pending', status: 'added' },
            { name: 'closed', status: 'removed' },
          ],
        },
      ],
    });
  });

  it('table fields, indexes, checks, notes and project', () => {
    const d = diffModels(
      base,
      compile(
        edited(
          ['Table users {', "Table users [headercolor: #abcdef, note: 'people'] {"],
          ['    user_id\n', '    user_id [unique]\n    total\n'],
          ['  title varchar\n', '  title varchar\n  checks {\n    `id > 0`\n  }\n'],
          ["'later'", "'now'"],
          ["database_type: 'PostgreSQL'", "database_type: 'MySQL'"],
        ),
      ),
    );
    expect(entries(d)).toEqual({
      tables: [
        tableEntry('public.users', {
          changes: [
            { field: 'note', before: null, after: 'people' },
            { field: 'headerColor', before: null, after: '#abcdef' },
          ],
        }),
        tableEntry('public.orders', {
          indexes: [
            { status: 'changed', label: '(user_id) [unique]' },
            { status: 'added', label: '(total)' },
          ],
        }),
        tableEntry('public.products', { checks: [{ status: 'added', label: '`id > 0`' }] }),
      ],
      notes: [
        {
          id: 'note:todo',
          status: 'changed',
          changes: [{ field: 'content', before: 'later', after: 'now' }],
        },
      ],
      project: [{ field: 'databaseType', before: 'PostgreSQL', after: 'MySQL' }],
    });
    expect(d.summary).toEqual({ added: 0, removed: 0, changed: 5 });
  });

  it('partial columns compare like own columns', () => {
    const own = compile('Table t {\n  id int [pk]\n  created_at timestamp\n}');
    const viaPartial = compile(
      'TablePartial ts {\n  created_at timestamp\n}\nTable t {\n  id int [pk]\n  ~ts\n}',
    );
    expect(viaPartial.tables[0]?.columns[1]?.fromPartial).toBe('ts');
    expect(diffModels(own, viaPartial).tables).toEqual([]);
  });

  it('added and removed tables, enums, groups, notes', () => {
    const after = compile(
      edited(
        [/Enum status \{[^}]*\}\n/, 'Enum kind {\n  a\n}\n'],
        ['  status status\n', '  status kind\n'],
        [/Note todo \{[^}]*\}\n/, "Note other {\n  'x'\n}\n"],
        [/TableGroup sales [^{]*\{[^}]*\}\n/, 'TableGroup crm {\n  users\n}\n'],
        ['Table products {', 'Table billing.invoices {\n  id int [pk]\n}\nTable products {'],
      ),
    );
    const d = diffModels(base, after);
    expect(d.tables.map((t) => [t.id, t.status])).toEqual([
      ['public.users', 'changed'],
      ['public.orders', 'changed'],
      ['billing.invoices', 'added'],
      ['public.products', 'changed'],
    ]);
    expect(d.enums.map((e) => [e.id, e.status])).toEqual([
      ['public.kind', 'added'],
      ['public.status', 'removed'],
    ]);
    expect(d.groups.map((e) => [e.id, e.status])).toEqual([
      ['group:crm', 'added'],
      ['group:sales', 'removed'],
    ]);
    expect(d.notes.map((e) => [e.id, e.status])).toEqual([
      ['note:other', 'added'],
      ['note:todo', 'removed'],
    ]);
  });
});

/** Every table, column and ref of `m` (by table id, renames resolved through `diff`). */
function inventory(m: DiagramModel, rename: Map<string, string> = new Map()) {
  const tableIds = m.tables.map((t) => rename.get(t.id) ?? t.id);
  const columns = m.tables.flatMap((t) =>
    t.columns.map((c) => `${rename.get(t.id) ?? t.id}.${c.name}`),
  );
  return { tableIds, columns, refIds: m.refs.map((r) => r.id) };
}

describe('mergeForDiff', () => {
  const pairs: Array<[string, DiagramModel, DiagramModel]> = [];
  for (let i = 0; i + 1 < examples.length; i++) {
    const [a, ma] = examples[i] as [string, DiagramModel];
    const [b, mb] = examples[i + 1] as [string, DiagramModel];
    pairs.push([`${a} → ${b}`, ma, mb], [`${b} → ${a}`, mb, ma]);
  }
  const scripted = compile(
    edited(
      ['  name varchar\n', ''],
      ['Table orders {', 'Table purchases {'],
      ['Ref: orders.id', 'Ref: purchases.id'],
      ['  orders\n  products', '  purchases\n  products'],
      [/Table products \{[^}]*\}\n/, ''],
      ['  products\n}', '}'],
      ['Ref: purchases.id - products.id', ''],
    ),
  );
  pairs.push(['scripted', base, scripted]);

  for (const [name, before, after] of pairs) {
    it(`${name}: contains every table, column and ref of both`, () => {
      const diff = diffModels(before, after);
      const merged = mergeForDiff(before, after, diff);
      const rename = new Map(
        diff.tables.filter((t) => t.renamedFrom).map((t) => [t.renamedFrom as string, t.id]),
      );
      const m = inventory(merged);
      const b = inventory(before, rename);
      const a = inventory(after);
      for (const id of [...a.tableIds, ...b.tableIds]) expect(m.tableIds).toContain(id);
      for (const id of [...a.columns, ...b.columns]) expect(m.columns).toContain(id);
      // Refs: all of `after`, plus the removed ones of `before` (kept refs on a renamed table
      // carry their new id in `after`).
      const removedRefs = diff.refs.filter((r) => r.status === 'removed').map((r) => r.id);
      for (const id of [...a.refIds, ...removedRefs]) expect(m.refIds).toContain(id);
      expect(m.refIds).toHaveLength(a.refIds.length + removedRefs.length);
      if (rename.size === 0) for (const id of b.refIds) expect(m.refIds).toContain(id);
      expect(new Set(m.tableIds).size).toBe(m.tableIds.length);
      expect(new Set(m.refIds).size).toBe(m.refIds.length);
      // Every ref endpoint is a table of the merged model.
      for (const r of merged.refs) {
        expect(m.tableIds).toContain(r.from.tableId);
        expect(m.tableIds).toContain(r.to.tableId);
      }
      // `after` comes first and unchanged in order.
      expect(merged.tables.slice(0, after.tables.length).map((t) => t.id)).toEqual(
        after.tables.map((t) => t.id),
      );
    });
  }

  it('re-inserts removed columns after their former predecessor with before: spans', () => {
    const after = compile(
      edited(
        ['  email varchar [not null]\n', ''],
        ['  user_id int [ref: > users.id]\n', ''],
        ['    user_id\n', '    total\n'],
      ),
    );
    const diff = diffModels(base, after);
    const merged = mergeForDiff(base, after, diff);
    const users = merged.tables.find((t) => t.id === 'public.users');
    expect(users?.columns.map((c) => c.name)).toEqual(['id', 'email', 'name']);
    expect(users?.columns[1]?.span.file).toBe('before:main.dbml'.replace('main.dbml', base.entry));
    expect(users?.columns[0]?.span.file).toBe(after.entry);
    const orders = merged.tables.find((t) => t.id === 'public.orders');
    expect(orders?.columns.map((c) => c.name)).toEqual(['id', 'user_id', 'status', 'total']);
    const removedRef =
      merged.refs.find(
        (r) => r.from.tableId === 'public.orders' && r.to.tableId === 'public.users',
      ) ??
      merged.refs.find(
        (r) => r.to.tableId === 'public.orders' && r.from.tableId === 'public.users',
      );
    expect(removedRef?.span.file).toBe(`before:${base.entry}`);
    // Removed tables go last.
    const dropped = compile(
      edited(
        [/Table products \{[^}]*\}\n/, ''],
        ['  products\n}', '}'],
        ['Ref: orders.id - products.id', ''],
      ),
    );
    const m2 = mergeForDiff(base, dropped, diffModels(base, dropped));
    expect(m2.tables.map((t) => t.id)).toEqual([
      'public.users',
      'public.orders',
      'public.products',
    ]);
    expect(m2.tables[2]?.span.file).toBe(`before:${base.entry}`);
    expect(m2.tables[2]?.columns.every((c) => c.span.file.startsWith('before:'))).toBe(true);
  });

  it('a removed first column goes first', () => {
    const before = compile('Table t {\n  a int\n  b int\n  c int\n}');
    const after = compile('Table t {\n  c int\n  b int\n}');
    const merged = mergeForDiff(before, after, diffModels(before, after));
    expect(merged.tables[0]?.columns.map((c) => c.name)).toEqual(['a', 'c', 'b']);
    // Several removed columns keep their former relative order.
    const after2 = compile('Table t {\n  c int\n}');
    const merged2 = mergeForDiff(before, after2, diffModels(before, after2));
    expect(merged2.tables[0]?.columns.map((c) => c.name)).toEqual(['a', 'b', 'c']);
  });
});

describe('formatDiff', () => {
  it('formats a scripted diff', () => {
    const after = compile(
      edited(
        ['email varchar [not null]', 'email text [not null]'],
        ['  name varchar\n', '  nickname varchar\n'],
        ['Table orders {', 'Table purchases {'],
        ['Ref: orders.id', 'Ref: purchases.id'],
        ['  orders\n  products', '  purchases\n  products'],
        ['#112233', '#445566'],
        ['Ref: purchases.id - products.id', 'Ref: purchases.id - products.id [inactive]'],
        ['  open\n  closed', '  open\n  pending'],
        ['Table products {', 'Table billing.invoices {\n  id int [pk]\n}\nTable products {'],
      ),
    );
    const d = diffModels(base, after);
    expect(formatDiff(d)).toMatchInlineSnapshot(`
      "1 added, 0 removed, 5 changed
      ~ users.email: varchar → text
      + column users.nickname
      - column users.name
      ~ table orders → purchases
      + table billing.invoices
      ~ ref purchases.id - products.id (inactive): false → true
      + enum value status.pending
      - enum value status.closed
      ~ group sales (color): #112233 → #445566"
    `);
    expect(formatDiff(d, { markdown: true })).toMatchInlineSnapshot(`
      "**1 added, 0 removed, 5 changed**

      \`\`\`diff
      ~ users.email: varchar → text
      + column users.nickname
      - column users.name
      ~ table orders → purchases
      + table billing.invoices
      ~ ref purchases.id - products.id (inactive): false → true
      + enum value status.pending
      - enum value status.closed
      ~ group sales (color): #112233 → #445566
      \`\`\`"
    `);
  });

  it('is stable for two example files', () => {
    const d = diffModels(example('02-ecommerce.dbml'), example('14-large.dbml'));
    const text = formatDiff(d);
    expect(text).toBe(
      formatDiff(diffModels(example('02-ecommerce.dbml'), example('14-large.dbml'))),
    );
    const lines = text.split('\n');
    expect(lines[0]).toMatchInlineSnapshot(`"161 added, 24 removed, 4 changed"`);
    expect(lines.length).toMatchInlineSnapshot(`212`);
    expect(lines.filter((l) => l.startsWith('~ users'))).toMatchInlineSnapshot(`
      [
        "~ users (group): ∅ → identity",
        "~ users.id: integer → bigint",
        "~ users.email: varchar(255) → varchar(320)",
        "~ users.created_at: timestamp → timestamptz",
        "~ users.created_at (notNull): false → true",
      ]
    `);
    expect(
      formatDiff(diffModels(example('05-table-groups.dbml'), example('06-header-colors.dbml'))),
    ).toMatchInlineSnapshot(`
      "7 added, 15 removed, 1 changed
      ~ users (headerColor): ∅ → #3498DB
      ~ users (group): people → ∅
      + column users.username
      - column users.country_code
      + table teams
      + table memberships
      + table audit_log
      + table settings
      - table merchants
      - table countries
      - table products
      - table orders
      - table billing.invoices
      - table billing.invoice_lines
      + ref memberships.user_id > users.id
      + ref memberships.team_id > teams.id
      + ref audit_log.actor_id > users.id
      - ref merchants.id < products.merchant_id
      - ref products.id < orders.product_id
      - ref countries.code < users.country_code
      - ref orders.id < billing.invoices.order_id
      - ref billing.invoices.id < billing.invoice_lines.invoice_id
      - group e_commerce
      - group catalog
      - group billing_group
      - group people"
    `);
  });

  it('says so when nothing changed', () => {
    expect(formatDiff(diffModels(base, base))).toBe('No changes');
    expect(formatDiff(diffModels(base, base), { markdown: true })).toBe('**No changes**');
  });
});
