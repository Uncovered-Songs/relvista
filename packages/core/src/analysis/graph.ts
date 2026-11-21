/**
 * Graph queries over the tables and refs of a diagram model: N-hop neighbourhoods, shortest FK
 * paths and resolving a table reference typed by a user or found in a URL.
 *
 * Refs are undirected edges between tables. Everything is deterministic: adjacency lists are in
 * table model order and ties are broken by model order.
 */
import { DEFAULT_SCHEMA_NAME, tableIdOf } from '../ids.js';
import type { DiagramModel, Ref } from '../model/types.js';

/** Options of the graph functions (neighbours, focus, shortest path). */
export interface GraphOptions {
  /** Default true: inactive refs connect too. */
  includeInactive?: boolean;
}

/** A set of tables and the refs between them. */
export interface Subgraph {
  /** Model order. */
  tableIds: string[];
  /** Model order. */
  refIds: string[];
}

interface Graph {
  index: Map<string, number>;
  /** Neighbour table indexes per table index, ascending, without duplicates or self-loops. */
  adjacent: number[][];
  refs: Ref[];
}

function buildGraph(model: DiagramModel, options: GraphOptions): Graph {
  const index = new Map<string, number>();
  model.tables.forEach((t, i) => index.set(t.id, i));
  const includeInactive = options.includeInactive ?? true;
  const refs = model.refs.filter((r) => includeInactive || !r.inactive);
  const adjacent: number[][] = model.tables.map(() => []);
  for (const r of refs) {
    const a = index.get(r.from.tableId);
    const b = index.get(r.to.tableId);
    if (a === undefined || b === undefined || a === b) continue;
    adjacent[a]?.push(b);
    adjacent[b]?.push(a);
  }
  for (let i = 0; i < adjacent.length; i++) {
    const list = adjacent[i] as number[];
    adjacent[i] = list.sort((x, y) => x - y).filter((v, k) => k === 0 || list[k - 1] !== v);
  }
  return { index, adjacent, refs };
}

/** Breadth-first distances (in refs) from `sources`; -1 where unreachable or beyond `maxHops`. */
function distances(graph: Graph, sources: readonly number[], maxHops = Infinity): number[] {
  const dist = graph.adjacent.map(() => -1);
  let frontier: number[] = [];
  for (const s of sources) {
    if (dist[s] === -1) {
      dist[s] = 0;
      frontier.push(s);
    }
  }
  for (let hop = 1; hop <= maxHops && frontier.length > 0; hop++) {
    const next: number[] = [];
    for (const u of frontier) {
      for (const v of graph.adjacent[u] ?? []) {
        if (dist[v] === -1) {
          dist[v] = hop;
          next.push(v);
        }
      }
    }
    frontier = next;
  }
  return dist;
}

function subgraphOf(model: DiagramModel, graph: Graph, keep: readonly boolean[]): Subgraph {
  const kept = (id: string) => {
    const i = graph.index.get(id);
    return i !== undefined && keep[i] === true;
  };
  return {
    tableIds: model.tables.filter((_, i) => keep[i]).map((t) => t.id),
    refIds: graph.refs.filter((r) => kept(r.from.tableId) && kept(r.to.tableId)).map((r) => r.id),
  };
}

/**
 * Tables within `hops` refs of any of `ids` (undirected), with the refs among them. hops ≥ 0
 * (`Infinity` gives the connected components). Unknown ids are ignored. With
 * `includeInactive: false`, inactive refs neither connect nor appear in `refIds`.
 */
export function neighborhood(
  model: DiagramModel,
  ids: readonly string[],
  hops: number,
  options: GraphOptions = {},
): Subgraph {
  const graph = buildGraph(model, options);
  const sources: number[] = [];
  for (const id of ids) {
    const i = graph.index.get(id);
    if (i !== undefined) sources.push(i);
  }
  const maxHops = Number.isNaN(hops) ? 0 : Math.max(0, Math.floor(hops));
  const dist = distances(graph, sources, maxHops);
  return subgraphOf(
    model,
    graph,
    dist.map((d) => d >= 0),
  );
}

