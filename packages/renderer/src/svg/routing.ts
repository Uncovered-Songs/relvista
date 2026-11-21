/**
 * Pure ref routing: where a ref leaves and enters its tables (the exact column row, on the facing
 * sides) and the path between them. Shared by the static SVG and the interactive canvas so both
 * draw the same picture.
 */
import {
  METRICS,
  visibleColumns,
  type Box,
  type DetailLevel,
  type DiagramGeometry,
  type DiagramModel,
  type Ref,
  type Table,
} from '@relvista/core';
import { GROUP_BAND, buildObstacleIndex, inflate, touches } from './router/obstacles.js';
import type { ObstacleIndex, Rect } from './router/obstacles.js';
import { searchRoute, simplify, type RawRoute, type SearchEnd } from './router/search.js';
import { NUDGE_CLEAR, nudge, type NudgeRoute } from './router/nudge.js';

/** How refs are drawn: right-angled, curved, or straight lines. */
export type EdgeStyle = 'orthogonal' | 'curved' | 'straight';
/** The side of a table a ref end attaches to. */
export type HSide = 'left' | 'right';

/** A point in diagram units. */
export interface Point {
  x: number;
  y: number;
}

/** Where one end of a ref route meets its table, and the direction it leaves in. */
export interface RouteEnd extends Point {
  /** Direction pointing away from the table, in degrees (0 = +x, 90 = +y). */
  angle: number;
  side: HSide;
  /** Index of the attached row among the visible columns, or -1 for the header. */
  row: number;
}

/** The drawn route of one ref: its points, the SVG path, and both ends. */
export interface RefRoute {
  id: string;
  points: Point[];
  path: string;
  from: RouteEnd;
  to: RouteEnd;
  /** Display node of the `from` end: the table id, or `group:<name>` when its group is collapsed. */
  fromNode?: string;
  /** Display node of the `to` end. */
  toNode?: string;
}

/** Straight run at each end before the first bend, long enough for the cardinality markers. */
export const STUB = 28;
const CORNER = 10;
/** Horizontal gap under which two tables count as stacked (same-side routing). */
const FACING_GAP = STUB * 2;

export function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Row index of a column among the visible ones, -1 when hidden (or the table shows no columns). */
export function rowIndexOf(table: Table, column: string | undefined, detail: DetailLevel): number {
  if (column === undefined) return -1;
  return visibleColumns(table, detail).findIndex((c) => c.name === column);
}

/** Vertical centre (relative to the table top) of a row, or of the header for -1. */
export function rowCenterOffset(row: number): number {
  return row < 0
    ? METRICS.headerHeight / 2
    : METRICS.headerHeight + row * METRICS.rowHeight + METRICS.rowHeight / 2;
}

/** How far a self ref's loop reaches out from the table (room for both markers). */
export const SELF_LOOP: number = METRICS.selfLoopReach;

/** Which sides of `a` and `b` a ref between them attaches to. */
export function chooseSides(a: Box, b: Box, selfRef: boolean): [HSide, HSide] {
  // Self refs loop on the left, away from the right-hand ports other refs usually leave from
  // (core's ELK layout reserves the room there).
  if (selfRef) return ['left', 'left'];
  if (b.x >= a.x + a.width + FACING_GAP) return ['right', 'left'];
  if (a.x >= b.x + b.width + FACING_GAP) return ['left', 'right'];
  // Stacked or overlapping horizontally: both on the side that keeps the loop short.
  const right = Math.abs(a.x + a.width - (b.x + b.width));
  const left = Math.abs(a.x - b.x);
  return left < right ? ['left', 'left'] : ['right', 'right'];
}

function dirOf(side: HSide): number {
  return side === 'right' ? 1 : -1;
}

