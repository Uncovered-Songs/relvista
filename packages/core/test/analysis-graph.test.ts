import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileDbml, type DiagramModel, type Ref, type Table } from '../src/model/index.js';
import { neighborhood, resolveTableRef, shortestPath } from '../src/analysis/index.js';

function compile(src: string): DiagramModel {
  const { model, diagnostics } = compileDbml(src);
  expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  if (!model) throw new Error('no model');
  return model;
}

const large = compile(
  readFileSync(new URL('../../../examples/14-large.dbml', import.meta.url), 'utf8'),
);

const SPAN = {
  file: 'x.dbml',
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

/** A synthetic model with tables t0..t(n-1) and one ref per edge. */
function graphModel(n: number, edges: Array<[number, number, boolean?]>): DiagramModel {
  const tables: Table[] = Array.from({ length: n }, (_, i) => ({
    id: `public.t${i}`,
    schema: 'public',
    name: `t${i}`,
    alias: null,
    note: null,
    headerColor: null,
    columns: [],
    indexes: [],
    checks: [],
    groupId: null,
    partials: [],
    span: SPAN,
  }));
  const refs: Ref[] = edges.map(([a, b, inactive], k) => ({
    id: `ref:${k}`,
    name: null,
    from: {
      tableId: `public.t${a}`,
      columns: ['id'],
      cardinality: 'many',
      optional: false,
      raw: '*',
    },
    to: { tableId: `public.t${b}`, columns: ['id'], cardinality: 'one', optional: false, raw: '1' },
    relation: '>',
    fkSide: 'from',
    onDelete: null,
    onUpdate: null,
    color: null,
    inactive: inactive === true,
    note: null,
    fromPartial: null,
    span: SPAN,
  }));
  return {
    entry: 'x.dbml',
    files: ['x.dbml'],
    tables,
    refs,
    enums: [],
    groups: [],
    stickyNotes: [],
    views: [],
  };
}

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Independent reference: all-pairs hop distances by repeated relaxation (Bellman-Ford style). */
function bruteDistances(m: DiagramModel, includeInactive: boolean): number[][] {
  const n = m.tables.length;
  const idx = (id: string) => m.tables.findIndex((t) => t.id === id);
  const d = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 0 : Infinity)),
  );
  for (let round = 0; round < n; round++) {
    for (const r of m.refs) {
      if (!includeInactive && r.inactive) continue;
      const a = idx(r.from.tableId);
      const b = idx(r.to.tableId);
      for (let s = 0; s < n; s++) {
        const row = d[s] as number[];
        row[b] = Math.min(row[b] as number, (row[a] as number) + 1);
        row[a] = Math.min(row[a] as number, (row[b] as number) + 1);
      }
    }
  }
  return d;
}

/** Lexicographically smallest shortest path by exhaustive enumeration of simple paths. */
function bruteLexPath(m: DiagramModel, from: number, to: number, inc: boolean): number[] | null {
  const n = m.tables.length;
  const adj = (u: number) => {
    const out: number[] = [];
    for (const r of m.refs) {
      if (!inc && r.inactive) continue;
      const a = Number(r.from.tableId.slice(8));
      const b = Number(r.to.tableId.slice(8));
      if (a === u && b !== u) out.push(b);
      if (b === u && a !== u) out.push(a);
    }
    return out;
  };
  let best: number[] | null = null;
  const walk = (path: number[]) => {
    const u = path[path.length - 1] as number;
    if (best && path.length > best.length) return;
    if (u === to) {
      if (!best || path.length < best.length || lexLess(path, best)) best = [...path];
      return;
    }
    if (path.length > n) return;
    for (const v of adj(u)) if (!path.includes(v)) walk([...path, v]);
  };
  walk([from]);
  return best;
}

function lexLess(a: number[], b: number[]): boolean {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if ((a[i] as number) !== (b[i] as number)) return (a[i] as number) < (b[i] as number);
  }
  return a.length < b.length;
}

