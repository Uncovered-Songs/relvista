/**
 * Helpers for the two-table path mode (docs/design/phase3-v1.md §4.7): the path's tables in walking
 * order and the sentence the search panel shows. Pure.
 */
import { tableTitle, type DiagramModel, type Subgraph } from '@relvista/core';

/** A shortest path as `shortestPath` returns it (tables and refs in model order). */
export type TablePath = Subgraph & { length: number };

/**
 * Table ids of `path` in walking order from `fromId`: `shortestPath` lists them in model order,
 * with one ref per hop, so the walk follows the refs from the start table.
 */
export function pathOrder(model: DiagramModel, path: TablePath, fromId: string): string[] {
  const refs = new Map(model.refs.map((r) => [r.id, r]));
  const left = path.refIds.filter((id) => refs.has(id));
  const out = [fromId];
  let at = fromId;
  while (left.length) {
    const i = left.findIndex((id) => {
      const r = refs.get(id)!;
      return r.from.tableId === at || r.to.tableId === at;
    });
    if (i < 0) break;
    const r = refs.get(left[i]!)!;
    left.splice(i, 1);
    // A self-reference stays on the same table; it never lies on a shortest path, but be safe.
    const next = r.from.tableId === at ? r.to.tableId : r.from.tableId;
    if (next === at) continue;
    out.push(next);
    at = next;
  }
  // Anything the walk could not reach (malformed input) keeps its model order at the end.
  for (const id of path.tableIds) if (!out.includes(id)) out.push(id);
  return out;
}

/** Display name of a table id (its name, schema-qualified outside `public`), or the id itself. */
export function tableLabel(model: DiagramModel, id: string): string {
  const t = model.tables.find((x) => x.id === id);
  return t ? tableTitle(t) : id;
}

/**
 * "users → orders → order_items, 2 refs", or "No relationship path between users and tags" when
 * `path` is null.
 */
export function pathText(
  model: DiagramModel,
  path: TablePath | null,
  ends: readonly [string, string],
): string {
  const [a, b] = ends;
  if (!path)
    return `No relationship path between ${tableLabel(model, a)} and ${tableLabel(model, b)}`;
  const names = pathOrder(model, path, a).map((id) => tableLabel(model, id));
  return `${names.join(' → ')}, ${path.length} ${path.length === 1 ? 'ref' : 'refs'}`;
}
