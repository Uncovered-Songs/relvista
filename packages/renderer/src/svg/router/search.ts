/**
 * Route search of the orthogonal router (docs/design/phase3-v1.md §4.1 steps 1–3): A* over the
 * orthogonal visibility grid of the obstacles near a ref, cost `length + 40 × bends + 2000 ×
 * (grid segments inside an obstacle)`, then each middle segment is centred in its free channel.
 *
 * The grid is built per ref over a window around its two stub ends, grown to take in the boxes it
 * touches (so a detour around them is on the grid); when that window holds no clean route the
 * whole diagram is searched. The window is kept so incremental routing knows which moves can
 * change the route.
 */
import {
  GROUP_BAND,
  MARGIN,
  containsOpen,
  inflate,
  union,
  type GroupRect,
  type Obstacle,
  type ObstacleIndex,
  type Rect,
  type XY,
} from './obstacles.js';

export const BEND_COST = 40;
export const INSIDE_COST = 2000;
/** Room kept around the boxes a window takes in. */
const WINDOW_PAD = MARGIN * 2;
/** How often a window grows to take in the boxes it touches. */
const WINDOW_GROWTH = 2;

/** One end of a ref for the search: the port on the table border and the end of its stub. */
export interface SearchEnd {
  port: XY;
  stub: XY;
  /** Outward x direction of the stub: 1 = right side, -1 = left side. */
  out: 1 | -1;
  /** Display node id of the end (its box is not an obstacle when it holds a stub end). */
  node: string;
}

export interface RawRoute {
  /** Port → stub → … → stub → port, without collinear points. */
  points: XY[];
  /** No part of the searched route runs inside an obstacle. */
  clean: boolean;
  /** Area whose obstacles and group borders the route depends on. */
  window: Rect;
}

/** Obstacles for one ref: an end's own box is dropped when it holds one of the stub ends. */
function obstaclesFor(a: SearchEnd, b: SearchEnd, index: ObstacleIndex): Obstacle[] {
  return index.obstacles.filter(
    (o) =>
      !(
        (o.id === a.node || o.id === b.node) &&
        (containsOpen(o, a.stub) || containsOpen(o, b.stub))
      ),
  );
}

function overlapsOpen(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function sameRect(a: Rect, b: Rect): boolean {
  return a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
}

function initialWindow(a: SearchEnd, b: SearchEnd, obstacles: readonly Obstacle[]): Rect {
  let win = inflate(
    {
      x0: Math.min(a.stub.x, b.stub.x),
      y0: Math.min(a.stub.y, b.stub.y),
      x1: Math.max(a.stub.x, b.stub.x),
      y1: Math.max(a.stub.y, b.stub.y),
    },
    WINDOW_PAD,
  );
  for (let i = 0; i < WINDOW_GROWTH; i++) {
    let next = win;
    for (const o of obstacles) if (overlapsOpen(o, win)) next = union(next, inflate(o, WINDOW_PAD));
    if (sameRect(next, win)) break;
    win = next;
  }
  return win;
}

function fullWindow(a: SearchEnd, b: SearchEnd, index: ObstacleIndex): Rect {
  let win: Rect = {
    x0: Math.min(a.stub.x, b.stub.x),
    y0: Math.min(a.stub.y, b.stub.y),
    x1: Math.max(a.stub.x, b.stub.x),
    y1: Math.max(a.stub.y, b.stub.y),
  };
  if (index.bounds) win = union(win, index.bounds);
  return inflate(win, WINDOW_PAD);
}

/** Sorted unique values. */
function axis(values: number[]): Float64Array {
  const sorted = Float64Array.from(values).sort();
  let n = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (n === 0 || sorted[i]! !== sorted[n - 1]!) sorted[n++] = sorted[i]!;
  }
  return sorted.slice(0, n);
}