describe('neighborhood', () => {
  it('counts hops 0/1/2 on 14-large', () => {
    expect(large.tables).toHaveLength(61);
    expect(large.refs).toHaveLength(94);
    const counts = (id: string, hops: number) => {
      const s = neighborhood(large, [id], hops);
      return [s.tableIds.length, s.refIds.length];
    };
    expect(counts('public.organizations', 0)).toEqual([1, 0]);
    expect(counts('public.organizations', 1)).toEqual([12, 15]);
    expect(counts('public.organizations', 2)).toEqual([30, 45]);
    expect(counts('public.users', 0)).toEqual([1, 0]);
    expect(counts('public.users', 1)).toEqual([25, 38]);
    expect(counts('public.users', 2)).toEqual([39, 69]);
    expect(counts('public.invoices', 1)).toEqual([5, 5]);
    expect(counts('public.invoices', 2)).toEqual([17, 21]);
    // Everything connected except one isolated table.
    expect(counts('public.users', Infinity)).toEqual([60, 94]);
    const both = neighborhood(large, ['public.users', 'public.organizations', 'nope'], 1);
    expect([both.tableIds.length, both.refIds.length]).toEqual([34, 60]);
  });

  it('agrees with a brute-force distance computation and keeps model order', () => {
    const d = bruteDistances(large, true);
    const ids = large.tables.map((t) => t.id);
    for (const seed of [0, 2, 17, 31]) {
      for (const hops of [0, 1, 2, 3]) {
        const s = neighborhood(large, [ids[seed] as string], hops);
        const expected = ids.filter((_, j) => (d[seed]?.[j] as number) <= hops);
        expect(s.tableIds).toEqual(expected);
        const kept = new Set(expected);
        expect(s.refIds).toEqual(
          large.refs
            .filter((r) => kept.has(r.from.tableId) && kept.has(r.to.tableId))
            .map((r) => r.id),
        );
      }
    }
  });

  it('includeInactive: false drops inactive refs', () => {
    const m = graphModel(4, [
      [0, 1],
      [1, 2, true],
      [2, 3],
      [0, 2, true],
    ]);
    expect(neighborhood(m, ['public.t0'], 1).tableIds).toEqual([
      'public.t0',
      'public.t1',
      'public.t2',
    ]);
    const active = neighborhood(m, ['public.t0'], 5, { includeInactive: false });
    expect(active).toEqual({ tableIds: ['public.t0', 'public.t1'], refIds: ['ref:0'] });
    // Inactive refs between kept tables are not listed either.
    const all = neighborhood(m, ['public.t0', 'public.t2'], 0, { includeInactive: false });
    expect(all).toEqual({ tableIds: ['public.t0', 'public.t2'], refIds: [] });
    expect(neighborhood(m, ['public.t0', 'public.t2'], 0).refIds).toEqual(['ref:3']);
  });

  it('treats negative hops as 0 and ignores unknown ids', () => {
    expect(neighborhood(large, ['public.users'], -3).tableIds).toEqual(['public.users']);
    expect(neighborhood(large, ['missing'], 2)).toEqual({ tableIds: [], refIds: [] });
  });

  it('keeps self-refs of kept tables', () => {
    const m = graphModel(2, [
      [0, 0],
      [0, 1],
    ]);
    expect(neighborhood(m, ['public.t0'], 0).refIds).toEqual(['ref:0']);
  });
});