function angleBetween(p: Point, q: Point): number {
  return (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;
}

/** Polyline with rounded corners. */
export function roundedPath(points: Point[], radius = CORNER): string {
  if (points.length === 0) return '';
  const pts = dedupe(points);
  const first = pts[0]!;
  let d = `M${round(first.x)} ${round(first.y)}`;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]!;
    const next = pts[i + 1];
    if (!next) {
      d += ` L${round(p.x)} ${round(p.y)}`;
      break;
    }
    const prev = pts[i - 1]!;
    const lin = Math.hypot(p.x - prev.x, p.y - prev.y);
    const lout = Math.hypot(next.x - p.x, next.y - p.y);
    const r = Math.min(radius, lin / 2, lout / 2);
    if (r < 0.5) {
      d += ` L${round(p.x)} ${round(p.y)}`;
      continue;
    }
    const a = { x: p.x + ((prev.x - p.x) / lin) * r, y: p.y + ((prev.y - p.y) / lin) * r };
    const b = { x: p.x + ((next.x - p.x) / lout) * r, y: p.y + ((next.y - p.y) / lout) * r };
    d += ` L${round(a.x)} ${round(a.y)} Q${round(p.x)} ${round(p.y)} ${round(b.x)} ${round(b.y)}`;
  }
  return d;
}

function dedupe(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.abs(last.x - p.x) > 0.01 || Math.abs(last.y - p.y) > 0.01) out.push(p);
  }
  return out;
}

/** Own routing between two attachment points. */
export function routeBetween(
  a: Point,
  aSide: HSide,
  b: Point,
  bSide: HSide,
  style: EdgeStyle,
  /** Length of the straight run out of each table (longer for self-ref loops). */
  stub: number = STUB,
): { points: Point[]; path: string } {
  const da = dirOf(aSide);
  const db = dirOf(bSide);
  const a1 = { x: a.x + da * stub, y: a.y };
  const b1 = { x: b.x + db * stub, y: b.y };
  if (style === 'straight') {
    const points = [a, a1, b1, b];
    return { points, path: roundedPath(points, 0) };
  }
  if (style === 'curved') {
    const k = Math.max(40, Math.abs(b1.x - a1.x) / 2, aSide === bSide ? 60 : 0);
    const path =
      `M${round(a.x)} ${round(a.y)} L${round(a1.x)} ${round(a1.y)} ` +
      `C${round(a1.x + da * k)} ${round(a1.y)} ${round(b1.x + db * k)} ${round(b1.y)} ` +
      `${round(b1.x)} ${round(b1.y)} L${round(b.x)} ${round(b.y)}`;
    return { points: [a, a1, b1, b], path };
  }
  let points: Point[];
  if (aSide !== bSide) {
    // Facing sides: out, across at the midpoint, in.
    let midX = (a.x + b.x) / 2;
    if ((midX - a.x) * da < STUB) midX = a1.x;
    points = [a, { x: midX, y: a.y }, { x: midX, y: b.y }, b];
  } else {
    // Same side (stacked tables or self ref): loop around the outermost edge.
    const x = aSide === 'right' ? Math.max(a1.x, b1.x) : Math.min(a1.x, b1.x);
    if (Math.abs(a.y - b.y) < 1) {
      // Self ref on one row: a small loop below the row.
      const y = a.y + METRICS.rowHeight / 2 + 6;
      points = [a, { x, y: a.y }, { x, y }, { x: b.x + db * (stub / 2), y }, b];
    } else points = [a, { x, y: a.y }, { x, y: b.y }, b];
  }
  return { points, path: roundedPath(points) };
}

/** What the router needs to route the refs of a diagram. */
export interface RouteContext {
  model: DiagramModel;
  geometry: DiagramGeometry;
  detailLevel: DetailLevel;
  edgeStyle: EdgeStyle;
  /** Use `geometry.edges[*].points` when present (ELK routes). Default true. */
  usePoints?: boolean;
  /**
   * 'tables': `orthogonal` routes go around table, note and collapsed-group boxes
   * (docs/design/phase3-v1.md §4.1). 'none': phase-2 routes (straight under unrelated tables).
   * Default 'tables' (phase 3 wave 2). Above `ROUTER_MAX_NODES` display nodes 'tables' falls back
   * to 'none'.
   */
  avoid?: 'tables' | 'none';
}

/** Above this many display nodes (tables, notes, collapsed groups) `avoid: 'tables'` routes as 'none'. */
export const ROUTER_MAX_NODES = 400;

/** Incremental re-routing (drag frames): only refs touching `dirty` node ids are recomputed. */
export interface RouteCache {
  routes: Map<string, RefRoute>;
  /** Internal: obstacle index keyed by geometry identity. */
  readonly key: unknown;
}

/** What `routeAll` returns: the routes by ref id, plus the cache for the next incremental call. */
export type RouteResult = Map<string, RefRoute> & { cache: RouteCache };

