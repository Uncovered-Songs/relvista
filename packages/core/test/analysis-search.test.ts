import { describe, expect, it } from 'vitest';
import { compileDbml, type DiagramModel } from '../src/model/index.js';
import { searchModel, type SearchHit } from '../src/analysis/index.js';

function compile(src: string): DiagramModel {
  const { model, diagnostics } = compileDbml(src);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  if (!model) throw new Error('no model');
  return model;
}

const SRC = `
Enum order_status {
  open
  closed
}
Enum billing.currency {
  eur
}
Table users as U {
  id int [pk]
  user_name varchar
  email varchar
}
Table user_sessions {
  id int [pk]
  user_id int [ref: > users.id]
}
Table superuser {
  id int [pk]
}
Table orders {
  id int [pk]
  user_id int [ref: > users.id]
  status order_status
}
Table billing.invoices {
  id int [pk]
  order_id int [ref: > orders.id]
}
Table "café" {
  id int [pk]
  crème varchar
}
Table OrderItems {
  id int [pk]
}
TableGroup sales {
  orders
  billing.invoices
}
Note users_note {
  'about users'
}
DiagramView billing {
  Tables { billing.invoices }
}
`;

const model = compile(SRC);
const brief = (hits: SearchHit[]) => hits.map((h) => `${h.kind}:${h.label}:${h.score}`);
/** The matched parts of the label, for readable assertions on `ranges`. */
const marked = (h: SearchHit) => h.ranges.map(([s, e]) => h.label.slice(s, e)).join('|');

