/**
 * Collapsed TableGroups (docs/design/phase3-v1.md §3.1). A layout entry `group:<name>` with
 * `collapsed: true` turns the group into one node of the layout: a card like a table with the
 * group name as header and one row "N tables". Its member tables are not laid out; refs to them
 * attach to the card's header.
 */
import type { NodeLayout, ViewLayout } from '../layout/types.js';
import type { DiagramModel, TableGroup } from '../model/types.js';
import { METRICS, estimateTextWidth } from './metrics.js';
import type { TextMeasure } from './types.js';

/** The row text of a collapsed group card ("1 table", "N tables"). The renderer draws the same. */
export function collapsedGroupLabel(tableCount: number): string {
  return tableCount === 1 ? '1 table' : `${tableCount} tables`;
}

/**
 * Ids of the groups of `model` (view-filtered) that `saved` marks collapsed. Groups without a
 * visible table are left out (they have no box, collapsed or not). Model order.
 */
export function collapsedGroupIds(
  model: DiagramModel,
  saved: Partial<ViewLayout> | null | undefined,
): Set<string> {
  const out = new Set<string>();
  const nodes: Record<string, Partial<NodeLayout>> | undefined = saved?.nodes;
  if (!nodes) return out;
  const withTables = new Set<string>();
  for (const t of model.tables) if (t.groupId) withTables.add(t.groupId);
  for (const g of model.groups) {
    if (!withTables.has(g.id) || !Object.prototype.hasOwnProperty.call(nodes, g.id)) continue;
    if (nodes[g.id]?.collapsed === true) out.add(g.id);
  }
  return out;
}

/**
 * Size of a collapsed group card: a header with the group name (plus the note icon when the group
 * has a note) and one row "N tables" with a stacked-cards icon in the key-marker slot. Widths are
 * clamped like tables (`METRICS.minTableWidth .. maxTableWidth`).
 */
export function measureCollapsedGroup(
  group: TableGroup,
  tableCount: number,
  measure: TextMeasure = estimateTextWidth,
): { width: number; height: number } {
  const header =
    METRICS.paddingX * 2 +
    measure(group.name, 'tableName') +
    (group.note ? METRICS.headerNoteIconWidth : 0);
  const row =
    METRICS.paddingX * 2 +
    METRICS.keyMarkerWidth +
    measure(collapsedGroupLabel(tableCount), 'columnName');
  const width = Math.min(
    METRICS.maxTableWidth,
    Math.max(METRICS.minTableWidth, Math.ceil(Math.max(header, row))),
  );
  return {
    width,
    height: METRICS.headerHeight + METRICS.rowHeight + METRICS.tableBottomPadding,
  };
}