/** Tables of a model by id. */
export function tableIndex(model: DiagramModel): Map<string, Table> {
  return new Map(model.tables.map((t) => [t.id, t]));
}

/**
 * Detail level a table is drawn at: its own (`NodeGeometry.detailLevel`, e.g. a saved collapsed
 * node) or the diagram's.
 */
export function nodeDetail(
  geometry: DiagramGeometry,
  id: string,
  detailLevel: DetailLevel,
): DetailLevel {
  return geometry.nodes[id]?.detailLevel ?? detailLevel;
}

/** Distance from a point to the nearest vertical edge of a box. */
function edgeDistance(p: Point, box: Box): number {
  return Math.min(Math.abs(p.x - box.x), Math.abs(p.x - (box.x + box.width)));
}

/** Vertical offsets (px) of a ref's two ends from their row centres, when ports are shared. */
export interface EndOffsets {
  from: number;
  to: number;
}

/**
 * Gap between the ends of refs that leave the same port (table, row, side), so each cardinality
 * marker sits on its own line. Two ends at ±6 keep both markers inside the row (26px).
 */
export const PORT_FAN = 12;

/** Offsets for `n` ends sharing one port, top to bottom, staying inside the row where possible. */
export function fanOffsets(n: number): number[] {
  if (n < 2) return [0];
  const step = Math.min(PORT_FAN, (METRICS.rowHeight - 2) / (n - 1));
  return Array.from({ length: n }, (_, i) => round((i - (n - 1) / 2) * step));
}

/**
 * Moves the end `pts[0]` of an orthogonal polyline by `dy`, keeping it orthogonal: the first
 * (horizontal) segment moves with it when a vertical segment follows; otherwise the line jogs
 * back half way along that segment.
 */
function shiftStart(pts: Point[], dy: number): Point[] {
  if (!dy || pts.length < 2) return pts;
  const [p0, p1] = [pts[0]!, pts[1]!];
  const horizontal = Math.abs(p1.y - p0.y) < 0.5;
  if (!horizontal) return [{ x: p0.x, y: p0.y + dy }, ...pts.slice(1)];
  const p2 = pts[2];
  if (p2 && Math.abs(p2.x - p1.x) < 0.5 && Math.abs(p2.y - p1.y) > Math.abs(dy) + 1)
    return [{ x: p0.x, y: p0.y + dy }, { x: p1.x, y: p1.y + dy }, ...pts.slice(2)];
  const mx = (p0.x + p1.x) / 2;
  return [{ x: p0.x, y: p0.y + dy }, { x: mx, y: p0.y + dy }, { x: mx, y: p0.y }, ...pts.slice(1)];
}

function shiftEnds(pts: Point[], off: EndOffsets): Point[] {
  const a = shiftStart(pts, off.from);
  return shiftStart([...a].reverse(), off.to).reverse();
}

/**
 * Table id → `group:<name>` for every member of a group that `geometry` draws collapsed (core
 * §3.1: the members are then absent from `geometry.nodes`). First group wins.
 */
function collapsedMembers(model: DiagramModel, geometry: DiagramGeometry): Map<string, string> {
  const out = new Map<string, string>();
  for (const g of model.groups) {
    if (geometry.groups[g.id]?.collapsed !== true) continue;
    for (const t of g.tableIds) if (!out.has(t)) out.set(t, g.id);
  }
  return out;
}

/** Everything `routeRef` needs besides the ref, computed once per `routeAll`. */
interface Setup {
  tables: Map<string, Table>;
  collapsed: Map<string, string>;
  /** Obstacle index when refs are routed around boxes, else null. */
  index: ObstacleIndex | null;
}

function routerActive(ctx: RouteContext, collapsedGroups: number): boolean {
  return (
    (ctx.avoid ?? 'tables') === 'tables' &&
    ctx.edgeStyle === 'orthogonal' &&
    Object.keys(ctx.geometry.nodes).length + collapsedGroups <= ROUTER_MAX_NODES
  );
}

function makeSetup(ctx: RouteContext, tables = tableIndex(ctx.model)): Setup {
  const collapsed = collapsedMembers(ctx.model, ctx.geometry);
  const groups = new Set(collapsed.values()).size;
  return {
    tables,
    collapsed,
    index: routerActive(ctx, groups) ? buildObstacleIndex(ctx.geometry) : null,
  };
}

