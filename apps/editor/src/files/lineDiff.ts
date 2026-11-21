/**
 * Line diff (Myers O(ND)) used to carry original line terminators over to unchanged lines.
 * Pure; no DOM.
 */

/** One matched pair: `a[aIndex] === b[bIndex]`, part of a longest common subsequence. */
export interface LineMatch {
  aIndex: number;
  bIndex: number;
}

/** N·D above which the diff falls back to common prefix / suffix only. */
export const MYERS_BUDGET = 10_000_000;

/**
 * Matched line pairs (increasing in both indices) between `a` and `b`. Uses Myers' greedy
 * algorithm on the middle part after trimming the common prefix and suffix; when the edit distance
 * makes the work exceed `budget` (N·D), only the prefix and suffix are matched.
 */
export function diffLines(
  a: readonly string[],
  b: readonly string[],
  budget = MYERS_BUDGET,
): LineMatch[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const out: LineMatch[] = [];
  for (let i = 0; i < start; i++) out.push({ aIndex: i, bIndex: i });
  const middle = myers(a, b, start, endA, start, endB, budget);
  if (middle) out.push(...middle);
  for (let i = 0; i < a.length - endA; i++) out.push({ aIndex: endA + i, bIndex: endB + i });
  return out;
}

/** Myers on a[aLo..aHi) × b[bLo..bHi); null when over budget. */
function myers(
  a: readonly string[],
  b: readonly string[],
  aLo: number,
  aHi: number,
  bLo: number,
  bHi: number,
  budget: number,
): LineMatch[] | null {
  const n = aHi - aLo;
  const m = bHi - bLo;
  if (n === 0 || m === 0) return [];
  const max = n + m;
  const offset = max;
  let v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  let found = -1;
  const size = Math.max(n, m);
  for (let d = 0; d <= max; d++) {
    if (size * d > budget) return null;
    trace.push(v.slice());
    const next = v;
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && next[offset + k - 1]! < next[offset + k + 1]!)) {
        x = next[offset + k + 1]!;
      } else {
        x = next[offset + k - 1]! + 1;
      }
      let y = x - k;
      while (x < n && y < m && a[aLo + x] === b[bLo + y]) {
        x++;
        y++;
      }
      next[offset + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    v = next;
    if (found >= 0) {
      trace.push(v.slice());
      break;
    }
  }
  // Backtrack: trace[d] holds V before round d; trace[found + 1] the final V.
  const matches: LineMatch[] = [];
  let x = n;
  let y = m;
  for (let d = found; d >= 0; d--) {
    const prev = trace[d]!;
    const k = x - y;
    let prevK: number;
    if (d === 0) {
      prevK = 0;
    } else if (k === -d || (k !== d && prev[offset + k - 1]! < prev[offset + k + 1]!)) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = d === 0 ? 0 : prev[offset + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      matches.push({ aIndex: aLo + x, bIndex: bLo + y });
    }
    if (d > 0) {
      x = prevX;
      y = prevY;
    }
  }
  matches.reverse();
  return matches;
}
