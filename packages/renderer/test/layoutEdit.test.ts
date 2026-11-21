import { emptyLayout, parseLayout, serializeLayout, type Layout } from '@relvista/core';
import { describe, expect, it } from 'vitest';
import {
  effectivePositions,
  nodeEntry,
  setNodePositions,
  setNodeSettings,
} from '../src/canvas/layoutEdit.js';

function base(): Layout {
  return {
    ...emptyLayout(),
    views: {
      '*': {
        nodes: {
          'public.users': { x: 10, y: 20, w: 240, pinned: true },
          'public.posts': { x: 400, y: 20, collapsed: true },
        },
        viewport: { x: 1, y: 2, zoom: 1 },
      },
      blog: { nodes: { 'public.posts': { y: 500 } } },
    },
    settings: { detailLevel: 'keys' },
    'x-tool': { keep: 'me' },
  };
}

/** Valid and stable: parse → serialize → parse → serialize gives the same text. */
function valid(layout: Layout): void {
  const parsed = parseLayout(layout);
  expect(parsed.ok, JSON.stringify(parsed)).toBe(true);
  const text = serializeLayout(layout);
  const again = parseLayout(text);
  expect(again.ok).toBe(true);
  if (again.ok) expect(serializeLayout(again.layout)).toBe(text);
}

describe('effectivePositions / nodeEntry', () => {
  it('merges the named view over the default and keeps only full positions', () => {
    const l = base();
    expect(effectivePositions(l, '*')).toEqual({
      'public.users': { x: 10, y: 20 },
      'public.posts': { x: 400, y: 20 },
    });
    expect(effectivePositions(l, 'blog')['public.posts']).toEqual({ x: 400, y: 500 });
    l.views['new'] = { nodes: { 'public.extra': { pinned: true } } };
    expect(effectivePositions(l, 'new')['public.extra']).toBeUndefined();
    expect(effectivePositions(null, '*')).toEqual({});
  });

  it('returns the merged entry of one node', () => {
    expect(nodeEntry(base(), 'blog', 'public.posts')).toEqual({ x: 400, y: 500, collapsed: true });
    expect(nodeEntry(base(), '*', 'public.nope')).toBeUndefined();
    expect(nodeEntry(null, '*', 'public.users')).toBeUndefined();
    expect(nodeEntry(base(), '*', 'toString')).toBeUndefined();
  });
});

describe('setNodePositions', () => {
  it('writes the default view, rounding and keeping other fields and keys', () => {
    const l = base();
    const before = serializeLayout(l);
    const next = setNodePositions(l, '*', {
      'public.users': { x: 11.6, y: -0.4 },
      'public.new': { x: 1.5, y: 2.49 },
    });
    expect(serializeLayout(l)).toBe(before); // input untouched
    expect(next.views['*']!.nodes['public.users']).toEqual({ x: 12, y: 0, w: 240, pinned: true });
    expect(Object.is(next.views['*']!.nodes['public.users']!.y, -0)).toBe(false);
    expect(next.views['*']!.nodes['public.new']).toEqual({ x: 2, y: 2 });
    expect(next.views['*']!.viewport).toEqual({ x: 1, y: 2, zoom: 1 });
    expect(next.views['blog']).toBe(l.views['blog']);
    expect(next['x-tool']).toEqual({ keep: 'me' });
    expect(next.settings).toEqual({ detailLevel: 'keys' });
    valid(next);
  });

  it('writes overrides into a named view only (creating it)', () => {
    const l = base();
    const next = setNodePositions(l, 'blog', { 'public.posts': { x: 7, y: 8 } });
    expect(next.views['blog']!.nodes['public.posts']).toEqual({ x: 7, y: 8 });
    expect(next.views['*']).toBe(l.views['*']);
    const created = setNodePositions(l, 'fresh view', { 'public.users': { x: 1, y: 1 } });
    expect(created.views['fresh view']).toEqual({ nodes: { 'public.users': { x: 1, y: 1 } } });
    expect(effectivePositions(created, '*')['public.users']).toEqual({ x: 10, y: 20 });
    valid(next);
    valid(created);
  });

  it('starts from an empty layout for null and skips non-finite positions', () => {
    const next = setNodePositions(null, '*', {
      'public.a': { x: 3, y: 4 },
      'public.b': { x: NaN, y: 1 },
    });
    expect(next.version).toBe(1);
    expect(next.views['*']!.nodes).toEqual({ 'public.a': { x: 3, y: 4 } });
    valid(next);
  });

  it('handles __proto__ and quoted ids as plain keys', () => {
    const ids = ['public.__proto__', 'public."a.b"', '"my schema"."t 1"', 'note:__proto__'];
    const positions: Record<string, { x: number; y: number }> = {};
    ids.forEach((id, i) =>
      Object.defineProperty(positions, id, { value: { x: i, y: i }, enumerable: true }),
    );
    const proto = JSON.parse('{"__proto__": {"x": 9, "y": 9}}') as Record<string, never>;
    const next = setNodePositions(setNodePositions(null, '*', positions), 'v', proto);
    for (const [i, id] of ids.entries())
      expect(Object.hasOwn(next.views['*']!.nodes, id) && next.views['*']!.nodes[id]).toEqual({
        x: i,
        y: i,
      });
    expect(Object.hasOwn(next.views['v']!.nodes, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(next.views['v']!.nodes)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>)['x']).toBeUndefined();
    // Valid apart from the deliberately invalid bare `__proto__` id.
    const onlyValid = setNodePositions(null, '*', positions);
    valid(onlyValid);
    expect(serializeLayout(onlyValid)).toContain('"public.__proto__"');
  });
});