/** Where one end of a ref is drawn: its display node's box and the attached row. */
interface EndBox {
  node: string;
  box: Box;
  row: number;
}

function endBox(end: Ref['from'], ctx: RouteContext, setup: Setup): EndBox | null {
  const group = setup.collapsed.get(end.tableId);
  if (group !== undefined) {
    const box = ctx.geometry.groups[group];
    return box ? { node: group, box, row: -1 } : null;
  }
  const table = setup.tables.get(end.tableId);
  const box = ctx.geometry.nodes[end.tableId];
  if (!table || !box) return null;
  return {
    node: end.tableId,
    box,
    row: rowIndexOf(table, end.columns[0], box.detailLevel ?? ctx.detailLevel),
  };
}

/** How a ref is drawn, before port fan-out. */
type Plan =
  | { kind: 'points'; ref: Ref; a: EndBox; b: EndBox; points: Point[] }
  | { kind: 'router'; ref: Ref; a: EndBox; b: EndBox; sides: [HSide, HSide]; stub: number }
  | { kind: 'own'; ref: Ref; a: EndBox; b: EndBox; sides: [HSide, HSide]; stub: number };

function planRef(ref: Ref, ctx: RouteContext, setup: Setup): Plan | null {
  const a = endBox(ref.from, ctx, setup);
  const b = endBox(ref.to, ctx, setup);
  if (!a || !b) return null;
  // Both ends inside one collapsed group: the ref is inside the card.
  if (a.node === b.node && a.node !== ref.from.tableId) return null;
  const self = a.node === b.node;

  // ELK self loops are tiny stubs; self refs are always routed here, with a wider loop.
  let pre = ctx.usePoints === false || self ? undefined : ctx.geometry.edges[ref.id]?.points;
  if (pre && pre.length >= 2 && pre.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
    // Contract: points run ref.from → ref.to. Accept the reverse order too (older geometry).
    const head = pre[0]!;
    const tail = pre[pre.length - 1]!;
    if (
      edgeDistance(head, a.box) + edgeDistance(tail, b.box) >
      edgeDistance(head, b.box) + edgeDistance(tail, a.box)
    )
      pre = [...pre].reverse();
    return { kind: 'points', ref, a, b, points: pre };
  }
  const sides = chooseSides(a.box, b.box, self);
  const stub = self ? SELF_LOOP : STUB;
  // A self ref on one row is one small loop; everything else may go round the boxes.
  const router = setup.index !== null && !(self && a.row === b.row);
  return { kind: router ? 'router' : 'own', ref, a, b, sides, stub };
}

function portOf(e: EndBox, side: HSide, dy: number): Point {
  return {
    x: side === 'right' ? e.box.x + e.box.width : e.box.x,
    y: e.box.y + rowCenterOffset(e.row) + dy,
  };
}

/** Search ends of a routed plan, its ports moved by the fan-out `offsets`. */
function searchEnds(
  plan: Plan & { kind: 'router' },
  offsets: EndOffsets = { from: 0, to: 0 },
): [SearchEnd, SearchEnd] {
  const out = (side: HSide) => (side === 'right' ? 1 : -1);
  const end = (e: EndBox, side: HSide, dy: number): SearchEnd => {
    const port = portOf(e, side, dy);
    return {
      port,
      stub: { x: port.x + out(side) * plan.stub, y: port.y },
      out: out(side),
      node: e.node,
    };
  };
  return [end(plan.a, plan.sides[0], offsets.from), end(plan.b, plan.sides[1], offsets.to)];
}

/** Final route of a plan from its points (already fanned out). */
function finish(plan: Plan, points: Point[], path: string): RefRoute {
  const { ref, a, b } = plan;
  const p0 = points[0]!;
  const pn = points[points.length - 1]!;
  const ends = { fromNode: a.node, toNode: b.node };
  if (plan.kind === 'points') {
    const p1 = points[1]!;
    const pm = points[points.length - 2]!;
    return {
      id: ref.id,
      points,
      path,
      from: {
        ...p0,
        angle: angleBetween(p0, p1),
        side: p0.x >= a.box.x + a.box.width / 2 ? 'right' : 'left',
        row: a.row,
      },
      to: {
        ...pn,
        angle: angleBetween(pn, pm),
        side: pn.x >= b.box.x + b.box.width / 2 ? 'right' : 'left',
        row: b.row,
      },
      ...ends,
    };
  }
  const [sa, sb] = plan.sides;
  return {
    id: ref.id,
    points,
    path,
    from: { x: p0.x, y: p0.y, angle: sa === 'right' ? 0 : 180, side: sa, row: a.row },
    to: { x: pn.x, y: pn.y, angle: sb === 'right' ? 0 : 180, side: sb, row: b.row },
    ...ends,
  };
}

