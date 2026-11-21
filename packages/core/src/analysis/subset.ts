import type { DiagramModel } from '../model/types.js';

/**
 * `model` reduced to the given tables (+ notes), like `selectView` does for a DiagramView:
 * refs between kept tables, groups with kept members (tableIds filtered), views untouched.
 *
 * Order follows the model, not `keep`; unknown ids are ignored. Groups left without a kept table
 * are dropped. Sticky notes are kept only when listed in `noteIds` (none when it is omitted).
 * Enums, the project and the view list are kept whole; `records` keeps the kept tables' counts.
 * Columns keep their `isFk` flag from the full model.
 */
export function subsetModel(
  model: DiagramModel,
  keep: { tableIds: readonly string[]; noteIds?: readonly string[] },
): DiagramModel {
  const tableIds = new Set(keep.tableIds);
  const noteIds = new Set(keep.noteIds ?? []);
  const result: DiagramModel = {
    ...model,
    tables: model.tables.filter((t) => tableIds.has(t.id)),
    refs: model.refs.filter((r) => tableIds.has(r.from.tableId) && tableIds.has(r.to.tableId)),
    groups: model.groups
      .map((g) => ({ ...g, tableIds: g.tableIds.filter((id) => tableIds.has(id)) }))
      .filter((g) => g.tableIds.length > 0),
    stickyNotes: model.stickyNotes.filter((n) => noteIds.has(n.id)),
  };
  if (model.records) {
    result.records = Object.fromEntries(
      Object.entries(model.records).filter(([id]) => tableIds.has(id)),
    );
  }
  return result;
}