/** Index of `v` in the sorted axis (it is always on it). */
function indexOf(arr: Float64Array, v: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function clip(r: Rect, win: Rect): Rect | null {
  const c = {
    x0: clamp(r.x0, win.x0, win.x1),
    y0: clamp(r.y0, win.y0, win.y1),
    x1: clamp(r.x1, win.x0, win.x1),
    y1: clamp(r.y1, win.y0, win.y1),
  };
  return c.x1 > c.x0 && c.y1 > c.y0 ? c : null;
}

/**
 * Binary min-heap of search states on (estimate, then the deeper state, then insertion order):
 * deterministic pops, and the deeper state first on a plateau of equal estimates.
 */
class Heap {
  private f: number[] = [];
  private g: number[] = [];
  private seq: number[] = [];
  private s: number[] = [];
  private n = 0;
  /** Cost and state of the last pop. */
  topG = 0;
  topS = 0;
  get size(): number {
    return this.f.length;
  }
  peek(): number {
    return this.f[0]!;
  }
  private less(i: number, j: number): boolean {
    const fi = this.f[i]!;
    const fj = this.f[j]!;
    if (fi !== fj) return fi < fj;
    const gi = this.g[i]!;
    const gj = this.g[j]!;
    if (gi !== gj) return gi > gj;
    return this.seq[i]! < this.seq[j]!;
  }
  private move(to: number, from: number): void {
    this.f[to] = this.f[from]!;
    this.g[to] = this.g[from]!;
    this.seq[to] = this.seq[from]!;
    this.s[to] = this.s[from]!;
  }
  private swap(i: number, j: number): void {
    const f = this.f[i]!;
    const g = this.g[i]!;
    const q = this.seq[i]!;
    const s = this.s[i]!;
    this.move(i, j);
    this.f[j] = f;
    this.g[j] = g;
    this.seq[j] = q;
    this.s[j] = s;
  }
  push(f: number, g: number, state: number): void {
    let i = this.f.length;
    this.f.push(f);
    this.g.push(g);
    this.seq.push(this.n++);
    this.s.push(state);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }
  /** Pops the smallest entry into `topG` / `topS`. */
  pop(): void {
    this.topG = this.g[0]!;
    this.topS = this.s[0]!;
    const last = this.f.length - 1;
    if (last > 0) this.move(0, last);
    this.f.pop();
    this.g.pop();
    this.seq.pop();
    this.s.pop();
    let i = 0;
    const len = this.f.length;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let m = i;
      if (l < len && this.less(l, m)) m = l;
      if (r < len && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
  }
}

/** Number of set bits of a 4-bit mask. */
const BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4] as const;

// Directions: 0 = +x, 1 = +y, 2 = -x, 3 = -y.
const DX = [1, 0, -1, 0] as const;
const DY = [0, 1, 0, -1] as const;
const INSIDE = 1;
const BAND = 2;

interface GridResult {
  /** Grid points from the start stub to the end stub. */
  points: XY[];
  clean: boolean;
  cost: number;
}

/** A* from `a.stub` to `b.stub` over the grid of `win`. */
function searchIn(
  win: Rect,
  a: SearchEnd,
  b: SearchEnd,
  obstacles: readonly Obstacle[],
  groups: readonly GroupRect[],
): GridResult {
  const inWin = obstacles.map((o) => clip(o, win)).filter((c): c is Rect => c !== null);
  const bandWin = inflate(win, GROUP_BAND);
  const near = groups.filter((g) => overlapsOpen(inflate(g, GROUP_BAND), bandWin));
  const xv = [win.x0, win.x1, a.stub.x, b.stub.x];
  const yv = [win.y0, win.y1, a.stub.y, b.stub.y];
  for (const c of inWin) {
    xv.push(c.x0, c.x1);
    yv.push(c.y0, c.y1);
  }
  // Lines clear of each group border, so a route has somewhere to go instead of along it.
  for (const g of near) {
    for (const x of [g.x0 - MARGIN, g.x0 + MARGIN, g.x1 - MARGIN, g.x1 + MARGIN])
      if (x > win.x0 && x < win.x1) xv.push(x);
    for (const y of [g.y0 - MARGIN, g.y0 + MARGIN, g.y1 - MARGIN, g.y1 + MARGIN])
      if (y > win.y0 && y < win.y1) yv.push(y);
  }
  const xs = axis(xv);
  const ys = axis(yv);
  const nx = xs.length;
  const ny = ys.length;
  // Flags of the grid segments: h[yi * nx + xi] = (xi, yi)–(xi + 1, yi), v[...] = (xi, yi)–(xi, yi + 1).
  const h = new Uint8Array(nx * ny);
  const v = new Uint8Array(nx * ny);
  for (const c of inWin) {
    const l = indexOf(xs, c.x0);
    const r = indexOf(xs, c.x1);
    const t = indexOf(ys, c.y0);
    const btm = indexOf(ys, c.y1);
    for (let yi = t + 1; yi < btm; yi++) for (let xi = l; xi < r; xi++) h[yi * nx + xi]! |= INSIDE;
    for (let yi = t; yi < btm; yi++) for (let xi = l + 1; xi < r; xi++) v[yi * nx + xi]! |= INSIDE;
  }
  for (const g of near) {
    for (const line of [g.y0, g.y1]) {
      for (let yi = 0; yi < ny; yi++) {
        if (Math.abs(ys[yi]! - line) >= GROUP_BAND) continue;
        for (let xi = 0; xi + 1 < nx; xi++) {
          const mid = (xs[xi]! + xs[xi + 1]!) / 2;
          if (mid > g.x0 && mid < g.x1) h[yi * nx + xi]! |= BAND;
        }
      }
    }
    for (const line of [g.x0, g.x1]) {
      for (let xi = 0; xi < nx; xi++) {
        if (Math.abs(xs[xi]! - line) >= GROUP_BAND) continue;
        for (let yi = 0; yi + 1 < ny; yi++) {
          const mid = (ys[yi]! + ys[yi + 1]!) / 2;
          if (mid > g.y0 && mid < g.y1) v[yi * nx + xi]! |= BAND;
        }
      }
    }
  }

  const sx = indexOf(xs, a.stub.x);
  const sy = indexOf(ys, a.stub.y);
  const tx = indexOf(xs, b.stub.x);
  const ty = indexOf(ys, b.stub.y);
  const goalNode = ty * nx + tx;
  const startDir = a.out === 1 ? 0 : 2;
  // Arriving at the end stub moving towards its table needs no bend.
  const goalDir = b.out === 1 ? 2 : 0;
  const goalExtra = (d: number) =>
    d === goalDir ? 0 : d === (goalDir + 2) % 4 ? 2 * BEND_COST : BEND_COST;
  const txv = b.stub.x;
  const tyv = b.stub.y;
  /**
   * Admissible estimate: the distance, plus one bend per direction the route still has to take
   * (towards the end on each axis, and into the end stub) besides the current one.
   */
  const estimate = (x: number, y: number, d: number): number => {
    const dx = txv - x;
    const dy = tyv - y;
    let dirs = (1 << goalDir) | (1 << d);
    if (dx > 0) dirs |= 1;
    else if (dx < 0) dirs |= 4;
    if (dy > 0) dirs |= 2;
    else if (dy < 0) dirs |= 8;
    return Math.abs(dx) + Math.abs(dy) + (BITS[dirs]! - 1) * BEND_COST;
  };

  const states = nx * ny * 4;
  const g = new Float64Array(states).fill(Infinity);
  const from = new Int32Array(states).fill(-1);
  const heap = new Heap();
  const s0 = (sy * nx + sx) * 4 + startDir;
  g[s0] = 0;
  heap.push(estimate(a.stub.x, a.stub.y, startDir), 0, s0);
  let best = Infinity;
  let bestState = -1;
  while (heap.size > 0) {
    if (heap.peek() >= best) break;
    heap.pop();
    const s = heap.topS;
    const gs = heap.topG;
    if (gs !== g[s]) continue; // stale
    const node = s >> 2;
    const d = s & 3;
    const xi = node % nx;
    const yi = (node - xi) / nx;
    if (node === goalNode) {
      const total = gs + goalExtra(d);
      if (total < best) {
        best = total;
        bestState = s;
      }
      continue;
    }
    for (let nd = 0; nd < 4; nd++) {
      if (nd === (d + 2) % 4) continue; // no U-turn on the spot
      const nxi = xi + DX[nd]!;
      const nyi = yi + DY[nd]!;
      if (nxi < 0 || nxi >= nx || nyi < 0 || nyi >= ny) continue;
      let flag: number;
      let len: number;
      if (nd === 0 || nd === 2) {
        flag = h[yi * nx + Math.min(xi, nxi)]!;
        len = Math.abs(xs[nxi]! - xs[xi]!);
      } else {
        flag = v[Math.min(yi, nyi) * nx + xi]!;
        len = Math.abs(ys[nyi]! - ys[yi]!);
      }
      let cost = gs + len + (nd === d ? 0 : BEND_COST);
      if (flag & INSIDE) cost += INSIDE_COST;
      if (flag & BAND) cost += len;
      const ns = (nyi * nx + nxi) * 4 + nd;
      if (cost < g[ns]!) {
        g[ns] = cost;
        from[ns] = s;
        heap.push(cost + estimate(xs[nxi]!, ys[nyi]!, nd), cost, ns);
      }
    }
  }
  if (bestState < 0) {
    // Unreachable only for a degenerate window; fall back to a plain elbow.
    return {
      points: [a.stub, { x: b.stub.x, y: a.stub.y }, b.stub],
      clean: false,
      cost: Infinity,
    };
  }
  const nodes: number[] = [];
  for (let s = bestState; s >= 0; s = from[s]!) nodes.push(s >> 2);
  nodes.reverse();
  let clean = true;
  const points: XY[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]!;
    const xi = node % nx;
    const yi = (node - xi) / nx;
    points.push({ x: xs[xi]!, y: ys[yi]! });
    if (i > 0) {
      const prev = nodes[i - 1]!;
      const pxi = prev % nx;
      const pyi = (prev - pxi) / nx;
      const flag = pyi === yi ? h[yi * nx + Math.min(xi, pxi)]! : v[Math.min(yi, pyi) * nx + xi]!;
      if (flag & INSIDE) clean = false;
    }
  }
  return { points, clean, cost: best };
}