describe('searchModel', () => {
  it('returns nothing for an empty or blank query', () => {
    expect(searchModel(model, '')).toEqual([]);
    expect(searchModel(model, '   ')).toEqual([]);
  });

  it('ranks exact > prefix > word-start > substring > subsequence', () => {
    const hits = searchModel(model, 'user', { kinds: ['table'] });
    expect(brief(hits)).toEqual([
      // "users" is a prefix; "user_sessions" a prefix; "superuser" a substring.
      'table:users (U):80',
      'table:user_sessions:80',
      'table:superuser:40',
    ]);
    const table: Array<[string, string, number]> = [
      ['orders', 'orders', 100],
      ['order', 'orders', 80],
      ['items', 'OrderItems', 60], // camelCase word start
      ['sessions', 'user_sessions', 60], // after "_"
      ['rder', 'orders', 40],
      ['uss', 'user_sessions', 20],
    ];
    for (const [query, label, score] of table) {
      const hit = searchModel(model, query, { kinds: ['table'] }).find((h) => h.label === label);
      expect(hit?.score, `${query} → ${label}`).toBe(score);
    }
  });

  it('puts tables before columns on equal scores, then model order', () => {
    const hits = searchModel(model, 'id', { kinds: ['table', 'column'] });
    // Every table has an exact "id" column; tables do not match "id" except by subsequence.
    const exact = hits.filter((h) => h.score === 100);
    expect(exact.map((h) => h.id)).toEqual(model.tables.map((t) => t.id));
    expect(exact.every((h) => h.kind === 'column' && h.column === 'id')).toBe(true);
    const orders = searchModel(model, 'orders');
    expect(orders[0]).toMatchObject({ kind: 'table', id: 'public.orders', score: 100 });
    const userId = searchModel(model, 'user_id');
    expect(brief(userId)).toEqual([
      'column:user_sessions.user_id:100',
      'column:orders.user_id:100',
      'column:user_sessions.id:20', // "user_sessions.id" contains u-s-e-r-_-i-d in order
    ]);
  });

  it('is accent- and case-insensitive', () => {
    const cafe = searchModel(model, 'CAFE');
    expect(cafe[0]).toMatchObject({ kind: 'table', id: 'public.café', label: 'café', score: 100 });
    expect(marked(cafe[0] as SearchHit)).toBe('café');
    const creme = searchModel(model, 'creme', { kinds: ['column'] });
    expect(creme[0]).toMatchObject({ label: 'café.crème', column: 'crème', score: 100 });
    expect(marked(creme[0] as SearchHit)).toBe('crème');
    // A query with accents matches unaccented names too.
    expect(searchModel(model, 'órders')[0]?.id).toBe('public.orders');
  });

  it('keeps ranges correct for decomposed (NFD) labels', () => {
    const nfd = compile(`Table "cafés" {\n  id int\n}`);
    const [hit] = searchModel(nfd, 'cafe', { kinds: ['table'] });
    expect(hit?.score).toBe(80);
    // The combining accent belongs to the "e".
    expect(hit?.ranges).toEqual([[0, 5]]);
  });

  it('matches aliases', () => {
    const hits = searchModel(model, 'u', { kinds: ['table'] });
    expect(hits[0]).toMatchObject({ id: 'public.users', label: 'users (U)', score: 100 });
    expect(hits[0]?.ranges).toEqual([[7, 8]]);
  });

  it('matches schema-qualified names', () => {
    const hits = searchModel(model, 'billing.invoices');
    expect(hits[0]).toMatchObject({ kind: 'table', id: 'billing.invoices', score: 100 });
    expect(hits[0]?.ranges).toEqual([[0, 16]]);
    const bare = searchModel(model, 'invoices', { kinds: ['table'] });
    expect(bare[0]).toMatchObject({ label: 'billing.invoices', score: 100 });
    expect(bare[0]?.ranges).toEqual([[8, 16]]);
    const col = searchModel(model, 'billing.invoices.order_id');
    expect(col[0]).toMatchObject({ kind: 'column', column: 'order_id', score: 100 });
    const enumHit = searchModel(model, 'billing.currency');
    expect(enumHit[0]).toMatchObject({
      kind: 'enum',
      id: 'billing.currency',
      label: 'billing.currency (enum)',
      score: 100,
    });
  });

  it('finds columns by name and by table.column', () => {
    const hits = searchModel(model, 'users.email');
    expect(hits[0]).toMatchObject({
      kind: 'column',
      id: 'public.users',
      column: 'email',
      label: 'users.email',
      score: 100,
    });
    expect(hits[0]?.ranges).toEqual([[0, 11]]);
    const byName = searchModel(model, 'email');
    expect(byName[0]).toMatchObject({ column: 'email', score: 100, ranges: [[6, 11]] });
    const word = searchModel(model, 'name', { kinds: ['column'] });
    expect(word[0]).toMatchObject({ label: 'users.user_name', score: 60, ranges: [[11, 15]] });
  });

  it('finds enums, groups, notes and views by name', () => {
    expect(brief(searchModel(model, 'sales'))).toEqual(['group:sales (group):100']);
    expect(searchModel(model, 'sales')[0]?.id).toBe('group:sales');
    expect(searchModel(model, 'users_note')[0]).toMatchObject({
      kind: 'note',
      id: 'note:users_note',
      label: 'users_note (note)',
    });
    // Note content is not searched.
    expect(searchModel(model, 'about')).toEqual([]);
    const billing = searchModel(model, 'billing', { kinds: ['view'] });
    expect(billing).toEqual([
      { kind: 'view', id: 'billing', label: 'billing (view)', ranges: [[0, 7]], score: 100 },
    ]);
    expect(searchModel(model, 'order_status')[0]).toMatchObject({
      kind: 'enum',
      id: 'public.order_status',
      label: 'order_status (enum)',
    });
  });

  it('filters by kind and applies the limit', () => {
    expect(searchModel(model, 'o').length).toBeGreaterThan(5);
    expect(searchModel(model, 'o', { limit: 3 })).toHaveLength(3);
    expect(searchModel(model, 'o', { limit: 0 })).toEqual([]);
    expect(searchModel(model, 'o', { limit: 3 })).toEqual(searchModel(model, 'o').slice(0, 3));
    const kinds = new Set(searchModel(model, 'o', { kinds: ['enum', 'view'] }).map((h) => h.kind));
    expect([...kinds].sort()).toEqual(['enum']);
  });

  it('merges adjacent subsequence ranges', () => {
    const [hit] = searchModel(model, 'usrses', { kinds: ['table'] });
    expect(hit).toMatchObject({ label: 'user_sessions', score: 20 });
    expect(marked(hit as SearchHit)).toBe('us|r|ses');
  });

  it('is deterministic', () => {
    expect(searchModel(model, 'e')).toEqual(searchModel(model, 'e'));
  });
});
