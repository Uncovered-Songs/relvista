import { describe, expect, it } from 'vitest';
import { diffLines } from '../src/files/lineDiff.js';
import { rng } from './helpers.js';

function lcsLength(a: string[], b: string[]): number {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
  return dp[0]![0]!;
}

function valid(a: string[], b: string[], m: ReturnType<typeof diffLines>): boolean {
  for (let k = 0; k < m.length; k++) {
    const { aIndex, bIndex } = m[k]!;
    if (a[aIndex] !== b[bIndex]) return false;
    if (k > 0 && (aIndex <= m[k - 1]!.aIndex || bIndex <= m[k - 1]!.bIndex)) return false;
  }
  return true;
}

describe('diffLines', () => {
  it('matches a longest common subsequence on random inputs', () => {
    const rand = rng(7);
    for (let n = 0; n < 400; n++) {
      const alpha = ['a', 'b', 'c', 'd'].slice(0, 2 + Math.floor(rand() * 3));
      const gen = () =>
        Array.from(
          { length: Math.floor(rand() * 12) },
          () => alpha[Math.floor(rand() * alpha.length)]!,
        );
      const a = gen();
      const b = gen();
      const m = diffLines(a, b);
      expect(valid(a, b, m)).toBe(true);
      expect(m.length).toBe(lcsLength(a, b));
    }
  });
  it('identical and empty inputs', () => {
    expect(diffLines(['x', 'y'], ['x', 'y'])).toEqual([
      { aIndex: 0, bIndex: 0 },
      { aIndex: 1, bIndex: 1 },
    ]);
    expect(diffLines([], ['x'])).toEqual([]);
    expect(diffLines(['x'], [])).toEqual([]);
  });
  it('falls back to prefix/suffix when over budget', () => {
    const a = ['p', '1', '2', '3', 's'];
    const b = ['p', '3', '2', '1', 's'];
    const m = diffLines(a, b, 0);
    expect(m).toEqual([
      { aIndex: 0, bIndex: 0 },
      { aIndex: 4, bIndex: 4 },
    ]);
    expect(valid(a, b, m)).toBe(true);
  });
  it('handles a large file with a few edits quickly', () => {
    const a = Array.from({ length: 20000 }, (_, i) => `line ${i}`);
    const b = a.slice();
    b[100] = 'changed';
    b.splice(5000, 0, 'new');
    b.splice(15000, 3);
    const t = performance.now();
    const m = diffLines(a, b);
    expect(performance.now() - t).toBeLessThan(1000);
    expect(m.length).toBe(20000 - 1 - 3);
  });
});
