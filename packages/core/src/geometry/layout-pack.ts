/**
 * Packs independently laid-out blocks (connected components, lone tables, notes) into rows that
 * approximate a target aspect ratio, so disconnected parts of a schema form a compact picture
 * instead of one long line.
 */
import {
  placementBounds,
  translatePlacement,
  type LayoutGraph,
  type LayoutNode,
  type Placement,
} from './layout-graph.js';

/** Gap between packed blocks, in diagram units. */
export const BLOCK_GAP = 80;
/** Target width / height of a packed diagram (landscape, like most screens). */
export const TARGET_ASPECT = 1.6;

export interface Block {
  graph: LayoutGraph;
  /** Normalised so the block's bounding box (including group boxes and edges) starts at 0,0. */
  placement: Placement;
  width: number;
  height: number;
}

/** Wraps a placement as a block, moving its bounding box to the origin. */
export function toBlock(graph: LayoutGraph, placement: Placement): Block {
  const b = placementBounds(graph, placement);
  translatePlacement(placement, -b.x, -b.y);
  return { graph, placement, width: b.width, height: b.height };
}

/** Row breaks of a shelf packing: the x/y of each block for a given maximum row width. */
function shelf(
  blocks: Block[],
  gap: number,
  rowWidth: number,
): { at: Array<{ x: number; y: number }>; width: number; height: number } {
  const at: Array<{ x: number; y: number }> = [];
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  let width = 0;
  for (const b of blocks) {
    if (x > 0 && x + b.width > rowWidth) {
      y += rowHeight + gap;
      x = 0;
      rowHeight = 0;
    }
    at.push({ x, y });
    width = Math.max(width, x + b.width);
    x += b.width + gap;
    rowHeight = Math.max(rowHeight, b.height);
  }
  return { at, width, height: y + rowHeight };
}

/**
 * Rows-of-blocks packing ("shelf" packing). Blocks are placed in the given order; of all the row
 * widths that give a different packing, the one whose bounding box is closest to `aspect`
 * (width / height) wins, i.e. the one that can be shown largest in a viewport of that shape.
 */
export function packBlocks(
  blocks: Block[],
  gap: number = BLOCK_GAP,
  aspect: number = TARGET_ASPECT,
): Placement {
  const out: Placement = { positions: new Map(), edges: new Map() };
  if (!blocks.length) return out;
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : TARGET_ASPECT;
  let widest = 0;
  for (const b of blocks) widest = Math.max(widest, b.width);
  // Candidate row widths: every distinct "first k blocks fit on a row" width.
  const candidates = new Set<number>([widest]);
  let run = 0;
  for (const b of blocks) {
    run += b.width;
    if (run >= widest) candidates.add(run);
    run += gap;
  }
  let best: ReturnType<typeof shelf> | null = null;
  let bestScore = Infinity;
  for (const w of Array.from(candidates).sort((a, b) => a - b)) {
    const s = shelf(blocks, gap, w);
    // Size of the viewport (of the target shape) needed to show the packing at zoom 1.
    const score = Math.max(s.width / ratio, s.height);
    if (score < bestScore - 0.5) {
      best = s;
      bestScore = score;
    }
  }
  blocks.forEach((b, i) => {
    const p = best!.at[i]!;
    translatePlacement(b.placement, Math.round(p.x), Math.round(p.y));
    for (const [id, q] of b.placement.positions) out.positions.set(id, q);
    for (const [id, pts] of b.placement.edges) out.edges.set(id, pts);
  });
  return out;
}

function firstIndex(g: LayoutGraph): number {
  return g.nodes[0]?.index ?? 0;
}

function isLone(g: LayoutGraph, kind: LayoutNode['kind']): boolean {
  return g.nodes.length === 1 && g.edges.length === 0 && g.nodes[0]!.kind === kind;
}

/**
 * Packing order: connected components (largest first), then lone tables, then sticky notes, each in
 * model order on ties.
 */
export function orderBlocks(blocks: Block[]): Block[] {
  const rank = (b: Block) => (isLone(b.graph, 'note') ? 2 : isLone(b.graph, 'table') ? 1 : 0);
  return [...blocks].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (rank(a) === 0 ? b.graph.nodes.length - a.graph.nodes.length : 0) ||
      firstIndex(a.graph) - firstIndex(b.graph),
  );
}

/** Lays out each component with `layoutOne`, then packs the resulting blocks. */
export function layoutComponents(
  comps: LayoutGraph[],
  layoutOne: (g: LayoutGraph) => Placement,
  gap: number = BLOCK_GAP,
  aspect: number = TARGET_ASPECT,
): Placement {
  return packBlocks(orderBlocks(comps.map((c) => toBlock(c, layoutOne(c)))), gap, aspect);
}

/** Places a single node at the origin (components of one node need no engine). */
export function singlePlacement(g: LayoutGraph): Placement {
  return {
    positions: new Map(g.nodes.map((n) => [n.id, { x: 0, y: 0 }])),
    edges: new Map(),
  };
}

/** Grid placement of nodes with no edges (e.g. the tables of a group without refs). */
export function gridPlacement(g: LayoutGraph, gap: number): Placement {
  const blocks = g.nodes.map((n) => {
    const single: LayoutGraph = {
      nodes: [n],
      nodeById: new Map([[n.id, n]]),
      edges: [],
      groups: [],
    };
    return toBlock(single, singlePlacement(single));
  });
  return packBlocks(blocks, gap);
}
