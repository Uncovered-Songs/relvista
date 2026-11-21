/**
 * Collapsed TableGroups on the drawing side (docs/design/phase3-v1.md §4.2): which node a table is
 * drawn as, and refs merged per pair of display nodes. Computed locally from `model.groups` and
 * `geometry.groups[*].collapsed` (core §3.1), so the drawing does not depend on the router's
 * `fromNode` / `toNode`.
 */
import type { DiagramGeometry, DiagramModel, Ref, RefEndpoint } from '@relvista/core';

/**
 * Table id → display node id (`group:<name>`) for every member of a collapsed group. Tables not in
 * the map are drawn as themselves.
 */
export function displayNodeMap(
  model: DiagramModel,
  geometry: DiagramGeometry,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const g of model.groups) {
    if (geometry.groups[g.id]?.collapsed !== true) continue;
    for (const t of g.tableIds) if (!out.has(t)) out.set(t, g.id);
  }
  return out;
}

/** The node table `tableId` is drawn as: its own id, or its collapsed group's. */
function displayNodeFor(tableId: string, map: ReadonlyMap<string, string>): string {
  return map.get(tableId) ?? tableId;
}

/** Refs drawn as one line: their display ends are the same pair and one of them is a collapsed group. */
export interface MergedRef {
  /** Key of the line: the first ref's id (model order). */
  id: string;
  /** The refs of the line, in model order (one for a ref that is not merged). */
  refs: Ref[];
  /** Display node of each ref's `from` / `to` end, by ref id. */
  ends: ReadonlyMap<string, { fromNode: string; toNode: string }>;
}

/**
 * The refs of `model` grouped into drawn lines, in model order of each line's first ref. Refs with
 * both ends in the same collapsed group are dropped (they are inside the card). Refs between two
 * plain tables are never merged: each keeps its own column rows.
 */
export function mergeRefs(model: DiagramModel, geometry: DiagramGeometry): MergedRef[] {
  const map = displayNodeMap(model, geometry);
  const lines: MergedRef[] = [];
  const byPair = new Map<string, MergedRef>();
  for (const ref of model.refs) {
    const fromNode = displayNodeFor(ref.from.tableId, map);
    const toNode = displayNodeFor(ref.to.tableId, map);
    const collapsedEnd = map.has(ref.from.tableId) || map.has(ref.to.tableId);
    if (collapsedEnd && fromNode === toNode) continue;
    const ends = new Map([[ref.id, { fromNode, toNode }]]);
    if (!collapsedEnd) {
      lines.push({ id: ref.id, refs: [ref], ends });
      continue;
    }
    const key = [fromNode, toNode].sort().join('\u0000');
    const line = byPair.get(key);
    if (line) {
      line.refs.push(ref);
      (line.ends as Map<string, { fromNode: string; toNode: string }>).set(ref.id, {
        fromNode,
        toNode,
      });
    } else {
      const fresh: MergedRef = { id: ref.id, refs: [ref], ends };
      byPair.set(key, fresh);
      lines.push(fresh);
    }
  }
  return lines;
}

/** The first ref of `line` that `routes` has a route for (the line is drawn along it). */
export function primaryRef<R>(
  line: MergedRef,
  routes: ReadonlyMap<string, R>,
): { ref: Ref; route: R } | null {
  for (const ref of line.refs) {
    const route = routes.get(ref.id);
    if (route) return { ref, route };
  }
  return null;
}

function same(a: RefEndpoint, b: RefEndpoint): boolean {
  return a.cardinality === b.cardinality && !!a.optional === !!b.optional;
}

/**
 * Markers of a merged line drawn along `primary`: the endpoint at each end of the primary ref when
 * every ref of the line agrees with it there (same cardinality and optionality), else null (a plain
 * end). Refs running the other way are compared at their matching end.
 */
export function mergedMarkers(
  line: MergedRef,
  primary: Ref,
): { from: RefEndpoint | null; to: RefEndpoint | null } {
  const p = line.ends.get(primary.id);
  let from: RefEndpoint | null = primary.from;
  let to: RefEndpoint | null = primary.to;
  for (const ref of line.refs) {
    if (ref === primary) continue;
    const e = line.ends.get(ref.id);
    const flipped = !!p && !!e && e.fromNode !== p.fromNode;
    const atFrom = flipped ? ref.to : ref.from;
    const atTo = flipped ? ref.from : ref.to;
    if (from && !same(from, atFrom)) from = null;
    if (to && !same(to, atTo)) to = null;
  }
  return { from, to };
}
