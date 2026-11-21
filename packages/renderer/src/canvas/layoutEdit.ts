/**
 * Pure Layout edits for the editable canvas: positions and node settings per view. Every result
 * is a new Layout (inputs are never mutated) that passes `parseLayout` and is stable under
 * `serializeLayout`. Node ids may be any string (including `__proto__`): entries are written as own
 * data properties, never through assignment.
 */
import {
  DEFAULT_VIEW,
  emptyLayout,
  mergeViewDefaults,
  type Layout,
  type NodeLayout,
  type NodeOverride,
  type ViewLayoutOverride,
} from '@relvista/core';
import type { NodeSettings } from './types.js';

/**
 * A node position in diagram units.
 *
 * @inline
 */
type Pos = { x: number; y: number };

function setOwn<T>(obj: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

function own<T>(obj: Record<string, T> | undefined, key: string): T | undefined {
  return obj && Object.hasOwn(obj, key) ? obj[key] : undefined;
}

/** Whole px, never -0. */
function px(n: number): number {
  const r = Math.round(n);
  return r === 0 ? 0 : r;
}

function hasPosition(n: NodeOverride | undefined): n is NodeOverride & Pos {
  return !!n && Number.isFinite(n.x) && Number.isFinite(n.y);
}

/** Shallow copy of a view with its own `nodes` record (entries shared until replaced). */
function copyView(view: ViewLayoutOverride | undefined): ViewLayoutOverride {
  return view ? { ...view, nodes: { ...view.nodes } } : { nodes: {} };
}

/** A copy of `layout` whose views record (and the edited view) can be written to. */
function editView(
  layout: Layout | null,
  view: string,
): { next: Layout; nodes: Record<string, NodeOverride> } {
  const base = layout ?? emptyLayout();
  const views = { ...base.views } as Layout['views'];
  const edited = copyView(own(views, view));
  setOwn(views as Record<string, ViewLayoutOverride>, view, edited);
  return { next: { ...base, views }, nodes: edited.nodes };
}

/** Positions the active view shows: mergeViewDefaults + only entries with finite x and y. */
export function effectivePositions(layout: Layout | null, view: string): Record<string, Pos> {
  const out: Record<string, Pos> = {};
  if (!layout) return out;
  for (const [id, n] of Object.entries(mergeViewDefaults(layout, view).nodes)) {
    if (hasPosition(n)) setOwn(out, id, { x: n.x, y: n.y });
  }
  return out;
}

/**
 * Writes positions (rounded to integers) into `view` ('*' → default view, else the named view's
 * overrides), keeping the other fields of each entry. Returns a new Layout; `null` → emptyLayout().
 */
export function setNodePositions(
  layout: Layout | null,
  view: string,
  positions: Record<string, Pos>,
): Layout {
  const { next, nodes } = editView(layout, view);
  for (const [id, p] of Object.entries(positions)) {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    setOwn(nodes, id, { ...own(nodes, id), x: px(p.x), y: px(p.y) });
  }
  return next;
}

/**
 * Sets or clears (`false` → field removed) `pinned` / `collapsed` in `view`. In a named view a
 * node with no position anywhere gets only the setting (no x/y), as the schema allows; clearing a
 * setting the default view sets writes an explicit `false` there, so the view really differs.
 *
 * The default view needs a position for every entry: a node without one is written at
 * `fallback[id]` (the canvas passes the drawn positions), or skipped when there is none.
 */
export function setNodeSettings(
  layout: Layout | null,
  view: string,
  ids: readonly string[],
  settings: NodeSettings,
  fallback?: Record<string, Pos>,
): Layout {
  const { next, nodes } = editView(layout, view);
  const named = view !== DEFAULT_VIEW;
  const defaults: Record<string, NodeLayout> = next.views[DEFAULT_VIEW]?.nodes ?? {};
  const keys = (['pinned', 'collapsed'] as const).filter((k) => settings[k] !== undefined);
  for (const id of ids) {
    let entry: NodeOverride = { ...own(nodes, id) };
    if (!named && !hasPosition(entry)) {
      const p = own(fallback, id);
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      entry = { ...entry, x: px(p.x), y: px(p.y) };
    }
    for (const k of keys) {
      if (settings[k]) entry[k] = true;
      else if (named && own(defaults, id)?.[k]) entry[k] = false;
      else delete entry[k];
    }
    if (named && Object.keys(entry).length === 0) {
      delete nodes[id];
      continue;
    }
    setOwn(nodes, id, entry);
  }
  return next;
}

/** A node size written by a resize: `w`/`h`, and the new top-left when it moved. */
export interface NodeSize {
  w: number;
  h: number;
  x?: number;
  y?: number;
}

/**
 * Writes sizes (rounded to integers, at least 1) into `view`, keeping the other fields of each
 * entry; `x`/`y` are written too when given (a resize from the top or left edge). In the default
 * view an entry without a position gets `fallback[id]` (the drawn position), or is skipped.
 */
export function setNodeSizes(
  layout: Layout | null,
  view: string,
  sizes: Record<string, NodeSize>,
  fallback?: Record<string, Pos>,
): Layout {
  const { next, nodes } = editView(layout, view);
  const named = view !== DEFAULT_VIEW;
  for (const [id, s] of Object.entries(sizes)) {
    if (!Number.isFinite(s.w) || !Number.isFinite(s.h)) continue;
    let entry: NodeOverride = { ...own(nodes, id) };
    const moved =
      s.x !== undefined && s.y !== undefined && Number.isFinite(s.x) && Number.isFinite(s.y);
    if (moved) entry = { ...entry, x: px(s.x!), y: px(s.y!) };
    else if (!named && !hasPosition(entry)) {
      const p = own(fallback, id);
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      entry = { ...entry, x: px(p.x), y: px(p.y) };
    }
    entry.w = Math.max(1, px(s.w));
    entry.h = Math.max(1, px(s.h));
    setOwn(nodes, id, entry);
  }
  return next;
}

/**
 * Collapses (`true`) or expands groups (`group:<name>` ids) in `view`. Collapsing writes
 * `collapsed: true` and the group's current box position `boxes[id]` (rounded), so the collapsed
 * box stays where the group was; expanding removes `collapsed` (an explicit `false` in a named view
 * whose default view collapses it) and leaves `x`/`y`, which an expanded group ignores.
 */
export function setGroupsCollapsed(
  layout: Layout | null,
  view: string,
  ids: readonly string[],
  collapsed: boolean,
  boxes: Record<string, Pos>,
): Layout {
  // Expanding writes no position: a group that never had an entry gets none.
  if (!collapsed) return setNodeSettings(layout, view, ids, { collapsed: false });
  const positions: Record<string, Pos> = {};
  for (const id of ids) {
    const b = own(boxes, id);
    if (b && Number.isFinite(b.x) && Number.isFinite(b.y)) setOwn(positions, id, b);
  }
  const placed = setNodePositions(layout, view, positions);
  return setNodeSettings(placed, view, ids, { collapsed: true }, boxes);
}

/** The effective entry of one node in a view (merged), or undefined. */
export function nodeEntry(
  layout: Layout | null,
  view: string,
  id: string,
): NodeOverride | undefined {
  if (!layout) return undefined;
  return own(mergeViewDefaults(layout, view).nodes, id);
}
