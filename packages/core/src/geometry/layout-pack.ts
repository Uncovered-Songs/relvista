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

/** Rows-of-blocks packing ("shelf" packing). Blocks are placed in the given order. */
export function packBlocks(
  blocks: Block[],
  gap: number = BLOCK_GAP,
  aspect: number = TARGET_ASPECT,
): Placement {
  const out: Placement = { positions: new Map(), edges: new Map() };
  if (!blocks.length) return out;
  let area = 0;
  let widest = 0;
  for (const b of blocks) {
    area += (b.width + gap) * (b.height + gap);
    widest = Math.max(widest, b.width);
  }
  const rowWidth = Math.max(widest, Math.sqrt(area * aspect));
  let x = 0;
  let y = 0;
  let rowHeight = 0;
  for (const b of blocks) {
    if (x > 0 && x + b.width > rowWidth) {
      y += rowHeight + gap;
      x = 0;
      rowHeight = 0;
    }
    translatePlacement(b.placement, Math.round(x), Math.round(y));
    for (const [id, p] of b.placement.positions) out.positions.set(id, p);
    for (const [id, pts] of b.placement.edges) out.edges.set(id, pts);
    x += b.width + gap;
    rowHeight = Math.max(rowHeight, b.height);
  }
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
): Placement {
  return packBlocks(orderBlocks(comps.map((c) => toBlock(c, layoutOne(c)))), gap);
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
