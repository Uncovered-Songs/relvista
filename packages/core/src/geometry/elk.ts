/**
 * ELK (elkjs) engine: layered layout with one port per referenced column row, orthogonal routing,
 * TableGroups as compound nodes.
 *
 * elkjs is loaded lazily with a dynamic import so it never weighs on bundles that do not lay out,
 * and so the same code runs in Node (tests, SSR) and in bundlers (Vite, webpack 5, Rspack):
 * - default: `elkjs/lib/elk.bundled.js`, which runs ELK in-process (no Worker, no `require`).
 * - `workerUrl`: `elkjs/lib/elk-api.js` with a real Web Worker loading that URL (the caller serves
 *   `elkjs/lib/elk-worker.min.js`, e.g. `new URL('elkjs/lib/elk-worker.min.js', import.meta.url)`).
 *   Falls back to in-process when `Worker` is missing or the worker fails.
 */
import { METRICS } from './metrics.js';
import { HEADER_ROW, portY, type LayoutGraph, type Placement } from './layout-graph.js';
import { gridPlacement, singlePlacement } from './layout-pack.js';
import { LAYER_GAP, NODE_GAP, type Direction } from './layout-dagre.js';

interface ElkPoint {
  x: number;
  y: number;
}
interface ElkSection {
  startPoint: ElkPoint;
  endPoint: ElkPoint;
  bendPoints?: ElkPoint[];
}
interface ElkPort {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  layoutOptions: Record<string, string>;
}
interface ElkEdge {
  id: string;
  sources: string[];
  targets: string[];
  container?: string;
  sections?: ElkSection[];
}
interface ElkNode {
  id: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  layoutOptions?: Record<string, string>;
  children?: ElkNode[];
  ports?: ElkPort[];
  edges?: ElkEdge[];
}
/** The part of elkjs' `ELK` interface this module uses. */
export interface ElkApi {
  layout(graph: ElkNode): Promise<ElkNode>;
  terminateWorker?(): void;
}
type ElkConstructor = new (args?: {
  workerUrl?: string;
  workerFactory?: (url?: string) => Worker;
}) => ElkApi;

/** CommonJS/ESM interop: Node gives `{ default: module.exports }`, bundlers vary. */
function constructorOf(mod: unknown): ElkConstructor {
  let cur: unknown = mod;
  for (let i = 0; i < 3 && cur; i++) {
    if (typeof cur === 'function') return cur as ElkConstructor;
    cur = (cur as { default?: unknown }).default;
  }
  throw new Error('relvista: could not load elkjs');
}

let inline: Promise<ElkApi> | null = null;
const workers = new Map<string, Promise<ElkApi>>();

function loadInline(): Promise<ElkApi> {
  inline ??= import('elkjs/lib/elk.bundled.js').then((mod) => new (constructorOf(mod))());
  inline.catch(() => (inline = null));
  return inline;
}

function loadWorker(workerUrl: string): Promise<ElkApi> {
  let p = workers.get(workerUrl);
  if (!p) {
    p = import('elkjs/lib/elk-api.js').then((mod) => {
      const Ctor = constructorOf(mod);
      return new Ctor({ workerUrl, workerFactory: (url) => new Worker(url ?? workerUrl) });
    });
    workers.set(workerUrl, p);
    p.catch(() => workers.delete(workerUrl));
  }
  return p;
}

/**
 * Runs an ELK graph, in a Web Worker when `workerUrl` is given and `Worker` exists, otherwise
 * in-process. A failing worker falls back to in-process once.
 */
export async function runElk(graph: ElkNode, workerUrl?: string): Promise<ElkNode> {
  if (workerUrl && typeof Worker !== 'undefined') {
    const pending = loadWorker(workerUrl);
    try {
      return await (await pending).layout(graph);
    } catch {
      // Drop the (possibly dead) worker so the next call starts a fresh one; never leak it.
      workers.delete(workerUrl);
      pending.then((elk) => elk.terminateWorker?.()).catch(() => undefined);
    }
  }
  return (await loadInline()).layout(graph);
}

