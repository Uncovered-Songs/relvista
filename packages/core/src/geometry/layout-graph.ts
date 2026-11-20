/**
 * Engine-neutral layout graph: measured nodes, refs reduced to node/row pairs, groups, connected
 * components. Shared by the ELK, dagre and grid engines (see docs/design/autolayout.md).
 */
import type { DetailLevel, NodeLayout } from '../layout/types.js';
import type { DiagramModel, Ref } from '../model/types.js';
import { METRICS, estimateTextWidth } from './metrics.js';
import { measureNote, measureTable, visibleColumns } from './measure.js';
import type { Box, TextMeasure } from './types.js';

/** Port row for the table header (a ref whose column is hidden at the current detail level). */
export const HEADER_ROW = -1;

export interface LayoutNode {
  id: string;
  kind: 'table' | 'note';
  /** Position in model order (tables first, then notes). Drives every tie-break. */
  index: number;
  width: number;
  height: number;
  /** Group this table belongs to, when the group is part of the graph. */
  groupId: string | null;
}

export interface LayoutEdge {
  /** Ref id. */
  id: string;
  index: number;
  /** The referenced ("one") side: layout flows from it to the referencing side. */
  source: string;
  target: string;
  /** Visible column row index on each side, or HEADER_ROW. */
  sourceRow: number;
  targetRow: number;
}

export interface LayoutGroup {
  id: string;
  index: number;
  /** Member node ids in model order. */
  members: string[];
}

export interface LayoutGraph {
  nodes: LayoutNode[];
  nodeById: Map<string, LayoutNode>;
  edges: LayoutEdge[];
  groups: LayoutGroup[];
}

export interface PrepareOptions {
  detailLevel: DetailLevel;
  measure: TextMeasure;
  saved: Record<string, Partial<NodeLayout>>;
}

/** Y of a ref attachment point, relative to the table's top edge, clamped into the node. */
export function portY(row: number, nodeHeight: number): number {
  const y =
    row === HEADER_ROW
      ? METRICS.headerHeight / 2
      : METRICS.headerHeight + row * METRICS.rowHeight + METRICS.rowHeight / 2;
  return y < nodeHeight ? y : Math.min(METRICS.headerHeight / 2, nodeHeight / 2);
}

function positive(v: number | undefined): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** Builds the layout graph from a (view-filtered) model. */
export function prepareGraph(model: DiagramModel, opts: PrepareOptions): LayoutGraph {
  const measure = opts.measure ?? estimateTextWidth;
  const nodes: LayoutNode[] = [];
  const nodeById = new Map<string, LayoutNode>();
  const rowsByTable = new Map<string, string[]>();

  const groupIds = new Set(model.groups.map((g) => g.id));
  for (const table of model.tables) {
    if (nodeById.has(table.id)) continue;
    const saved = opts.saved[table.id];
    const level: DetailLevel = saved?.collapsed ? 'names' : opts.detailLevel;
    const size = measureTable(table, level, measure);
    const node: LayoutNode = {
      id: table.id,
      kind: 'table',
      index: nodes.length,
      width: positive(saved?.w) ? saved.w : size.width,
      height: positive(saved?.h) ? saved.h : size.height,
      groupId: table.groupId && groupIds.has(table.groupId) ? table.groupId : null,
    };
    nodes.push(node);
    nodeById.set(node.id, node);
    rowsByTable.set(
      table.id,
      visibleColumns(table, level).map((c) => c.name),
    );
  }
  for (const note of model.stickyNotes) {
    if (nodeById.has(note.id)) continue;
    const saved = opts.saved[note.id];
    const size = measureNote(note, measure);
    const node: LayoutNode = {
      id: note.id,
      kind: 'note',
      index: nodes.length,
      width: positive(saved?.w) ? saved.w : size.width,
      height: positive(saved?.h) ? saved.h : size.height,
      groupId: null,
    };
    nodes.push(node);
    nodeById.set(node.id, node);
  }

  const groups: LayoutGroup[] = [];
  for (const g of model.groups) {
    const members = nodes.filter((n) => n.groupId === g.id).map((n) => n.id);
    if (members.length) groups.push({ id: g.id, index: groups.length, members });
  }

  const rowOf = (tableId: string, columns: string[]): number => {
    const rows = rowsByTable.get(tableId) ?? [];
    const i = columns.length ? rows.indexOf(columns[0]!) : -1;
    return i >= 0 ? i : HEADER_ROW;
  };
  const edges: LayoutEdge[] = [];
  const seen = new Set<string>();
  for (const ref of model.refs) {
    if (seen.has(ref.id)) continue;
    if (!rowsByTable.has(ref.from.tableId) || !rowsByTable.has(ref.to.tableId)) continue;
    seen.add(ref.id);
    const [parent, child] = orient(ref);
    edges.push({
      id: ref.id,
      index: edges.length,
      source: parent.tableId,
      target: child.tableId,
      sourceRow: rowOf(parent.tableId, parent.columns),
      targetRow: rowOf(child.tableId, child.columns),
    });
  }
  return { nodes, nodeById, edges, groups };
}

