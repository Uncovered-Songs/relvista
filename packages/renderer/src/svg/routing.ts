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

/** Which sides of `a` and `b` a ref between them attaches to. */
export function chooseSides(a: Box, b: Box, selfRef: boolean): [HSide, HSide] {
  if (selfRef) return ['right', 'right'];
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
): { points: Point[]; path: string } {
  const da = dirOf(aSide);
  const db = dirOf(bSide);
  const a1 = { x: a.x + da * STUB, y: a.y };
  const b1 = { x: b.x + db * STUB, y: b.y };
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
      points = [a, { x, y: a.y }, { x, y }, { x: b.x + db * (STUB / 2), y }, b];
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

/** Routes one ref, or null when one of its tables has no geometry. */
export function routeRef(ref: Ref, ctx: RouteContext, tables: Map<string, Table>): RefRoute | null {
  const ta = tables.get(ref.from.tableId);
  const tb = tables.get(ref.to.tableId);
  const ga = ctx.geometry.nodes[ref.from.tableId];
  const gb = ctx.geometry.nodes[ref.to.tableId];
  if (!ta || !tb || !ga || !gb) return null;
  const rowA = rowIndexOf(ta, ref.from.columns[0], ctx.detailLevel);
  const rowB = rowIndexOf(tb, ref.to.columns[0], ctx.detailLevel);

  const pre = ctx.usePoints === false ? undefined : ctx.geometry.edges[ref.id]?.points;
  if (pre && pre.length >= 2 && pre.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
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

  const [sa, sb] = chooseSides(ga, gb, ref.from.tableId === ref.to.tableId);
  const a = { x: sa === 'right' ? ga.x + ga.width : ga.x, y: ga.y + rowCenterOffset(rowA) };
  const b = { x: sb === 'right' ? gb.x + gb.width : gb.x, y: gb.y + rowCenterOffset(rowB) };
  const { points, path } = routeBetween(a, sa, b, sb, ctx.edgeStyle);
  return {
    id: ref.id,
    points,
    path,
    from: { ...a, angle: sa === 'right' ? 0 : 180, side: sa, row: rowA },
    to: { ...b, angle: sb === 'right' ? 0 : 180, side: sb, row: rowB },
  };
}

export function routeAll(ctx: RouteContext): Map<string, RefRoute> {
  const tables = tableIndex(ctx.model);
  const out = new Map<string, RefRoute>();
  for (const ref of ctx.model.refs) {
    const r = routeRef(ref, ctx, tables);
    if (r) out.set(ref.id, r);
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