/**
 * Points of a plan without nudging: ELK points, the searched route (`raw`, searched for these
 * offsets) or the own route.
 */
function draw(
  plan: Plan,
  ctx: RouteContext,
  offsets: EndOffsets,
  raw: RawRoute | undefined,
): { points: Point[]; path: string } {
  if (plan.kind === 'points') {
    const pts = offsets.from || offsets.to ? shiftEnds(plan.points, offsets) : plan.points;
    return { points: pts, path: roundedPath(pts) };
  }
  if (plan.kind === 'router' && raw) {
    const pts = raw.points.map((p) => ({ x: p.x, y: p.y }));
    return { points: pts, path: roundedPath(pts) };
  }
  const [sa, sb] = plan.sides;
  const a = portOf(plan.a, sa, offsets.from);
  const b = portOf(plan.b, sb, offsets.to);
  return routeBetween(a, sa, b, sb, ctx.edgeStyle, plan.stub);
}

/**
 * Routes one ref, or null when one of its tables has no geometry or both ends are inside one
 * collapsed group. With `avoid: 'tables'` the route goes round the boxes, without the nudging of
 * shared channels that `routeAll` adds.
 */
export function routeRef(
  ref: Ref,
  ctx: RouteContext,
  tables: Map<string, Table>,
  offsets: EndOffsets = { from: 0, to: 0 },
): RefRoute | null {
  const setup = makeSetup(ctx, tables);
  const plan = planRef(ref, ctx, setup);
  if (!plan) return null;
  const raw =
    plan.kind === 'router' ? searchRoute(...searchEnds(plan, offsets), setup.index!) : undefined;
  const { points, path } = draw(plan, ctx, offsets, raw);
  return finish(plan, points, path);
}

/**
 * No segment of `points` runs inside a box of `boxes`; the port segments may touch their own
 * end boxes.
 */
function clearOf(points: Point[], boxes: readonly (Rect & { id: string })[], plan: Plan): boolean {
  for (let i = 1; i < points.length; i++) {
    const p = points[i - 1]!;
    const q = points[i]!;
    const x0 = Math.min(p.x, q.x);
    const x1 = Math.max(p.x, q.x);
    const y0 = Math.min(p.y, q.y);
    const y1 = Math.max(p.y, q.y);
    const port = i === 1 || i === points.length - 1;
    for (const b of boxes) {
      if (port && (b.id === plan.a.node || b.id === plan.b.node)) continue;
      if (x1 > b.x0 && x0 < b.x1 && y1 > b.y0 && y0 < b.y1) return false;
    }
  }
  return true;
}

/** State an incremental `routeAll` reuses (`RouteCache.key`). */
interface CacheState {
  model: DiagramModel;
  detailLevel: DetailLevel;
  edgeStyle: EdgeStyle;
  usePoints: boolean | undefined;
  router: boolean;
  /** Obstacle (inflated) and expanded-group boxes by id, as routed. */
  boxes: Map<string, Rect>;
  /** Searched routes by ref id + search ends (before and after the fan-out). */
  raw: Map<string, RawRoute>;
  /** The searched route each ref is drawn along, by ref id. */
  final: Map<string, RawRoute>;
}

function boxesOf(index: ObstacleIndex | null): Map<string, Rect> {
  const out = new Map<string, Rect>();
  if (!index) return out;
  for (const o of index.obstacles) out.set(o.id, { x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1 });
  // Group borders matter up to two bands away from a window (see router/search.ts).
  for (const g of index.groups) out.set(g.id, inflate(g, 2 * GROUP_BAND));
  return out;
}

function sameRect(a: Rect | undefined, b: Rect | undefined): boolean {
  return !!a && !!b && a.x0 === b.x0 && a.y0 === b.y0 && a.x1 === b.x1 && a.y1 === b.y1;
}

