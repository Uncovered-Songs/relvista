import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW,
  LAYOUT_SCHEMA_ID,
  emptyLayout,
  groupId,
  layoutFileName,
  layoutSchema,
  mergeViewDefaults,
  noteId,
  parseLayout,
  pruneLayout,
  renameNode,
  serializeLayout,
  tableId,
  type Layout,
} from '../src/layout/index.js';

function sample(): Layout {
  return {
    $schema: LAYOUT_SCHEMA_ID,
    version: 1,
    views: {
      '*': {
        nodes: {
          'public.users': { x: 10, y: 20, w: 200 },
          'public.posts': { x: 300, y: 20, collapsed: true },
          'note:intro': { x: 0, y: -100 },
          'group:auth': { x: -20, y: -20, w: 500, h: 400 },
        },
        viewport: { x: 0, y: 0, zoom: 1 },
        edges: {
          'ref:posts_user': {
            waypoints: [{ x: 250, y: 50 }],
            sourceSide: 'right',
            targetSide: 'left',
          },
        },
      },
      billing: {
        nodes: {
          'public.users': { x: 1000, y: 1000, pinned: true },
          'billing.invoices': { x: 0, y: 0 },
        },
        viewport: { x: 5, y: 5, zoom: 0.5 },
      },
    },
    settings: { detailLevel: 'keys', theme: { colorScheme: 'dark', showGrid: true } },
  };
}

