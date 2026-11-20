/**
 * Synchronous engines: dagre (layered, no ports) and grid (no edges considered).
 *
 * dagre has no reliable padding control for compound nodes, so groups are laid out in two levels:
 * each group's members are laid out on their own, the group becomes one box in the outer layout, and
 * the inner placement is moved into that box. That guarantees group boxes never overlap.
 */
import dagre from '@dagrejs/dagre';
import { METRICS } from './metrics.js';
import {
  components,
  subgraph,
  translatePlacement,
  type LayoutGraph,
  type LayoutNode,
  type Placement,
} from './layout-graph.js';
import { gridPlacement, layoutComponents, singlePlacement, toBlock } from './layout-pack.js';

export type Direction = 'RIGHT' | 'DOWN';

/** Gap between nodes of one layer / between members of a group without refs. */
export const NODE_GAP = 48;
/** Gap between layers (room for the ref lines). */
export const LAYER_GAP = 110;
/** Gap between packed blocks inside a group. */
const INNER_BLOCK_GAP = NODE_GAP;

/** dagre on a flat, connected graph (no groups). */
function dagreFlat(g: LayoutGraph, direction: Direction): Placement {
  if (g.nodes.length === 1) return singlePlacement(g);
  if (!g.edges.length) return gridPlacement(g, NODE_GAP);
  const dg = new dagre.graphlib.Graph();
  dg.setGraph({
    rankdir: direction === 'DOWN' ? 'TB' : 'LR',
    nodesep: NODE_GAP,
    ranksep: LAYER_GAP,
    edgesep: 20,
    marginx: 0,
    marginy: 0,
    ranker: 'network-simplex',
  });
  dg.setDefaultEdgeLabel(() => ({}));
  for (const n of g.nodes) dg.setNode(n.id, { width: n.width, height: n.height });
  const pairs = new Set<string>();
  for (const e of g.edges) {
    if (e.source === e.target) continue;
    const key = JSON.stringify([e.source, e.target]);
    if (pairs.has(key)) continue;
    pairs.add(key);
    dg.setEdge(e.source, e.target);
  }
  dagre.layout(dg);
  const positions = new Map<string, { x: number; y: number }>();
  for (const n of g.nodes) {
    const d = dg.node(n.id) as { x: number; y: number };
    positions.set(n.id, { x: Math.round(d.x - n.width / 2), y: Math.round(d.y - n.height / 2) });
  }
  return { positions, edges: new Map() };
}

/** Flat layout of possibly disconnected nodes: each component with dagre, then packed. */
function dagreLoose(g: LayoutGraph, direction: Direction, gap: number): Placement {
  return layoutComponents(components(g), (c) => dagreFlat(c, direction), gap);
}

/** dagre on one connected component, groups laid out in two levels. */
function dagreComponent(g: LayoutGraph, direction: Direction): Placement {
  if (!g.groups.length) return dagreFlat(g, direction);
  const pad = METRICS.groupPadding;
  const head = METRICS.groupHeaderHeight;
  const groupOf = new Map<string, string>();
  const inner = new Map<string, Placement>();
  const superNodes: LayoutNode[] = [];
  const memberIds = new Set<string>();

  for (const grp of g.groups) {
    const members = new Set(grp.members);
    for (const m of grp.members) {
      groupOf.set(m, grp.id);
      memberIds.add(m);
    }
    const flat = { ...subgraph(g, (n) => members.has(n.id)), groups: [] };
    const block = toBlock(flat, dagreLoose(flat, direction, INNER_BLOCK_GAP));
    inner.set(grp.id, block.placement);
    const first = g.nodeById.get(grp.members[0]!)!;
    superNodes.push({
      id: grp.id,
      kind: 'table',
      index: first.index,
      width: block.width + pad * 2,
      height: block.height + pad * 2 + head,
      groupId: null,
    });
  }
  for (const n of g.nodes) if (!memberIds.has(n.id)) superNodes.push(n);
  superNodes.sort((a, b) => a.index - b.index);

  const outer: LayoutGraph = {
    nodes: superNodes,
    nodeById: new Map(superNodes.map((n) => [n.id, n])),
    edges: g.edges
      .map((e) => ({
        ...e,
        source: groupOf.get(e.source) ?? e.source,
        target: groupOf.get(e.target) ?? e.target,
      }))
      .filter((e) => e.source !== e.target),
    groups: [],
  };
  const placed = dagreFlat(outer, direction);
  const positions = new Map<string, { x: number; y: number }>();
  for (const n of superNodes) {
    const p = placed.positions.get(n.id)!;
    const sub = inner.get(n.id);
    if (!sub) {
      positions.set(n.id, p);
      continue;
    }
    translatePlacement(sub, p.x + pad, p.y + pad + head);
    for (const [id, q] of sub.positions) positions.set(id, q);
  }
  return { positions, edges: new Map() };
}

export function dagrePlacement(g: LayoutGraph, direction: Direction, aspect?: number): Placement {
  return layoutComponents(components(g), (c) => dagreComponent(c, direction), undefined, aspect);
}

/** Grid engine: refs are ignored; groups become grids of their members; everything is packed. */
export function gridEnginePlacement(g: LayoutGraph, aspect?: number): Placement {
  const loose: LayoutGraph = { ...g, edges: [] };
  return layoutComponents(components(loose), (c) => gridPlacement(c, NODE_GAP), undefined, aspect);
}
