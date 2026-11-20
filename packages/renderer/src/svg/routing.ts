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

export type EdgeStyle = 'orthogonal' | 'curved' | 'straight';
export type HSide = 'left' | 'right';

export interface Point {
  x: number;
  y: number;
}

export interface RouteEnd extends Point {
  /** Direction pointing away from the table, in degrees (0 = +x, 90 = +y). */
  angle: number;
  side: HSide;
  /** Index of the attached row among the visible columns, or -1 for the header. */
  row: number;
}

export interface RefRoute {
  id: string;
  points: Point[];
  path: string;
  from: RouteEnd;
  to: RouteEnd;
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

export interface RouteContext {
  model: DiagramModel;
  geometry: DiagramGeometry;
  detailLevel: DetailLevel;
  edgeStyle: EdgeStyle;
  /** Use `geometry.edges[*].points` when present (ELK routes). Default true. */
  usePoints?: boolean;
}

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

/** Routes one ref, or null when one of its tables has no geometry. */
export function routeRef(
  ref: Ref,
  ctx: RouteContext,
  tables: Map<string, Table>,
  offsets: EndOffsets = { from: 0, to: 0 },
): RefRoute | null {
  const ta = tables.get(ref.from.tableId);
  const tb = tables.get(ref.to.tableId);
  const ga = ctx.geometry.nodes[ref.from.tableId];
  const gb = ctx.geometry.nodes[ref.to.tableId];
  if (!ta || !tb || !ga || !gb) return null;
  const rowA = rowIndexOf(ta, ref.from.columns[0], ga.detailLevel ?? ctx.detailLevel);
  const rowB = rowIndexOf(tb, ref.to.columns[0], gb.detailLevel ?? ctx.detailLevel);
  const self = ref.from.tableId === ref.to.tableId;

  // ELK self loops are tiny stubs; self refs are always routed here, with a wider loop.
  let pre = ctx.usePoints === false || self ? undefined : ctx.geometry.edges[ref.id]?.points;
  if (pre && pre.length >= 2 && pre.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
    // Contract: points run ref.from → ref.to. Accept the reverse order too (older geometry).
    const head = pre[0]!;
    const tail = pre[pre.length - 1]!;
    if (
      edgeDistance(head, ga) + edgeDistance(tail, gb) >
      edgeDistance(head, gb) + edgeDistance(tail, ga)
    )
      pre = [...pre].reverse();
    if (offsets.from || offsets.to) pre = shiftEnds(pre, offsets);
    const p0 = pre[0]!;
    const p1 = pre[1]!;
    const pn = pre[pre.length - 1]!;
    const pm = pre[pre.length - 2]!;
    return {
      id: ref.id,
      points: pre,
      path: roundedPath(pre),
      from: {
        ...p0,
        angle: angleBetween(p0, p1),
        side: p0.x >= ga.x + ga.width / 2 ? 'right' : 'left',
        row: rowA,
      },
      to: {
        ...pn,
        angle: angleBetween(pn, pm),
        side: pn.x >= gb.x + gb.width / 2 ? 'right' : 'left',
        row: rowB,
      },
    };
  }

  const [sa, sb] = chooseSides(ga, gb, self);
  const a = {
    x: sa === 'right' ? ga.x + ga.width : ga.x,
    y: ga.y + rowCenterOffset(rowA) + offsets.from,
  };
  const b = {
    x: sb === 'right' ? gb.x + gb.width : gb.x,
    y: gb.y + rowCenterOffset(rowB) + offsets.to,
  };
  const { points, path } = routeBetween(a, sa, b, sb, ctx.edgeStyle, self ? SELF_LOOP : STUB);
  return {
    id: ref.id,
    points,
    path,
    from: { ...a, angle: sa === 'right' ? 0 : 180, side: sa, row: rowA },
    to: { ...b, angle: sb === 'right' ? 0 : 180, side: sb, row: rowB },
  };
}

/**
 * Routes every ref. Refs whose ends meet at the same port (same table, row and side) are fanned
 * out vertically (`fanOffsets`) so each end keeps its own cardinality marker; the ends are ordered
 * by where their lines go (upper line on top), so the fanned lines do not cross.
 */
export function routeAll(ctx: RouteContext): Map<string, RefRoute> {
  const tables = tableIndex(ctx.model);
  const out = new Map<string, RefRoute>();
  for (const ref of ctx.model.refs) {
    const r = routeRef(ref, ctx, tables);
    if (r) out.set(ref.id, r);
  }
  // Ends per port. A self ref on one row is drawn as one loop and keeps its own two ends.
  const ports = new Map<string, { ref: Ref; end: 'from' | 'to'; towards: number }[]>();
  for (const ref of ctx.model.refs) {
    const r = out.get(ref.id);
    if (!r) continue;
    if (ref.from.tableId === ref.to.tableId && r.from.row === r.to.row) continue;
    for (const end of ['from', 'to'] as const) {
      const e = r[end];
      const tableId = ref[end].tableId;
      const key = `${tableId}\u0000${e.row}\u0000${e.side}\u0000${Math.round(e.y)}`;
      // Where the line heads: the first point off this end's row, else the other end.
      const pts = end === 'from' ? r.points : [...r.points].reverse();
      const off = pts.find((p) => Math.abs(p.y - e.y) > 0.5) ?? pts[pts.length - 1]!;
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
  for (const [id, o] of offsets) {
    const ref = ctx.model.refs.find((r) => r.id === id)!;
    const r = routeRef(ref, ctx, tables, o);
    if (r) out.set(id, r);
  }
  return out;
}

/** What a highlight (list of table or ref ids) lights up: those, their refs and neighbours. */
export interface HighlightSets {
  tables: Set<string>;
  refs: Set<string>;
  /** Table id → names of columns attached to a lit ref. */
  columns: Map<string, Set<string>>;
}

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
