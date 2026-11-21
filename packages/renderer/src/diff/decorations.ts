/**
 * Diff decorations (docs/design/phase3-v1.md §4.6): a `ModelDiff` from `@relvista/core`'s
 * `diffModels` as the `Decorations` that colour its `mergeForDiff` model. Pure.
 */
import type { ChangeStatus, ModelDiff, TableDiff } from '@relvista/core';
import type { DecorationTone, Decorations } from '../svg/decorations.js';

/** U+2212 MINUS SIGN, as in "+2 −1 ~3". */
const MINUS = '−';

/** Column and table-level counts of a changed table. */
function tableCounts(t: TableDiff): { added: number; removed: number; changed: number } {
  let added = 0;
  let removed = 0;
  let changed = t.changes.length + t.indexes.length + t.checks.length;
  for (const c of t.columns) {
    if (c.status === 'added') added++;
    else if (c.status === 'removed') removed++;
    else changed++;
  }
  return { added, removed, changed };
}

/**
 * Badge of a changed table: "+<added columns> −<removed columns> ~<other changes>", where the
 * last part counts changed columns plus table-level changes (rename, note, header colour, alias,
 * group) and index / check entries. Zero parts are left out; '' when nothing counts.
 */
export function diffBadge(t: TableDiff): string {
  const n = tableCounts(t);
  const parts: string[] = [];
  if (n.added > 0) parts.push(`+${n.added}`);
  if (n.removed > 0) parts.push(`${MINUS}${n.removed}`);
  if (n.changed > 0) parts.push(`~${n.changed}`);
  return parts.join(' ');
}

/**
 * Decorations for a `mergeForDiff` model: added / removed / changed tones on tables (by id in the
 * merged model, i.e. the new id of a renamed table), on the columns of changed tables, on refs,
 * sticky notes and groups; badges "+2 −1 ~3" on changed tables. Nothing is dimmed.
 */
export function diffDecorations(diff: ModelDiff): Decorations {
  const nodes: Record<string, DecorationTone> = {};
  const columns: Record<string, Record<string, DecorationTone>> = {};
  const refs: Record<string, DecorationTone> = {};
  const badges: Record<string, string> = {};

  for (const t of diff.tables) {
    nodes[t.id] = t.status;
    if (t.status !== 'changed') continue;
    if (t.columns.length > 0) {
      const tones: Record<string, DecorationTone> = {};
      for (const c of t.columns) tones[c.name] = c.status;
      columns[t.id] = tones;
    }
    const badge = diffBadge(t);
    if (badge) badges[t.id] = badge;
  }
  for (const r of diff.refs) refs[r.id] = r.status;
  for (const g of diff.groups) nodes[g.id] = g.status;
  for (const n of diff.notes) nodes[n.id] = n.status;

  const out: Decorations = {};
  if (Object.keys(nodes).length > 0) out.nodes = nodes;
  if (Object.keys(columns).length > 0) out.columns = columns;
  if (Object.keys(refs).length > 0) out.refs = refs;
  if (Object.keys(badges).length > 0) out.badges = badges;
  return out;
}

const LEGEND: readonly { tone: ChangeStatus & DecorationTone; label: string }[] = [
  { tone: 'added', label: 'Added' },
  { tone: 'removed', label: 'Removed' },
  { tone: 'changed', label: 'Changed' },
];

/**
 * Legend items for a diff (label, tone, count) for overlays: added, removed, changed in that
 * order, counting top-level entries like `diff.summary` (tables, refs, enums, groups, notes,
 * views; project settings once). Tones with no entries are left out, so an empty diff has none.
 */
export function diffLegend(
  diff: ModelDiff,
): Array<{ tone: DecorationTone; label: string; count: number }> {
  return LEGEND.map(({ tone, label }) => ({ tone, label, count: diff.summary[tone] ?? 0 })).filter(
    (item) => item.count > 0,
  );
}