/** Drops repeated points and the middle one of three collinear points. */
export function simplify(points: XY[]): XY[] {
  const out: XY[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - p.x) < 1e-6 && Math.abs(last.y - p.y) < 1e-6) continue;
    const prev = out[out.length - 2];
    if (
      last &&
      prev &&
      ((Math.abs(prev.x - last.x) < 1e-6 && Math.abs(last.x - p.x) < 1e-6) ||
        (Math.abs(prev.y - last.y) < 1e-6 && Math.abs(last.y - p.y) < 1e-6))
    ) {
      out[out.length - 1] = p;
      continue;
    }
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/**
 * Free interval of the line through `at` (x of a vertical segment, or y of a horizontal one) over
 * the open span `lo..hi` of the other axis, or null when the segment runs inside a box.
 */
export function freeRange(
  vertical: boolean,
  at: number,
  lo: number,
  hi: number,
  boxes: readonly Rect[],
): [number, number] | null {
  let min = -Infinity;
  let max = Infinity;
  for (const o of boxes) {
    const [a0, a1, b0, b1] = vertical ? [o.y0, o.y1, o.x0, o.x1] : [o.x0, o.x1, o.y0, o.y1];
    if (!(a0 < hi && a1 > lo)) continue;
    if (b1 <= at + 1e-9) min = Math.max(min, b1);
    else if (b0 >= at - 1e-9) max = Math.min(max, b0);
    else return null;
  }
  return [min, max];
}

