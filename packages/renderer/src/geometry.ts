/**
 * Geometry helpers on the renderer side: access to core's auto-layout, a deterministic grid
 * fallback, and recomputing group boxes / bounds after nodes move (dragging in the viewer).
 */
import {
  METRICS,
  layoutDiagram,
  layoutDiagramSync,
  measureNote,
  measureTable,
  type AutoLayoutOptions,
  type Box,
  type DiagramGeometry,
  type DiagramModel,
  type GroupGeometry,
  type LayoutOptions,
  type NodeGeometry,
} from '@relvista/core';

/** Core's `layoutDiagramSync` (dagre), falling back to `gridLayout` if it throws. */
export function layoutSync(model: DiagramModel, options: LayoutOptions = {}): DiagramGeometry {
  try {
    return layoutDiagramSync(model, { engine: 'dagre', ...options });
  } catch {
    return gridLayout(model, options);
  }
}

/** Core's `layoutDiagram` (ELK by default; in a Web Worker when `options.workerUrl` is set). */
export function layoutAsync(
  model: DiagramModel,
  options: AutoLayoutOptions = {},
): Promise<DiagramGeometry> {
  return layoutDiagram(model, options);
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

/** Group rectangle around member boxes (same formula as core). */
export function groupBox(members: Box[]): Box {
  const u = unionBoxes(members);
  const pad = METRICS.groupPadding;
  return {
    x: u.x - pad,
    y: u.y - pad - METRICS.groupHeaderHeight,
    width: u.width + pad * 2,
    height: u.height + pad * 2 + METRICS.groupHeaderHeight,
  };
}

export function computeGroups(
  model: DiagramModel,
  nodes: Record<string, NodeGeometry>,
): Record<string, GroupGeometry> {
  const out: Record<string, GroupGeometry> = {};
  for (const g of model.groups) {
    const members = g.tableIds.map((id) => nodes[id]).filter((n): n is NodeGeometry => !!n);
    if (members.length) out[g.id] = { id: g.id, ...groupBox(members) };
  }
  return out;
}

export function computeBounds(geometry: Omit<DiagramGeometry, 'bounds'>): Box {
  const boxes: Box[] = [...Object.values(geometry.nodes), ...Object.values(geometry.groups)];
  for (const e of Object.values(geometry.edges))
    for (const p of e.points) boxes.push({ x: p.x, y: p.y, width: 0, height: 0 });
  return unionBoxes(boxes);
}

/**
 * `base` with some nodes moved: group boxes recomputed, ELK routes dropped for refs touching a
 * moved table (the renderer routes those itself), bounds recomputed.
 */
export function moveNodes(
  model: DiagramModel,
  base: DiagramGeometry,
  positions: ReadonlyMap<string, { x: number; y: number }>,
): DiagramGeometry {
  const moved = new Set<string>();
  const nodes: Record<string, NodeGeometry> = {};
  for (const [id, n] of Object.entries(base.nodes)) {
    const p = positions.get(id);
    if (p && (Math.abs(p.x - n.x) > 0.01 || Math.abs(p.y - n.y) > 0.01)) {
      moved.add(id);
      nodes[id] = { ...n, x: p.x, y: p.y };
    } else nodes[id] = n;
  }
  if (!moved.size) return base;
  const edges: DiagramGeometry['edges'] = {};
  for (const r of model.refs) {
    const e = base.edges[r.id];
    if (e && !moved.has(r.from.tableId) && !moved.has(r.to.tableId)) edges[r.id] = e;
  }
  const groups = computeGroups(model, nodes);
  return { nodes, groups, edges, bounds: computeBounds({ nodes, groups, edges }) };
}

interface Item {
  id: string;
  kind: 'table' | 'note';
  width: number;
  height: number;
}

/** Places items in a near-square grid starting at (0, 0); returns positions and the block size. */
function gridBlock(
  items: Item[],
  gap: number,
): { pos: Map<string, Box>; width: number; height: number } {
  const pos = new Map<string, Box>();
  const perRow = Math.max(1, Math.ceil(Math.sqrt(items.length)));
  let y = 0;
  let width = 0;
  for (let i = 0; i < items.length; i += perRow) {
    const row = items.slice(i, i + perRow);
    let x = 0;
    let rowH = 0;
    for (const it of row) {
      pos.set(it.id, { x, y, width: it.width, height: it.height });
      x += it.width + gap;
      rowH = Math.max(rowH, it.height);
    }
    width = Math.max(width, x - gap);
    y += rowH + gap;
  }
  return { pos, width, height: Math.max(0, y - gap) };
}

/**
 * Deterministic grid placement (no dependencies): each TableGroup as a block of its tables, then
 * ungrouped tables and notes, blocks packed in rows. Honours saved positions. Used when core's
 * layout is unavailable, and by tests.
 */
export function gridLayout(model: DiagramModel, options: LayoutOptions = {}): DiagramGeometry {
  const detail = options.detailLevel ?? 'all';
  const saved = options.saved?.nodes ?? {};
  const nodes: Record<string, NodeGeometry> = {};
  const gap = 64;
  const free: Item[] = [];
  const byGroup = new Map<string, Item[]>();
  const add = (it: Item, groupId: string | null) => {
    const s = saved[it.id];
    const width = s?.w ?? it.width;
    const height = s?.h ?? it.height;
    if (s && typeof s.x === 'number' && typeof s.y === 'number') {
      nodes[it.id] = { id: it.id, kind: it.kind, x: s.x, y: s.y, width, height };
      return;
    }
    const item = { ...it, width, height };
    if (groupId && model.groups.some((g) => g.id === groupId)) {
      const list = byGroup.get(groupId) ?? [];
      list.push(item);
      byGroup.set(groupId, list);
    } else free.push(item);
  };
  for (const t of model.tables)
    add({ id: t.id, kind: 'table', ...measureTable(t, detail, options.measure) }, t.groupId);
  for (const n of model.stickyNotes)
    add({ id: n.id, kind: 'note', ...measureNote(n, options.measure) }, null);

  // Blocks: one per group (with room for the group frame), then the free items one by one.
  const pad = METRICS.groupPadding;
  const blocks: Array<{
    pos: Map<string, Box>;
    width: number;
    height: number;
    ox: number;
    oy: number;
  }> = [];
  for (const g of model.groups) {
    const items = byGroup.get(g.id);
    if (!items?.length) continue;
    const b = gridBlock(items, gap);
    blocks.push({
      ...b,
      width: b.width + pad * 2,
      height: b.height + pad * 2 + METRICS.groupHeaderHeight,
      ox: pad,
      oy: pad + METRICS.groupHeaderHeight,
    });
  }
  for (const it of free) {
    blocks.push({
      pos: new Map([[it.id, { x: 0, y: 0, width: it.width, height: it.height }]]),
      width: it.width,
      height: it.height,
      ox: 0,
      oy: 0,
    });
  }

  // Start below anything placed from saved positions.
  const placed = Object.values(nodes);
  const startY = placed.length ? Math.max(...placed.map((n) => n.y + n.height)) + gap * 2 : 0;
  const area = blocks.reduce((a, b) => a + (b.width + gap) * (b.height + gap), 0);
  const maxRowWidth = Math.max(800, Math.sqrt(area) * 1.6);
  let x = 0;
  let y = startY;
  let rowH = 0;
  const byId = new Map([...model.tables, ...model.stickyNotes].map((e) => [e.id, e]));
  for (const b of blocks) {
    if (x > 0 && x + b.width > maxRowWidth) {
      x = 0;
      y += rowH + gap;
      rowH = 0;
    }
    for (const [id, p] of b.pos) {
      const kind = byId.get(id) && 'columns' in byId.get(id)! ? 'table' : 'note';
      nodes[id] = {
        id,
        kind,
        x: x + b.ox + p.x,
        y: y + b.oy + p.y,
        width: p.width,
        height: p.height,
      };
    }
    x += b.width + gap;
    rowH = Math.max(rowH, b.height);
  }
  const groups = computeGroups(model, nodes);
  const edges = {};
  return { nodes, groups, edges, bounds: computeBounds({ nodes, groups, edges }) };
}