/**
 * Spacing, set on the root and on every group (compound) node: ELK reads spacing from the node
 * whose children it places, so without repeating them here tables inside a group end up 15-40px
 * apart, too close for the cardinality markers at both ends of a ref.
 */
function spacingOptions(): Record<string, string> {
  return {
    'elk.spacing.nodeNode': String(NODE_GAP),
    'elk.layered.spacing.nodeNodeBetweenLayers': String(LAYER_GAP),
    'elk.spacing.edgeNode': '24',
    'elk.spacing.edgeEdge': '14',
    'elk.layered.spacing.edgeNodeBetweenLayers': '24',
    'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
    'elk.spacing.componentComponent': String(NODE_GAP),
  };
}

/** Edge-to-table spacing inside groups (less than METRICS.groupPadding, see buildElkGraph). */
const GROUP_EDGE_NODE = 12;

/** Terminates every cached ELK Web Worker (apps that unmount all diagrams, tests). */
export function disposeElkWorkers(): void {
  for (const p of workers.values()) p.then((elk) => elk.terminateWorker?.()).catch(() => undefined);
  workers.clear();
}

function layoutOptions(direction: Direction): Record<string, string> {
  return {
    'elk.algorithm': 'layered',
    'elk.direction': direction,
    'elk.edgeRouting': 'ORTHOGONAL',
    'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
    'elk.padding': '[top=0,left=0,bottom=0,right=0]',
    ...spacingOptions(),
    'elk.separateConnectedComponents': 'true',
    // Measured on examples/14-large: network simplex + free ordering give ~25% less area and
    // shorter refs than Brandes-Koepf + model order (docs/design/autolayout.md).
    'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
    'elk.layered.considerModelOrder.strategy': 'NONE',
    'elk.layered.unnecessaryBendpoints': 'true',
    // More crossing-minimisation sweeps: on examples/14-large (7 groups) the picture is ~10%
    // smaller and closer to landscape (1.22 vs 1.09) for ~50ms more; small diagrams are unchanged.
    'elk.layered.thoroughness': '30',
    'elk.randomSeed': '1',
  };
}

/** Builds the ELK graph for one connected component. ELK ids are short indices, not model ids. */
export function buildElkGraph(
  g: LayoutGraph,
  direction: Direction,
): { graph: ElkNode; nodeIds: Map<string, string>; edgeIds: Map<string, string> } {
  const nodeIds = new Map<string, string>();
  const edgeIds = new Map<string, string>();
  const ports = new Map<string, ElkPort[]>();
  const portIds = new Set<string>();
  const portOf = (nodeId: string, row: number, side: 'E' | 'W'): string => {
    const node = g.nodeById.get(nodeId)!;
    const id = `n${node.index}${row === HEADER_ROW ? 'h' : `r${row}`}${side}`;
    if (!portIds.has(id)) {
      portIds.add(id);
      let list = ports.get(nodeId);
      if (!list) ports.set(nodeId, (list = []));
      list.push({
        id,
        x: side === 'E' ? node.width : 0,
        y: portY(row, node.height),
        width: 0,
        height: 0,
        layoutOptions: { 'elk.port.side': side === 'E' ? 'EAST' : 'WEST' },
      });
    }
    return id;
  };

  const edges: ElkEdge[] = g.edges.map((e) => {
    const self = e.source === e.target;
    const id = `e${e.index}`;
    edgeIds.set(id, e.id);
    return {
      id,
      // Self refs loop on the west side, away from the east ports other refs leave from.
      sources: [portOf(e.source, e.sourceRow, self ? 'W' : 'E')],
      targets: [portOf(e.target, e.targetRow, 'W')],
    };
  });

  const tableNode = (nodeId: string): ElkNode => {
    const n = g.nodeById.get(nodeId)!;
    const id = `n${n.index}`;
    nodeIds.set(id, n.id);
    const list = (ports.get(nodeId) ?? []).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return {
      id,
      width: n.width,
      height: n.height,
      layoutOptions: { 'elk.portConstraints': 'FIXED_POS' },
      ports: list,
    };
  };

  const pad = METRICS.groupPadding;
  const head = METRICS.groupHeaderHeight;
  const children: ElkNode[] = [];
  const emittedGroups = new Set<string>();
  for (const n of g.nodes) {
    if (!n.groupId) {
      children.push(tableNode(n.id));
      continue;
    }
    if (emittedGroups.has(n.groupId)) continue;
    emittedGroups.add(n.groupId);
    const grp = g.groups.find((x) => x.id === n.groupId)!;
    children.push({
      id: `g${grp.index}`,
      layoutOptions: {
        'elk.padding': `[top=${pad + head},left=${pad},bottom=${pad},right=${pad}]`,
        ...spacingOptions(),
        // Refs leaving a group run through its padding at this distance from the tables; with the
        // root's 24 (= groupPadding) they would lie exactly on the drawn group border.
        'elk.spacing.edgeNode': String(GROUP_EDGE_NODE),
        'elk.layered.spacing.edgeNodeBetweenLayers': String(GROUP_EDGE_NODE),
      },
      children: grp.members.map(tableNode),
    });
  }
  return {
    graph: { id: 'root', layoutOptions: layoutOptions(direction), children, edges },
    nodeIds,
    edgeIds,
  };
}