describe('schema', () => {
  it('has the published $id and draft 2020-12', () => {
    expect(layoutSchema.$id).toBe(
      'https://uncovered-songs.github.io/relvista/schemas/layout-1.json',
    );
    expect(layoutSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(LAYOUT_SCHEMA_ID).toBe(layoutSchema.$id);
  });
});

describe('parseLayout', () => {
  it('accepts a full valid layout and returns a copy', () => {
    const input = sample();
    const r = parseLayout(input);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout).toEqual(input);
    expect(r.layout).not.toBe(input);
    r.layout.views['*']!.nodes['public.users']!.x = 999;
    expect(input.views['*']!.nodes['public.users']!.x).toBe(10);
  });

  it('accepts the empty layout and the minimal form', () => {
    expect(parseLayout(emptyLayout()).ok).toBe(true);
    expect(parseLayout({ version: 1, views: {} }).ok).toBe(true);
  });

  it('accepts raw JSON text', () => {
    const r = parseLayout(serializeLayout(sample()));
    expect(r.ok).toBe(true);
  });

  it('reports invalid JSON text', () => {
    const r = parseLayout('{ "version": 1,');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.path).toBe('');
    expect(r.errors[0]!.message).toMatch(/^invalid JSON/);
  });

  it.each([null, 42, [], true, 'null'])('rejects non-object %j', (value) => {
    expect(parseLayout(value).ok).toBe(false);
  });

  it('requires version 1 and views', () => {
    const r = parseLayout({ version: 2 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors).toEqual(
      expect.arrayContaining([
        { path: '/version', message: 'must be equal to constant 1' },
        { path: '', message: "must have required property 'views'" },
      ]),
    );
  });

  it('collects all errors with JSON pointer paths', () => {
    const r = parseLayout({
      version: 1,
      foo: 1,
      views: {
        '*': {
          nodes: { users: { x: 1, y: 'a', z: 1 } },
          edges: { e: { sourceSide: 'up', waypoints: [{ x: 1 }] } },
          viewport: { x: 0, y: 0, zoom: 0 },
        },
      },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const byPath = Object.fromEntries(r.errors.map((e) => [e.path, e.message]));
    expect(byPath['']).toBe('unknown property "foo"');
    expect(byPath['/views/*/nodes']).toMatch(/invalid node id "users"/);
    expect(byPath['/views/*/nodes/users']).toBe('unknown property "z"');
    expect(byPath['/views/*/nodes/users/y']).toBe('must be number');
    expect(byPath['/views/*/edges/e/sourceSide']).toMatch(/"top", "right", "bottom", "left"/);
    expect(byPath['/views/*/edges/e/waypoints/0']).toBe("must have required property 'y'");
    expect(byPath['/views/*/viewport/zoom']).toBe('must be > 0');
    // the generic propertyNames wrapper error is dropped
    expect(r.errors.filter((e) => e.path === '/views/*/nodes')).toHaveLength(1);
  });

  it.each([
    'public.users',
    'my_schema.t',
    'public."a.b"',
    '"a.b".c',
    'x."q\\"t"',
    '"note:a".b',
    'public.order items',
    'note:intro',
    'group:auth',
    'note:with space',
  ])('accepts node id %s', (id) => {
    expect(
      parseLayout({ version: 1, views: { '*': { nodes: { [id]: { x: 0, y: 0 } } } } }).ok,
    ).toBe(true);
  });

  it.each(['users', 'note:', 'group:', ':x.y', '', 'public.a.b', 'a.b.c', 'a:b.c', 'public.-x'])(
    'rejects node id %j',
    (id) => {
      expect(
        parseLayout({ version: 1, views: { '*': { nodes: { [id]: { x: 0, y: 0 } } } } }).ok,
      ).toBe(false);
    },
  );

  it('requires nodes in a view and rejects empty view names', () => {
    expect(parseLayout({ version: 1, views: { '*': {} } }).ok).toBe(false);
    expect(parseLayout({ version: 1, views: { '': { nodes: {} } } }).ok).toBe(false);
  });

  it('validates size, flags and settings', () => {
    const node = (n: object) => ({
      version: 1,
      views: { '*': { nodes: { 'public.t': { x: 0, y: 0, ...n } } } },
    });
    expect(parseLayout(node({ w: 0 })).ok).toBe(false);
    expect(parseLayout(node({ h: -1 })).ok).toBe(false);
    expect(parseLayout(node({ collapsed: 'yes' })).ok).toBe(false);
    expect(parseLayout(node({ pinned: false, collapsed: false, w: 1, h: 1 })).ok).toBe(true);
    expect(parseLayout({ version: 1, views: {}, settings: { detailLevel: 'some' } }).ok).toBe(
      false,
    );
    expect(
      parseLayout({ version: 1, views: {}, settings: { theme: { colorScheme: 'blue' } } }).ok,
    ).toBe(false);
    expect(parseLayout({ version: 1, views: {}, settings: { theme: { font: 'x' } } }).ok).toBe(
      false,
    );
    expect(parseLayout({ version: 1, views: {}, settings: { bogus: 1 } }).ok).toBe(false);
  });

  it('allows x- extension keys at the top level and in settings', () => {
    const r = parseLayout({
      version: 1,
      views: {},
      'x-tool': { a: 1 },
      settings: { 'x-tool': true },
    });
    expect(r.ok).toBe(true);
  });
});

describe('serializeLayout', () => {
  it('sorts keys recursively, rounds numbers, indents 2 spaces, ends with newline', () => {
    const layout = {
      views: {
        b: { nodes: { 'public.z': { y: 2.005001, x: 1.23456 } } },
        '*': { nodes: { 'public.b': { x: -0.001, y: 3 }, 'public.a': { x: 0.1 + 0.2, y: 1e-9 } } },
      },
      version: 1,
      $schema: LAYOUT_SCHEMA_ID,
    } as Layout;
    expect(serializeLayout(layout)).toBe(
      [
        '{',
        `  "$schema": "${LAYOUT_SCHEMA_ID}",`,
        '  "version": 1,',
        '  "views": {',
        '    "*": {',
        '      "nodes": {',
        '        "public.a": {',
        '          "x": 0.3,',
        '          "y": 0',
        '        },',
        '        "public.b": {',
        '          "x": 0,',
        '          "y": 3',
        '        }',
        '      }',
        '    },',
        '    "b": {',
        '      "nodes": {',
        '        "public.z": {',
        '          "x": 1.23,',
        '          "y": 2.01',
        '        }',
        '      }',
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('is independent of insertion order', () => {
    const a = sample();
    const b: Layout = JSON.parse(JSON.stringify(a), (_k, v) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(Object.entries(v).reverse())
        : v,
    );
    expect(Object.keys(b)).not.toEqual(Object.keys(a));
    expect(serializeLayout(b)).toBe(serializeLayout(a));
  });

  it('preserves waypoint order', () => {
    const l = emptyLayout();
    l.views['*']!.edges = {
      e: {
        waypoints: [
          { x: 3, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
      },
    };
    const out = JSON.parse(serializeLayout(l));
    expect(out.views['*'].edges.e.waypoints.map((p: { x: number }) => p.x)).toEqual([3, 1, 2]);
  });

  it('drops undefined properties', () => {
    const l = emptyLayout();
    l.views['*']!.nodes['public.t'] = { x: 1, y: 2, w: undefined };
    expect(serializeLayout(l)).not.toContain('"w"');
  });

  it('is stable: serialize(parse(serialize(x))) === serialize(x)', () => {
    const s = serializeLayout(sample());
    const r = parseLayout(s);
    expect(r.ok).toBe(true);
    if (r.ok) expect(serializeLayout(r.layout)).toBe(s);
  });

  it('rejects non-finite numbers', () => {
    const l = emptyLayout();
    l.views['*']!.nodes['public.t'] = { x: Number.NaN, y: 0 };
    expect(() => serializeLayout(l)).toThrow(RangeError);
    l.views['*']!.nodes['public.t'] = { x: Infinity, y: 0 };
    expect(() => serializeLayout(l)).toThrow(RangeError);
  });

  it('does not mutate its input', () => {
    const l = sample();
    l.views['*']!.nodes['public.users']!.x = 1.23456;
    const before = JSON.stringify(l);
    serializeLayout(l);
    expect(JSON.stringify(l)).toBe(before);
  });
});

describe('ids and helpers', () => {
  it('tableId always writes the schema', () => {
    expect(tableId('public', 'users')).toBe('public.users');
    expect(tableId('billing', 'invoices')).toBe('billing.invoices');
    expect(tableId(undefined, 'users')).toBe('public.users');
    expect(tableId(null, 'users')).toBe('public.users');
    expect(tableId('', 'users')).toBe('public.users');
  });

  it('noteId, groupId, layoutFileName', () => {
    expect(noteId('intro')).toBe('note:intro');
    expect(groupId('auth')).toBe('group:auth');
    expect(layoutFileName('schema.dbml')).toBe('schema.dbml.layout.json');
    expect(layoutFileName('db/shop.dbml')).toBe('db/shop.dbml.layout.json');
  });

  it('emptyLayout is valid and returns fresh objects', () => {
    const a = emptyLayout();
    const b = emptyLayout();
    expect(a).toEqual({
      $schema: LAYOUT_SCHEMA_ID,
      version: 1,
      views: { [DEFAULT_VIEW]: { nodes: {} } },
    });
    a.views['*']!.nodes['public.t'] = { x: 0, y: 0 };
    expect(b.views['*']!.nodes).toEqual({});
  });
});

describe('renameNode', () => {
  it('renames in every view and keeps the entry', () => {
    const l = sample();
    const r = renameNode(l, 'public.users', 'public.accounts');
    expect(r.views['*']!.nodes['public.accounts']).toEqual({ x: 10, y: 20, w: 200 });
    expect(r.views['billing']!.nodes['public.accounts']).toEqual({
      x: 1000,
      y: 1000,
      pinned: true,
    });
    expect(r.views['*']!.nodes['public.users']).toBeUndefined();
    expect(r.views['billing']!.nodes['public.users']).toBeUndefined();
    expect(r.views['*']!.viewport).toEqual(l.views['*']!.viewport);
    expect(r.settings).toEqual(l.settings);
  });

  it('does not mutate the input', () => {
    const l = sample();
    const before = JSON.stringify(l);
    renameNode(l, 'public.users', 'public.accounts');
    expect(JSON.stringify(l)).toBe(before);
  });

  it('is a no-op for unknown ids and same ids', () => {
    const l = sample();
    expect(renameNode(l, 'public.nope', 'public.x')).toEqual(l);
    expect(renameNode(l, 'public.users', 'public.users')).toBe(l);
  });

  it('the renamed entry replaces an existing target', () => {
    const r = renameNode(sample(), 'public.users', 'public.posts');
    expect(r.views['*']!.nodes['public.posts']).toEqual({ x: 10, y: 20, w: 200 });
    expect(Object.keys(r.views['*']!.nodes)).toHaveLength(3);
  });
});

describe('pruneLayout', () => {
  it('removes unknown nodes in all views and reports them sorted', () => {
    const { layout, removed, removedEdges } = pruneLayout(sample(), ['public.users', 'note:intro']);
    expect(removed).toEqual(['billing.invoices', 'group:auth', 'public.posts']);
    expect(removedEdges).toEqual([]);
    expect(Object.keys(layout.views['*']!.nodes).sort()).toEqual(['note:intro', 'public.users']);
    expect(Object.keys(layout.views['billing']!.nodes)).toEqual(['public.users']);
    expect(layout.views['*']!.edges).toEqual(sample().views['*']!.edges);
  });

  it('prunes edges only when edge ids are given', () => {
    const { layout, removedEdges } = pruneLayout(sample(), new Set(['public.users']), []);
    expect(removedEdges).toEqual(['ref:posts_user']);
    expect(layout.views['*']!.edges).toEqual({});
    const kept = pruneLayout(sample(), [], ['ref:posts_user']);
    expect(kept.layout.views['*']!.edges).toEqual(sample().views['*']!.edges);
  });

  it('keeps empty views and does not mutate the input', () => {
    const l = sample();
    const before = JSON.stringify(l);
    const { layout } = pruneLayout(l, []);
    expect(layout.views['billing']).toEqual({ nodes: {}, viewport: { x: 5, y: 5, zoom: 0.5 } });
    expect(JSON.stringify(l)).toBe(before);
  });

  it('returns nothing removed when everything exists', () => {
    const ids = Object.keys(sample().views['*']!.nodes).concat('billing.invoices');
    expect(pruneLayout(sample(), ids).removed).toEqual([]);
  });
});

describe('mergeViewDefaults', () => {
  it('overlays the named view on the default view', () => {
    const v = mergeViewDefaults(sample(), 'billing');
    expect(v.nodes['public.users']).toEqual({ x: 1000, y: 1000, w: 200, pinned: true });
    expect(v.nodes['public.posts']).toEqual({ x: 300, y: 20, collapsed: true });
    expect(v.nodes['billing.invoices']).toEqual({ x: 0, y: 0 });
    expect(v.viewport).toEqual({ x: 5, y: 5, zoom: 0.5 });
    expect(v.edges).toEqual(sample().views['*']!.edges);
  });

  it('falls back to the default viewport and merges edges field by field', () => {
    const l = sample();
    l.views['billing'] = {
      nodes: {},
      edges: { 'ref:posts_user': { sourceSide: 'top' }, 'ref:new': {} },
    };
    const v = mergeViewDefaults(l, 'billing');
    expect(v.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(v.edges).toEqual({
      'ref:posts_user': { waypoints: [{ x: 250, y: 50 }], sourceSide: 'top', targetSide: 'left' },
      'ref:new': {},
    });
  });

  it('resolves the default and unknown views to the default view', () => {
    const l = sample();
    expect(mergeViewDefaults(l)).toEqual(l.views['*']);
    expect(mergeViewDefaults(l, '*')).toEqual(l.views['*']);
    expect(mergeViewDefaults(l, 'nope')).toEqual(l.views['*']);
  });

  it('works without a default view', () => {
    const l: Layout = { version: 1, views: { v: { nodes: { 'public.t': { x: 1, y: 2 } } } } };
    expect(mergeViewDefaults(l, 'v')).toEqual({ nodes: { 'public.t': { x: 1, y: 2 } } });
    expect(mergeViewDefaults(l)).toEqual({ nodes: {} });
  });

  it('returns a fresh object', () => {
    const l = sample();
    const v = mergeViewDefaults(l, 'billing');
    v.nodes['public.posts']!.x = -1;
    v.edges!['ref:posts_user']!.waypoints!.push({ x: 0, y: 0 });
    expect(l.views['*']!.nodes['public.posts']!.x).toBe(300);
    expect(l.views['*']!.edges!['ref:posts_user']!.waypoints).toHaveLength(1);
  });
});