function sigOf(a: SearchEnd, b: SearchEnd): string {
  return [a.port.x, a.port.y, a.stub.x, a.node, b.port.x, b.port.y, b.stub.x, b.node].join(
    '\u0000',
  );
}

/**
 * Routes every ref. Refs whose ends meet at the same port (same table, row and side) are fanned
 * out vertically (`fanOffsets`) so each end keeps its own cardinality marker; the ends are ordered
 * by where their lines go (upper line on top), so the fanned lines do not cross.
 *
 * With `cache` (drag frames) only the routes a change can affect are searched again: refs with an
 * end on a `dirty` node or on a node whose box changed, and refs whose search window a changed
 * box touches. Everything else (fan-out, nudging) is redone, so the result always equals a full
 * `routeAll` of `ctx`.
 */
export function routeAll(
  ctx: RouteContext,
  cache?: { previous: RouteCache; dirty: ReadonlySet<string> },
): RouteResult {
  const setup = makeSetup(ctx);
  const out = new Map<string, RefRoute>();
  const state: CacheState = {
    model: ctx.model,
    detailLevel: ctx.detailLevel,
    edgeStyle: ctx.edgeStyle,
    usePoints: ctx.usePoints,
    router: setup.index !== null,
    boxes: boxesOf(setup.index),
    raw: new Map(),
    final: new Map(),
  };
  const prev = compatible(cache?.previous.key, state) ? (cache!.previous.key as CacheState) : null;
  // Boxes that moved, appeared or disappeared since the previous call (old and new).
  const changed: Rect[] = [];
  const dirty = new Set(cache?.dirty ?? []);
  if (prev) {
    for (const [id, r] of state.boxes) {
      const old = prev.boxes.get(id);
      if (dirty.has(id) || !sameRect(old, r)) {
        changed.push(r);
        if (old) changed.push(old);
      }
    }
    for (const [id, old] of prev.boxes) if (!state.boxes.has(id)) changed.push(old);
  }

  /** The searched route between two ends: reused from `prev` when nothing it depends on changed. */
  const search = (id: string, [a, b]: [SearchEnd, SearchEnd]): RawRoute => {
    const key = `${id}\u0000${sigOf(a, b)}`;
    let raw = state.raw.get(key);
    if (raw) return raw;
    const old = prev?.raw.get(key);
    raw =
      old &&
      !dirty.has(a.node) &&
      !dirty.has(b.node) &&
      !changed.some((r) => touches(r, old.window))
        ? old
        : searchRoute(a, b, setup.index!);
    state.raw.set(key, raw);
    return raw;
  };

  const plans = new Map<string, Plan>();
  const raws = new Map<string, RawRoute>();
  const first = new Map<string, Point[]>();
  for (const ref of ctx.model.refs) {
    const plan = planRef(ref, ctx, setup);
    if (!plan) continue;
    plans.set(ref.id, plan);
    if (plan.kind === 'router') {
      const raw = search(ref.id, searchEnds(plan));
      raws.set(ref.id, raw);
      first.set(ref.id, raw.points);
    } else first.set(ref.id, draw(plan, ctx, { from: 0, to: 0 }, undefined).points);
  }

  // Ends per port. A self ref on one row is drawn as one loop and keeps its own two ends.
  const ports = new Map<string, { ref: Ref; end: 'from' | 'to'; towards: number }[]>();
  for (const ref of ctx.model.refs) {
    const plan = plans.get(ref.id);
    const pts = first.get(ref.id);
    if (!plan || !pts) continue;
    const r = finish(plan, pts, '');
    if (plan.a.node === plan.b.node && r.from.row === r.to.row) continue;
    for (const end of ['from', 'to'] as const) {
      const e = r[end];
      const node = end === 'from' ? plan.a.node : plan.b.node;
      const key = `${node}\u0000${e.row}\u0000${e.side}\u0000${Math.round(e.y)}`;
      // Where the line heads: the first point off this end's row, else the other end.
      const line = end === 'from' ? pts : [...pts].reverse();
      const off = line.find((p) => Math.abs(p.y - e.y) > 0.5) ?? line[line.length - 1]!;
      let list = ports.get(key);
      if (!list) ports.set(key, (list = []));
      list.push({ ref, end, towards: off.y });
    }
  }
  const offsets = new Map<string, EndOffsets>();
  for (const list of ports.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.towards - b.towards || (a.ref.id < b.ref.id ? -1 : 1));
    const offs = fanOffsets(list.length);
    list.forEach((item, i) => {
      const o = offsets.get(item.ref.id) ?? { from: 0, to: 0 };
      o[item.end] = offs[i]!;
      offsets.set(item.ref.id, o);
    });
  }

  const routed: NudgeRoute[] = [];
  const clear = setup.index
    ? setup.index.obstacles.map((ob) => ({ id: ob.id, ...inflate(ob.box, NUDGE_CLEAR) }))
    : [];
  for (const [id, plan] of plans) {
    const o = offsets.get(id) ?? { from: 0, to: 0 };
    if (plan.kind === 'router') {
      const ends = searchEnds(plan, o);
      let raw = raws.get(id)!;
      if (o.from || o.to) {
        // Fanned ends: the route moved with its ports while that stays clear of the boxes, else
        // searched again from the moved ports.
        const moved = shiftEnds(raw.points, o);
        raw =
          raw.clean && clearOf(moved, clear, plan) ? { ...raw, points: moved } : search(id, ends);
      }
      state.final.set(id, raw);
      const { points } = draw(plan, ctx, o, raw);
      routed.push({
        id,
        points,
        stubs: [ends[0].stub, ends[1].stub],
        outs: [ends[0].out, ends[1].out],
      });
    } else if (o.from || o.to) {
      const { points, path } = draw(plan, ctx, o, undefined);
      out.set(id, finish(plan, points, path));
    } else {
      const points = first.get(id)!;
      const path = plan.kind === 'own' ? draw(plan, ctx, o, undefined).path : roundedPath(points);
      out.set(id, finish(plan, points, path));
    }
  }
  if (routed.length > 0 && setup.index) {
    nudge(routed, clear);
  }
  for (const r of routed) {
    const points = simplify(r.points);
    out.set(r.id, finish(plans.get(r.id)!, points, roundedPath(points)));
  }
  // Model order, as before (callers iterate the map).
  const ordered = new Map<string, RefRoute>();
  for (const ref of ctx.model.refs) {
    const r = out.get(ref.id);
    if (r) ordered.set(ref.id, r);
  }
  return Object.assign(ordered, { cache: { routes: ordered, key: state } });
}

