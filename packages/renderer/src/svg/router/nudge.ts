/**
 * Nudging (docs/design/phase3-v1.md §4.1 step 4): middle segments of different routes that share
 * a channel (same line, collinear overlap > 8 px) are spread `NUDGE_GAP` apart, in the order that
 * makes the fewest crossings with their neighbouring segments. Port segments never move, a stub
 * keeps its length and a moved segment stays clear of the boxes.
 */
import { freeRange } from './search.js';
import type { Rect, XY } from './obstacles.js';

export const NUDGE_GAP = 6;
/** Overlap (px) from which two collinear segments share a channel. */
const SHARED = 8;
/** Clearance from a box a nudged segment keeps. */
export const NUDGE_CLEAR = 4;

/** A route the nudger may move: points port → port, and its two stub ends. */
export interface NudgeRoute {
  id: string;
  points: XY[];
  stubs: [XY, XY];
  outs: [1 | -1, 1 | -1];
}

interface Seg {
  route: NudgeRoute;
  /** Segment index: points[i] → points[i + 1]. */
  i: number;
  at: number;
  lo: number;
  hi: number;
  /** Allowed positions (neighbours keep their direction, stubs their length). */
  min: number;
  max: number;
  /** Neighbouring segments: where they attach (other axis) and which way they extend (±1). */
  arms: { at: number; dir: number }[];
}

function segments(routes: readonly NudgeRoute[], vertical: boolean): Seg[] {
  const out: Seg[] = [];
  const k = (p: XY) => (vertical ? p.x : p.y);
  const o = (p: XY) => (vertical ? p.y : p.x);
  for (const route of routes) {
    const p = route.points;
    const last = p.length - 2;
    for (let i = 1; i < last; i++) {
      const s0 = p[i]!;
      const s1 = p[i + 1]!;
      const isVertical = Math.abs(s0.x - s1.x) < 1e-6;
      if (isVertical !== vertical) continue;
      const at = k(s0);
      let min = -Infinity;
      let max = Infinity;
      const arms: Seg['arms'] = [];
      const neighbours: [XY, XY, 0 | 1 | null][] = [
        [s0, p[i - 1]!, i - 1 === 0 ? 0 : null],
        [s1, p[i + 2]!, i + 1 === last ? 1 : null],
      ];
      for (const [attach, far, port] of neighbours) {
        const f = k(far);
        arms.push({ at: o(attach), dir: Math.sign(f - at) });
        if (port !== null && vertical) {
          // A port stub keeps its full length.
          const stub = route.stubs[port]!.x;
          if (route.outs[port] === 1) min = Math.max(min, stub);
          else max = Math.min(max, stub);
        } else if (f < at) min = Math.max(min, f + 2);
        else max = Math.min(max, f - 2);
      }
      out.push({
        route,
        i,
        at,
        lo: Math.min(o(s0), o(s1)),
        hi: Math.max(o(s0), o(s1)),
        min,
        max,
        arms,
      });
    }
  }
  return out;
}

/** Crossings made when `a` is placed before (left of / above) `b`. */
function cost(a: Seg, b: Seg): number {
  let n = 0;
  for (const arm of a.arms) if (arm.dir > 0 && arm.at > b.lo && arm.at < b.hi) n++;
  for (const arm of b.arms) if (arm.dir < 0 && arm.at > a.lo && arm.at < a.hi) n++;
  return n;
}

function order(group: Seg[]): Seg[] {
  const sorted = [...group].sort((a, b) =>
    a.route.id < b.route.id ? -1 : a.route.id > b.route.id ? 1 : a.i - b.i,
  );
  const out: Seg[] = [];
  for (const s of sorted) {
    let bestPos = 0;
    let best = Infinity;
    for (let pos = 0; pos <= out.length; pos++) {
      let c = 0;
      for (let j = 0; j < out.length; j++) c += j < pos ? cost(out[j]!, s) : cost(s, out[j]!);
      if (c < best) {
        best = c;
        bestPos = pos;
      }
    }
    out.splice(bestPos, 0, s);
  }
  return out;
}

function spread(group: Seg[], vertical: boolean, boxes: readonly Rect[]): void {
  const at = group[0]!.at;
  const lo = Math.min(...group.map((s) => s.lo));
  const hi = Math.max(...group.map((s) => s.hi));
  const free = freeRange(vertical, at, lo, hi, boxes);
  if (!free) return;
  const [fmin, fmax] = free;
  const n = group.length;
  const room = fmax - fmin;
  const step = Number.isFinite(room) ? Math.min(NUDGE_GAP, room / (n + 1)) : NUDGE_GAP;
  if (step < 1) return;
  const half = (step * (n - 1)) / 2;
  let c = at;
  if (Number.isFinite(fmin)) c = Math.max(c, fmin + step + half);
  if (Number.isFinite(fmax)) c = Math.min(c, fmax - step - half);
  order(group).forEach((s, idx) => {
    const target = c + idx * step - half;
    const lo2 = Math.max(s.min, fmin + 1);
    const hi2 = Math.min(s.max, fmax - 1);
    if (lo2 > hi2) return;
    const v = Math.round(Math.min(hi2, Math.max(lo2, target)) * 100) / 100;
    const p = s.route.points;
    if (vertical) p[s.i]!.x = p[s.i + 1]!.x = v;
    else p[s.i]!.y = p[s.i + 1]!.y = v;
  });
}

function nudgeAxis(routes: readonly NudgeRoute[], vertical: boolean, boxes: readonly Rect[]) {
  const segs = segments(routes, vertical).sort((a, b) => a.at - b.at || a.lo - b.lo);
  let i = 0;
  while (i < segs.length) {
    let j = i + 1;
    while (j < segs.length && segs[j]!.at - segs[i]!.at < 0.5) j++;
    // Same line: components of segments overlapping by more than SHARED.
    let group: Seg[] = [segs[i]!];
    let end = segs[i]!.hi;
    for (let k = i + 1; k < j; k++) {
      const s = segs[k]!;
      if (s.lo < end - SHARED) {
        group.push(s);
        end = Math.max(end, s.hi);
      } else {
        if (group.length > 1) spread(group, vertical, boxes);
        group = [s];
        end = s.hi;
      }
    }
    if (group.length > 1) spread(group, vertical, boxes);
    i = j;
  }
}

/** Spreads shared channels in place: vertical segments first, then horizontal ones. */
export function nudge(routes: readonly NudgeRoute[], boxes: readonly Rect[]): void {
  nudgeAxis(routes, true, boxes);
  nudgeAxis(routes, false, boxes);
}