/** Reads ELK's result back into a placement (absolute coordinates within the component). */
export function readElkResult(
  result: ElkNode,
  nodeIds: Map<string, string>,
  edgeIds: Map<string, string>,
): Placement {
  const positions = new Map<string, { x: number; y: number }>();
  const offsets = new Map<string, ElkPoint>();
  const edges: ElkEdge[] = [];
  const walk = (n: ElkNode, ox: number, oy: number) => {
    const x = ox + (n.x ?? 0);
    const y = oy + (n.y ?? 0);
    offsets.set(n.id, { x, y });
    const model = nodeIds.get(n.id);
    if (model) positions.set(model, { x, y });
    for (const e of n.edges ?? []) edges.push(e);
    for (const c of n.children ?? []) walk(c, x, y);
  };
  walk(result, 0, 0);
  // Root offset is the frame origin.
  const root = offsets.get(result.id)!;
  for (const p of positions.values()) {
    p.x -= root.x;
    p.y -= root.y;
  }
  const routes = new Map<string, ElkPoint[]>();
  for (const e of edges) {
    const refId = edgeIds.get(e.id);
    if (!refId || !e.sections?.length) continue;
    const o = offsets.get(e.container ?? result.id) ?? root;
    const pts: ElkPoint[] = [];
    const push = (p: ElkPoint) => {
      const q = { x: p.x + o.x - root.x, y: p.y + o.y - root.y };
      const last = pts[pts.length - 1];
      if (!last || last.x !== q.x || last.y !== q.y) pts.push(q);
    };
    for (const s of e.sections) {
      push(s.startPoint);
      for (const b of s.bendPoints ?? []) push(b);
      push(s.endPoint);
    }
    if (pts.length >= 2) routes.set(refId, pts);
  }
  return { positions, edges: routes };
}

/** ELK layout of one connected component. */
export async function elkComponent(
  g: LayoutGraph,
  direction: Direction,
  workerUrl?: string,
): Promise<Placement> {
  if (g.nodes.length === 1 && !g.edges.length) return singlePlacement(g);
  if (!g.edges.length) return gridPlacement(g, NODE_GAP);
  const { graph, nodeIds, edgeIds } = buildElkGraph(g, direction);
  const result = await runElk(graph, workerUrl);
  return readElkResult(result, nodeIds, edgeIds);
}