describe('shortestPath', () => {
  it('matches brute force on 300 seeded random graphs', () => {
    const random = rng(20261121);
    for (let g = 0; g < 300; g++) {
      const n = 2 + Math.floor(random() * 8);
      const e = Math.floor(random() * n * 1.6);
      const edges: Array<[number, number, boolean?]> = [];
      for (let k = 0; k < e; k++) {
        edges.push([
          Math.floor(random() * n),
          Math.floor(random() * n),
          random() < 0.2 ? true : undefined,
        ]);
      }
      const m = graphModel(n, edges);
      const inc = g % 2 === 0;
      const d = bruteDistances(m, inc);
      const from = Math.floor(random() * n);
      const to = Math.floor(random() * n);
      const options = { includeInactive: inc };
      const got = shortestPath(m, `public.t${from}`, `public.t${to}`, options);
      const expected = d[from]?.[to] as number;
      if (expected === Infinity) {
        expect(got, `graph ${g}`).toBeNull();
        continue;
      }
      expect(got?.length, `graph ${g}`).toBe(expected);
      // Tie-break: the lexicographically smallest index sequence.
      const lex = bruteLexPath(m, from, to, inc) as number[];
      expect(lex.length - 1).toBe(expected);
      expect(got?.tableIds, `graph ${g}`).toEqual(
        [...lex].sort((a, b) => a - b).map((i) => `public.t${i}`),
      );
      // One ref per hop: the first ref in model order between consecutive tables.
      const refIds: string[] = [];
      for (let k = 1; k < lex.length; k++) {
        const a = `public.t${lex[k - 1]}`;
        const b = `public.t${lex[k]}`;
        const ref = m.refs.find(
          (r) =>
            (inc || !r.inactive) &&
            ((r.from.tableId === a && r.to.tableId === b) ||
              (r.from.tableId === b && r.to.tableId === a)),
        );
        refIds.push(ref?.id as string);
      }
      expect(got?.refIds).toEqual(m.refs.filter((r) => refIds.includes(r.id)).map((r) => r.id));
      // Deterministic.
      expect(shortestPath(m, `public.t${from}`, `public.t${to}`, options)).toEqual(got);
    }
  });

  it('breaks ties by the smallest model-order index sequence', () => {
    // 0 → {3, 1} → 4: both paths have length 2; via 1 wins over via 3.
    const m = graphModel(5, [
      [0, 3],
      [3, 4],
      [4, 1],
      [1, 0],
    ]);
    expect(shortestPath(m, 'public.t0', 'public.t4')).toEqual({
      tableIds: ['public.t0', 'public.t1', 'public.t4'],
      refIds: ['ref:2', 'ref:3'],
      length: 2,
    });
    // From the other side, 4 → 1 → 0 (sequence 4,1,0 < 4,3,0).
    expect(shortestPath(m, 'public.t4', 'public.t0')?.tableIds).toEqual([
      'public.t0',
      'public.t1',
      'public.t4',
    ]);
  });

  it('handles same table, unknown ids, unconnected tables and inactive refs', () => {
    const m = graphModel(4, [
      [0, 1],
      [1, 2, true],
    ]);
    expect(shortestPath(m, 'public.t1', 'public.t1')).toEqual({
      tableIds: ['public.t1'],
      refIds: [],
      length: 0,
    });
    expect(shortestPath(m, 'public.t0', 'nope')).toBeNull();
    expect(shortestPath(m, 'public.t0', 'public.t3')).toBeNull();
    expect(shortestPath(m, 'public.t0', 'public.t2')?.length).toBe(2);
    expect(shortestPath(m, 'public.t0', 'public.t2', { includeInactive: false })).toBeNull();
  });

  it('finds paths on 14-large', () => {
    const p = shortestPath(large, 'public.payments', 'public.issue_comments');
    expect(p).not.toBeNull();
    const d = bruteDistances(large, true);
    const ids = large.tables.map((t) => t.id);
    expect(p?.length).toBe(
      d[ids.indexOf('public.payments')]?.[ids.indexOf('public.issue_comments')],
    );
    expect(p?.refIds).toHaveLength(p?.length as number);
    expect(p?.tableIds).toHaveLength((p?.length as number) + 1);
  });
});

describe('resolveTableRef', () => {
  const m = compile(`
Table users as U { id int }
Table auth.users { id int }
Table billing.accounts as acc { id int }
Table crm.accounts { id int }
Table crm.Leads { id int }
Table sales.leads { id int }
Table sales.deals as D { id int }
Table "My Table" { id int }
`);

  it('resolves exact ids, public names, unique names and aliases', () => {
    expect(resolveTableRef(m, 'auth.users')).toBe('auth.users');
    expect(resolveTableRef(m, 'public.users')).toBe('public.users');
    // public.<name> wins over the same name in another schema.
    expect(resolveTableRef(m, 'users')).toBe('public.users');
    expect(resolveTableRef(m, 'deals')).toBe('sales.deals');
    expect(resolveTableRef(m, 'acc')).toBe('billing.accounts');
    expect(resolveTableRef(m, 'U')).toBe('public.users');
    expect(resolveTableRef(m, 'D')).toBe('sales.deals');
    expect(resolveTableRef(m, '  My Table ')).toBe('public.My Table');
  });

  it('falls back to a case-insensitive unique name', () => {
    expect(resolveTableRef(m, 'USERS')).toBe(null); // users and auth.users: ambiguous
    expect(resolveTableRef(m, 'Auth.Users')).toBe('auth.users');
    expect(resolveTableRef(m, 'DEALS')).toBe('sales.deals');
    expect(resolveTableRef(m, 'my table')).toBe('public.My Table');
  });

  it('returns null for unknown or ambiguous references', () => {
    // Same name in two schemas, none in public.
    expect(resolveTableRef(m, 'accounts')).toBeNull();
    // Exact bare name is unique (sales.leads) even though crm.Leads differs only by case.
    expect(resolveTableRef(m, 'leads')).toBe('sales.leads');
    expect(resolveTableRef(m, 'LEADS')).toBeNull();
    expect(resolveTableRef(m, 'nope')).toBeNull();
    expect(resolveTableRef(m, '')).toBeNull();
  });
});
