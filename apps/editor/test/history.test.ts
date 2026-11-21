import { emptyLayout, type Layout } from '@relvista/core';
import { describe, expect, it } from 'vitest';
import { LayoutHistory, historyActionOf } from '../src/state/history.js';

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
  it("'resize' is a user edit (pushes); only 'place' amends", () => {
    expect(historyActionOf('resize')).toBe('push');
    expect(historyActionOf('move')).toBe('push');
    expect(historyActionOf('settings')).toBe('push');
    expect(historyActionOf('auto-layout')).toBe('push');
    expect(historyActionOf('place')).toBe('amend');
    const h = new LayoutHistory(L(0));
    const sized = L(0);
    sized.views['*']!.nodes['note:n'] = { x: 0, y: 0, w: 300, h: 120 };
    h.push(sized); // what the store does for a 'resize' change
    expect(h.canUndo()).toBe(true);
    expect(h.undo()).toEqual(L(0));
    expect(h.redo()).toEqual(sized);
  });
  it('batch merges the pushes of one action into one step (delete note: layout entries)', () => {
    const h = new LayoutHistory(L(0));
    h.push(L(1));
    const result = h.batch(() => {
      h.push(L(2)); // the note's entry removed in view '*'
      h.push(L(3)); // … and in a named view
      h.batch(() => h.push(L(4))); // nested: still the same step
      return 'done';
    });
    expect(result).toBe('done');
    expect(h.current).toEqual(L(4));
    expect(h.size.past).toBe(2);
    expect(h.undo()).toEqual(L(1));
    expect(h.redo()).toEqual(L(4));
    // After the batch, pushes are separate steps again.
    h.push(L(5));
    h.push(L(6));
    expect(h.undo()).toEqual(L(5));
  });
  it('a batch that throws still closes; a batch without pushes adds no step', () => {
    const h = new LayoutHistory(L(0));
    h.batch(() => undefined);
    expect(h.canUndo()).toBe(false);
    expect(() =>
      h.batch(() => {
        h.push(L(1));
        throw new Error('x');
      }),
    ).toThrow('x');
    h.push(L(2));
    expect(h.size.past).toBe(2);
  });
});