function compatible(key: unknown, now: CacheState): boolean {
  if (!key || typeof key !== 'object') return false;
  const k = key as Partial<CacheState>;
  return (
    k.model === now.model &&
    k.detailLevel === now.detailLevel &&
    k.edgeStyle === now.edgeStyle &&
    k.usePoints === now.usePoints &&
    k.router === now.router &&
    k.boxes instanceof Map &&
    k.raw instanceof Map
  );
}

/** What a highlight (list of table or ref ids) lights up: those, their refs and neighbours. */
export interface HighlightSets {
  tables: Set<string>;
  refs: Set<string>;
  /** Table id → names of columns attached to a lit ref. */
  columns: Map<string, Set<string>>;
}

/**
 * The tables, refs and columns lit when the given ids are highlighted, or null for no highlight.
 */
export function highlightSets(
  model: DiagramModel,
  highlight: readonly string[] | null | undefined,
): HighlightSets | null {
  if (!highlight || highlight.length === 0) return null;
  const ids = new Set(highlight);
  const tables = new Set<string>();
  const refs = new Set<string>();
  const columns = new Map<string, Set<string>>();
  const addCols = (tableId: string, cols: string[]) => {
    let s = columns.get(tableId);
    if (!s) columns.set(tableId, (s = new Set()));
    for (const c of cols) s.add(c);
  };
  for (const t of model.tables) if (ids.has(t.id)) tables.add(t.id);
  for (const ref of model.refs) {
    if (ids.has(ref.id) || ids.has(ref.from.tableId) || ids.has(ref.to.tableId)) {
      refs.add(ref.id);
      tables.add(ref.from.tableId);
      tables.add(ref.to.tableId);
      addCols(ref.from.tableId, ref.from.columns);
      addCols(ref.to.tableId, ref.to.columns);
    }
  }
  for (const n of model.stickyNotes) if (ids.has(n.id)) tables.add(n.id);
  return { tables, refs, columns };
}