describe('setNodeSettings', () => {
  it('sets and clears in the default view', () => {
    const l = base();
    const pinned = setNodeSettings(l, '*', ['public.posts'], { pinned: true });
    expect(pinned.views['*']!.nodes['public.posts']).toEqual({
      x: 400,
      y: 20,
      collapsed: true,
      pinned: true,
    });
    const cleared = setNodeSettings(pinned, '*', ['public.posts', 'public.users'], {
      pinned: false,
      collapsed: false,
    });
    expect(cleared.views['*']!.nodes['public.posts']).toEqual({ x: 400, y: 20 });
    expect(cleared.views['*']!.nodes['public.users']).toEqual({ x: 10, y: 20, w: 240 });
    valid(pinned);
    valid(cleared);
  });

  it('needs a position in the default view (fallback or skip)', () => {
    const skipped = setNodeSettings(base(), '*', ['public.unplaced'], { pinned: true });
    expect(skipped.views['*']!.nodes['public.unplaced']).toBeUndefined();
    const placed = setNodeSettings(
      base(),
      '*',
      ['public.unplaced'],
      { collapsed: true },
      {
        'public.unplaced': { x: 5.4, y: 6.6 },
      },
    );
    expect(placed.views['*']!.nodes['public.unplaced']).toEqual({ x: 5, y: 7, collapsed: true });
    valid(placed);
  });

  it('writes only the setting into a named view', () => {
    const l = base();
    const next = setNodeSettings(l, 'blog', ['public.posts', 'public.orphan'], {
      pinned: true,
    });
    expect(next.views['blog']!.nodes['public.posts']).toEqual({ y: 500, pinned: true });
    expect(next.views['blog']!.nodes['public.orphan']).toEqual({ pinned: true });
    expect(next.views['*']).toBe(l.views['*']);
    valid(next);
    // Clearing what the default view sets writes an explicit false; else removes the field.
    const unpin = setNodeSettings(l, 'blog', ['public.users'], { pinned: false });
    expect(unpin.views['blog']!.nodes['public.users']).toEqual({ pinned: false });
    expect(nodeEntry(unpin, 'blog', 'public.users')?.pinned).toBe(false);
    const back = setNodeSettings(next, 'blog', ['public.orphan'], { pinned: false });
    expect(Object.hasOwn(back.views['blog']!.nodes, 'public.orphan')).toBe(false);
    valid(unpin);
    valid(back);
  });

  it('starts from an empty layout for null', () => {
    const next = setNodeSettings(null, 'v', ['public.a'], { collapsed: true });
    expect(next.views['v']).toEqual({ nodes: { 'public.a': { collapsed: true } } });
    valid(next);
  });
});