/**
 * Shortest path by number of refs (undirected BFS). Ties: the path whose sequence of table
 * indexes in model order is lexicographically smallest. `null` when unconnected or unknown ids.
 *
 * `tableIds` and `refIds` are in model order (walk `refIds` from `fromTableId` for path order);
 * between two consecutive path tables the first connecting ref in model order is used.
 */
export function shortestPath(
  model: DiagramModel,
  fromTableId: string,
  toTableId: string,
  options: GraphOptions = {},
): (Subgraph & { length: number }) | null {
  const graph = buildGraph(model, options);
  const from = graph.index.get(fromTableId);
  const to = graph.index.get(toTableId);
  if (from === undefined || to === undefined) return null;
  // Distances to the target; then walk greedily from the source through the smallest-index
  // neighbour one step closer, which yields the lexicographically smallest shortest path.
  const toTarget = distances(graph, [to]);
  const length = toTarget[from] ?? -1;
  if (length < 0) return null;
  const path = [from];
  let current = from;
  while (current !== to) {
    const d = toTarget[current] as number;
    const next = (graph.adjacent[current] ?? []).find((v) => toTarget[v] === d - 1);
    if (next === undefined) return null; // unreachable by construction
    path.push(next);
    current = next;
  }
  const onPath = new Set<string>();
  for (let k = 1; k < path.length; k++) {
    const a = model.tables[path[k - 1] as number]?.id;
    const b = model.tables[path[k] as number]?.id;
    const ref = graph.refs.find(
      (r) =>
        (r.from.tableId === a && r.to.tableId === b) ||
        (r.from.tableId === b && r.to.tableId === a),
    );
    if (ref) onPath.add(ref.id);
  }
  const keep = model.tables.map((_, i) => path.includes(i));
  return {
    tableIds: model.tables.filter((_, i) => keep[i]).map((t) => t.id),
    refIds: graph.refs.filter((r) => onPath.has(r.id)).map((r) => r.id),
    length,
  };
}

/** The only element of `ids`, `null` when there is none, `'ambiguous'` when there are several. */
function unique(ids: string[]): string | null | 'ambiguous' {
  if (ids.length === 0) return null;
  return ids.length === 1 ? (ids[0] as string) : 'ambiguous';
}

/**
 * Resolves what a user or URL wrote to a table id: exact id, `public.<name>`, a unique bare
 * name, a unique alias, case-insensitive unique name. `null` when none or ambiguous.
 *
 * The steps run in that order; the first step with exactly one match wins, and a step with
 * several matches makes the result `null` (ambiguous). The case-insensitive step compares the
 * name, the id and `schema.name`.
 */
export function resolveTableRef(model: DiagramModel, text: string): string | null {
  const t = text.trim();
  if (t.length === 0) return null;
  const tables = model.tables;
  const steps: Array<() => string[]> = [
    () => tables.filter((x) => x.id === t).map((x) => x.id),
    () => {
      const id = tableIdOf(DEFAULT_SCHEMA_NAME, t);
      return tables.filter((x) => x.id === id).map((x) => x.id);
    },
    () => tables.filter((x) => x.name === t).map((x) => x.id),
    () => tables.filter((x) => x.alias === t).map((x) => x.id),
    () => {
      const lower = t.toLowerCase();
      return tables
        .filter(
          (x) =>
            x.name.toLowerCase() === lower ||
            x.id.toLowerCase() === lower ||
            `${x.schema}.${x.name}`.toLowerCase() === lower,
        )
        .map((x) => x.id);
    },
  ];
  for (const step of steps) {
    const found = unique(step());
    if (found === 'ambiguous') return null;
    if (found !== null) return found;
  }
  return null;
}
