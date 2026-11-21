import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MIN_DRAG,
  NUDGE_COMMIT_MS,
  NudgeBatch,
  groupDragPositions,
  movedPositions,
  nudgeDelta,
  startGroupDrag,
  visibleMembers,
} from '../src/canvas/drag.js';

afterEach(() => vi.useRealTimers());

describe('group drag', () => {
  const positions = new Map([
    ['a', { x: 0, y: 0 }],
    ['b', { x: 100, y: 50 }],
    ['other', { x: 500, y: 500 }],
  ]);

  it('moves the visible members only, by the group delta', () => {
    const members = visibleMembers(['a', 'b', 'hidden'], positions);
    expect(members).toEqual(['a', 'b']);
    const drag = startGroupDrag('group:g', { x: -24, y: -52 }, members, positions);
    const at = groupDragPositions(drag, { x: -14, y: -22 });
    expect([...at]).toEqual([
      ['a', { x: 10, y: 30 }],
      ['b', { x: 110, y: 80 }],
    ]);
    // The start snapshot is a copy.
    positions.get('a')!.x = 999;
    expect(groupDragPositions(drag, { x: -24, y: -52 }).get('a')).toEqual({ x: 0, y: 0 });
    positions.get('a')!.x = 0;
  });
});

describe('movedPositions', () => {
  it('ignores sub-pixel drags and keeps every moved id (multi-select)', () => {
    const start = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 10, y: 10 }],
      ['c', { x: 20, y: 20 }],
      ['gone', { x: 0, y: 0 }],
    ]);
    const end = new Map([
      ['a', { x: 0.6, y: 0.6 }],
      ['b', { x: 30, y: 10 }],
      ['c', { x: 20, y: 21 }],
    ]);
    expect(MIN_DRAG).toBe(1);
    expect([...movedPositions(start, end).keys()]).toEqual(['b', 'c']);
    expect(movedPositions(start, new Map([['a', { x: 0.2, y: 0.3 }]])).size).toBe(0);
  });
});

describe('keyboard nudge', () => {
  it('maps arrows to 10 px steps, 1 px with Shift', () => {
    expect(nudgeDelta('ArrowLeft', false)).toEqual({ x: -10, y: 0 });
    expect(nudgeDelta('ArrowRight', true)).toEqual({ x: 1, y: 0 });
    expect(nudgeDelta('ArrowUp', false)).toEqual({ x: 0, y: -10 });
    expect(nudgeDelta('ArrowDown', true)).toEqual({ x: 0, y: 1 });
    expect(nudgeDelta('a', false)).toBeNull();
  });

  it('batches presses into one commit after the last one', () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const batch = new NudgeBatch(commit);
    batch.add(['a']);
    vi.advanceTimersByTime(NUDGE_COMMIT_MS - 50);
    batch.add(['a', 'b']);
    vi.advanceTimersByTime(NUDGE_COMMIT_MS - 50);
    expect(commit).not.toHaveBeenCalled();
    expect(batch.pending).toBe(true);
    vi.advanceTimersByTime(50);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith(['a', 'b']);
    expect(batch.pending).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('flushes now, and cancels without committing', () => {
    vi.useFakeTimers();
    const commit = vi.fn();
    const batch = new NudgeBatch(commit, 300);
    batch.add(['x']);
    batch.flush();
    expect(commit).toHaveBeenCalledWith(['x']);
    batch.flush();
    expect(commit).toHaveBeenCalledTimes(1);
    batch.add(['y']);
    batch.cancel();
    vi.advanceTimersByTime(1000);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
