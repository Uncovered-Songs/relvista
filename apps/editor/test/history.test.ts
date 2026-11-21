import { emptyLayout, type Layout } from '@relvista/core';
import { describe, expect, it } from 'vitest';
import { LayoutHistory } from '../src/state/history.js';

const L = (x: number): Layout => {
  const l = emptyLayout();
  l.views['*']!.nodes['public.a'] = { x, y: 0 };
  return l;
};

describe('LayoutHistory', () => {
  it('push / undo / redo', () => {
    const h = new LayoutHistory(L(0));
    h.push(L(1));
    h.push(L(2));
    expect(h.undo()).toEqual(L(1));
    expect(h.undo()).toEqual(L(0));
    expect(h.undo()).toBeUndefined();
    expect(h.redo()).toEqual(L(1));
    h.push(L(5));
    expect(h.canRedo()).toBe(false);
    expect(h.current).toEqual(L(5));
  });
  it('caps the past', () => {
    const h = new LayoutHistory(L(0), 3);
    for (let i = 1; i <= 10; i++) h.push(L(i));
    expect(h.size.past).toBe(3);
    h.undo();
    h.undo();
    expect(h.undo()).toEqual(L(7));
    expect(h.undo()).toBeUndefined();
  });
  it("'place' amends instead of pushing, and can rewrite snapshots", () => {
    const h = new LayoutHistory(null);
    h.push(L(1));
    h.amend(L(2), (l) => (l ? { ...l, settings: { detailLevel: 'keys' } } : l));
    expect(h.size.past).toBe(1);
    expect(h.current).toEqual(L(2));
    expect(h.undo()).toBeNull(); // the initial null is not transformed into a layout
    expect(h.redo()).toEqual(L(2));
  });
  it('remembers the layout as opened until the cap drops it', () => {
    const h = new LayoutHistory(L(0), 3);
    expect(h.base).toEqual(L(0));
    h.push(L(1));
    h.push(L(2));
    expect(h.base).toEqual(L(0));
    h.amend(L(3), (l) => (l ? L(10) : l));
    expect(h.base).toEqual(L(10));
    h.push(L(4));
    h.push(L(5));
    expect(h.base).toBeUndefined();
    h.clear(L(7));
    expect(h.base).toEqual(L(7));
  });
  it('clear on open', () => {
    const h = new LayoutHistory(L(0));
    h.push(L(1));
    h.clear(L(9));
    expect(h.canUndo()).toBe(false);
    expect(h.current).toEqual(L(9));
  });
});