/** [referenced side, referencing side]: the FK side is the target, so parents flow first. */
function orient(ref: Ref): [Ref['from'], Ref['to']] {
  return ref.fkSide === 'from' ? [ref.to, ref.from] : [ref.from, ref.to];
}

/** Restricts a graph to a node subset; edges and groups keep only what lies inside it. */
export function subgraph(graph: LayoutGraph, keep: (n: LayoutNode) => boolean): LayoutGraph {
  const nodes = graph.nodes.filter(keep);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const edges = graph.edges.filter((e) => nodeById.has(e.source) && nodeById.has(e.target));
  const groups = graph.groups
    .map((g) => ({ ...g, members: g.members.filter((m) => nodeById.has(m)) }))
    .filter((g) => g.members.length > 0);
  return { nodes, nodeById, edges, groups };
}

/**
 * Connected components, counting refs and shared group membership as connections. Each component
 * lists its nodes in model order; components are ordered by their first node.
 */
export function components(graph: LayoutGraph): LayoutGraph[] {
  const parent = new Map<string, string>(graph.nodes.map((n) => [n.id, n.id]));
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    let cur = id;
    while (cur !== root) {
      const next = parent.get(cur)!;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    // Keep the earliest node as root so the result does not depend on union order.
    if (graph.nodeById.get(ra)!.index < graph.nodeById.get(rb)!.index) parent.set(rb, ra);
    else parent.set(ra, rb);
  };
  for (const e of graph.edges) union(e.source, e.target);
  for (const g of graph.groups) for (const m of g.members.slice(1)) union(g.members[0]!, m);

  const byRoot = new Map<string, Set<string>>();
  for (const n of graph.nodes) {
    const r = find(n.id);
    let set = byRoot.get(r);
    if (!set) byRoot.set(r, (set = new Set()));
    set.add(n.id);
  }
  return [...byRoot.values()].map((ids) => subgraph(graph, (n) => ids.has(n.id)));
}

/** A placed set of nodes in local coordinates, plus optional edge routes in the same frame. */
export interface Placement {
  positions: Map<string, { x: number; y: number }>;
  edges: Map<string, Array<{ x: number; y: number }>>;
}

/** Group rectangle around member boxes, using METRICS.groupPadding / groupHeaderHeight. */
export function groupBox(members: Box[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of members) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  const pad = METRICS.groupPadding;
  return {
    x: minX - pad,
    y: minY - pad - METRICS.groupHeaderHeight,
    width: maxX - minX + pad * 2,
    height: maxY - minY + pad * 2 + METRICS.groupHeaderHeight,
  };
}

/** Bounding box of a placement: nodes, the group boxes around them, and edge points. */
export function placementBounds(graph: LayoutGraph, placement: Placement): Box {
  const boxes: Box[] = [];
  for (const n of graph.nodes) {
    const p = placement.positions.get(n.id);
    if (p) boxes.push({ x: p.x, y: p.y, width: n.width, height: n.height });
  }
  for (const g of graph.groups) {
    const members: Box[] = [];
    for (const id of g.members) {
      const p = placement.positions.get(id);
      const n = graph.nodeById.get(id)!;
      if (p) members.push({ x: p.x, y: p.y, width: n.width, height: n.height });
    }
    if (members.length) boxes.push(groupBox(members));
  }
  for (const pts of placement.edges.values())
    for (const p of pts) boxes.push({ x: p.x, y: p.y, width: 0, height: 0 });
  return unionBoxes(boxes);
}

export function unionBoxes(boxes: Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** Moves a placement by (dx, dy) in place. */
export function translatePlacement(placement: Placement, dx: number, dy: number): void {
  if (!dx && !dy) return;
  for (const p of placement.positions.values()) {
    p.x += dx;
    p.y += dy;
  }
  for (const pts of placement.edges.values())
    for (const p of pts) {
      p.x += dx;
      p.y += dy;
    }
}