/**
 * Centres every middle segment of a Z-shaped step (its two neighbours run the same way) in the
 * free channel it runs in, within its neighbours' extent; a neighbour that is a port stub keeps
 * its full stub length. Length and bends do not change, the route stays clean.
 */
function centre(points: XY[], a: SearchEnd, b: SearchEnd, boxes: readonly Rect[]): XY[] {
  const p = points.map((q) => ({ x: q.x, y: q.y }));
  const last = p.length - 2; // index of the last segment
  for (let i = 1; i < last; i++) {
    const s0 = p[i]!;
    const s1 = p[i + 1]!;
    const vertical = Math.abs(s0.x - s1.x) < 1e-6;
    const key = (q: XY) => (vertical ? q.x : q.y);
    const at = key(s0);
    const farPrev = i - 1 === 0 ? (vertical ? a.stub.x : key(p[0]!)) : key(p[i - 1]!);
    const farNext = i + 1 === last ? (vertical ? b.stub.x : key(p[last + 1]!)) : key(p[i + 2]!);
    // Z-shape: the far ends lie on both sides of the segment.
    if (!((farPrev <= at && at <= farNext) || (farNext <= at && at <= farPrev))) continue;
    const [lo, hi] = vertical
      ? [Math.min(s0.y, s1.y), Math.max(s0.y, s1.y)]
      : [Math.min(s0.x, s1.x), Math.max(s0.x, s1.x)];
    const free = freeRange(vertical, at, lo, hi, boxes);
    if (!free) continue;
    const from = Math.max(free[0], Math.min(farPrev, farNext));
    const to = Math.min(free[1], Math.max(farPrev, farNext));
    if (!(from <= to)) continue;
    const c = (from + to) / 2;
    if (vertical) s0.x = s1.x = c;
    else s0.y = s1.y = c;
  }
  return simplify(p);
}

/** Routes one ref between its stub ends; see the module comment. */
export function searchRoute(a: SearchEnd, b: SearchEnd, index: ObstacleIndex): RawRoute {
  const obstacles = obstaclesFor(a, b, index);
  let window = initialWindow(a, b, obstacles);
  let r = searchIn(window, a, b, obstacles, index.groups);
  if (!r.clean) {
    const full = fullWindow(a, b, index);
    if (!sameRect(full, window)) {
      const rf = searchIn(full, a, b, obstacles, index.groups);
      if (rf.clean || rf.cost < r.cost) r = rf;
      // Any change anywhere may matter now.
      window = full;
    }
  }
  const points = simplify([a.port, ...r.points, b.port]);
  return { points: centre(points, a, b, obstacles), clean: r.clean, window };
}
