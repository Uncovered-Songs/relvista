/**
 * Structural diff of two diagram models, a merged model to draw the diff on, and a text summary.
 *
 * Identity: tables and enums by id (`schema.name`), refs by `Ref.id` (endpoint-derived), groups
 * and sticky notes by id (name), views by name, columns by name within their table. Column order
 * alone is not a change, and columns injected from a TablePartial compare like own columns.
 */
import { DEFAULT_SCHEMA_NAME, parseRefId, refIdOf } from '../ids.js';
import type {
  Check,
  Column,
  ColumnDefault,
  DiagramModel,
  Index,
  Ref,
  SourceSpan,
  Table,
} from '../model/types.js';

/** How an entry differs between the two models of a diff. */
export type ChangeStatus = 'added' | 'removed' | 'changed';

/** One field that differs, with its value before and after. */
export interface FieldChange {
  /**
   * `'type' | 'pk' | 'notNull' | 'unique' | 'increment' | 'default' | 'note' | 'checks'` (columns),
   * `'name' | 'schema' | 'alias' | 'note' | 'headerColor' | 'group'` (tables),
   * `'relation' | 'name' | 'onDelete' | 'onUpdate' | 'color' | 'inactive' | 'note'` (refs),
   * `'color' | 'note' | 'tables'` (groups), `'content' | 'color'` (notes),
   * `'name' | 'note' | 'databaseType' | 'settings.<key>'` (project).
   */
  field: string;
  before: unknown;
  after: unknown;
}

/** A column that was added, removed or changed. */
export interface ColumnDiff {
  name: string;
  status: ChangeStatus;
  /** Empty unless 'changed'. */
  changes: FieldChange[];
}

/** A table that was added, removed, renamed or changed, with the columns that differ. */
export interface TableDiff {
  /** Id in `after` (in `before` for removed). */
  id: string;
  status: ChangeStatus;
  /** Set when a removed+added pair was paired as a rename (same column names and types). */
  renamedFrom?: string;
  /** Table-level fields (note, headerColor, alias, group; name/schema for renames). */
  changes: FieldChange[];
  /** Only columns that differ, in `after` order then removed ones (in `before` order). */
  columns: ColumnDiff[];
  indexes: { status: ChangeStatus; label: string }[];
  checks: { status: ChangeStatus; label: string }[];
}

/** Everything that differs between two models, as returned by `diffModels`. */
export interface ModelDiff {
  tables: TableDiff[];
  /** Id in `after` (in `before` for removed). */
  refs: { id: string; status: ChangeStatus; changes: FieldChange[] }[];
  enums: { id: string; status: ChangeStatus; values: { name: string; status: ChangeStatus }[] }[];
  groups: { id: string; status: ChangeStatus; changes: FieldChange[] }[];
  notes: { id: string; status: ChangeStatus; changes: FieldChange[] }[];
  views: { name: string; status: ChangeStatus }[];
  project: FieldChange[];
  /** Counts for a summary line: top-level entries (tables, refs, enums, groups, notes, views; project counts once). */
  summary: Record<'added' | 'removed' | 'changed', number>;
  /** True when nothing differs. */
  empty: boolean;
}

/** Options of `diffModels`. */
export interface DiffOptions {
  /** Pair removed+added tables with identical column (name, type) lists as renames. Default true. */
  detectRenames?: boolean;
}

// ---------------------------------------------------------------------------------------------
// helpers

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => same(v, b[i]));
  }
  const ka = Object.keys(a).sort();
  const kb = Object.keys(b).sort();
  return (
    same(ka, kb) &&
    ka.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}

function compareFields<T>(
  before: T,
  after: T,
  fields: ReadonlyArray<[string, (x: T) => unknown]>,
): FieldChange[] {
  const changes: FieldChange[] = [];
  for (const [field, get] of fields) {
    const b = get(before);
    const a = get(after);
    if (!same(b, a)) changes.push({ field, before: b, after: a });
  }
  return changes;
}

function byId<T>(items: readonly T[], key: (x: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) if (!map.has(key(item))) map.set(key(item), item);
  return map;
}

const sortedStrings = (xs: readonly string[]) => [...xs].sort();

const checkExprs = (checks: readonly Check[]) =>
  sortedStrings(checks.map((c) => (c.name ? `${c.name}: ${c.expression}` : c.expression)));

const COLUMN_FIELDS: ReadonlyArray<[string, (c: Column) => unknown]> = [
  ['type', (c) => c.type],
  ['pk', (c) => c.pk],
  ['notNull', (c) => c.notNull],
  ['unique', (c) => c.unique],
  ['increment', (c) => c.increment],
  ['default', (c) => c.default],
  ['note', (c) => c.note],
  ['checks', (c) => checkExprs(c.checks)],
];

/** Canonical text of an index, e.g. `(a, b desc) [unique, type: hash, name: 'ix']`. */
function indexLabel(ix: Index): string {
  const cols = ix.columns
    .map(
      (c) => (c.kind === 'expression' ? `\`${c.value}\`` : c.value) + (c.sortOrder ? ' desc' : ''),
    )
    .join(', ');
  const settings: string[] = [];
  if (ix.pk) settings.push('pk');
  if (ix.unique) settings.push('unique');
  if (ix.type) settings.push(`type: ${ix.type}`);
  if (ix.name) settings.push(`name: '${ix.name}'`);
  if (ix.note) settings.push(`note: '${ix.note}'`);
  return `(${cols})${settings.length ? ` [${settings.join(', ')}]` : ''}`;
}

const checkLabel = (c: Check) =>
  c.name ? `${c.name}: \`${c.expression}\`` : `\`${c.expression}\``;

/**
 * Pairs `before` and `after` items by key (first unmatched with the same key), returning added,
 * removed and changed (same key, different label) entries.
 */
function diffKeyed<T>(
  before: readonly T[],
  after: readonly T[],
  key: (x: T) => string,
  label: (x: T) => string,
): { status: ChangeStatus; label: string }[] {
  const out: { status: ChangeStatus; label: string }[] = [];
  const used = before.map(() => false);
  const removedLater: number[] = [];
  for (const a of after) {
    const k = key(a);
    // Prefer an identical item, then one with the same key.
    let i = before.findIndex((b, j) => !used[j] && key(b) === k && label(b) === label(a));
    if (i < 0) i = before.findIndex((b, j) => !used[j] && key(b) === k);
    if (i < 0) {
      out.push({ status: 'added', label: label(a) });
      continue;
    }
    used[i] = true;
    if (label(before[i] as T) !== label(a)) out.push({ status: 'changed', label: label(a) });
  }
  before.forEach((_, j) => {
    if (!used[j]) removedLater.push(j);
  });
  for (const j of removedLater) out.push({ status: 'removed', label: label(before[j] as T) });
  return out;
}

const indexKey = (ix: Index) =>
  ix.name ?? ix.columns.map((c) => `${c.kind}:${c.value}`).join('\u0000');
const checkKey = (c: Check) => c.name ?? c.expression;

function columnSignature(t: Table): string {
  return JSON.stringify(sortedStrings(t.columns.map((c) => `${c.name}\u0000${c.type}`)));
}

/** Rewrites a ref id's table ids through `rename` (before id → after id). */
function remapRefId(id: string, rename: ReadonlyMap<string, string>): string {
  if (rename.size === 0) return id;
  const parsed = parseRefId(id);
  if (!parsed) return id;
  const from = rename.get(parsed.from.tableId);
  const to = rename.get(parsed.to.tableId);
  if (from === undefined && to === undefined) return id;
  return refIdOf(
    { tableId: from ?? parsed.from.tableId, columns: parsed.from.columns },
    parsed.relation,
    { tableId: to ?? parsed.to.tableId, columns: parsed.to.columns },
    parsed.n,
  );
}

const TABLE_FIELDS: ReadonlyArray<[string, (t: Table) => unknown]> = [
  ['note', (t) => t.note],
  ['headerColor', (t) => t.headerColor],
  ['alias', (t) => t.alias],
  ['group', (t) => t.groupId],
];

const REF_FIELDS: ReadonlyArray<[string, (r: Ref) => unknown]> = [
  ['relation', (r) => r.relation],
  ['name', (r) => r.name],
  ['onDelete', (r) => r.onDelete],
  ['onUpdate', (r) => r.onUpdate],
  ['color', (r) => r.color],
  ['inactive', (r) => r.inactive],
  ['note', (r) => r.note],
];

function diffTable(before: Table, after: Table): TableDiff {
  const changes: FieldChange[] = [];
  if (before.id !== after.id) {
    if (before.schema !== after.schema)
      changes.push({ field: 'schema', before: before.schema, after: after.schema });
    if (before.name !== after.name)
      changes.push({ field: 'name', before: before.name, after: after.name });
  }
  changes.push(...compareFields(before, after, TABLE_FIELDS));

  const beforeCols = byId(before.columns, (c) => c.name);
  const afterCols = byId(after.columns, (c) => c.name);
  const columns: ColumnDiff[] = [];
  for (const c of after.columns) {
    const old = beforeCols.get(c.name);
    if (!old) columns.push({ name: c.name, status: 'added', changes: [] });
    else {
      const ch = compareFields(old, c, COLUMN_FIELDS);
      if (ch.length > 0) columns.push({ name: c.name, status: 'changed', changes: ch });
    }
  }
  for (const c of before.columns) {
    if (!afterCols.has(c.name)) columns.push({ name: c.name, status: 'removed', changes: [] });
  }

  const diff: TableDiff = {
    id: after.id,
    status: 'changed',
    changes,
    columns,
    indexes: diffKeyed(before.indexes, after.indexes, indexKey, indexLabel),
    checks: diffKeyed(before.checks, after.checks, checkKey, checkLabel),
  };
  if (before.id !== after.id) diff.renamedFrom = before.id;
  return diff;
}

const tableChanged = (d: TableDiff) =>
  d.renamedFrom !== undefined ||
  d.changes.length + d.columns.length + d.indexes.length + d.checks.length > 0;

/** Pairs removed and added tables with identical column (name, type) lists; before id → after id. */
function detectRenames(before: DiagramModel, after: DiagramModel): Map<string, string> {
  const beforeIds = new Set(before.tables.map((t) => t.id));
  const afterIds = new Set(after.tables.map((t) => t.id));
  const removed = before.tables.filter((t) => !afterIds.has(t.id));
  const used = removed.map(() => false);
  const rename = new Map<string, string>();
  for (const t of after.tables) {
    if (beforeIds.has(t.id)) continue;
    const sig = columnSignature(t);
    const i = removed.findIndex((r, j) => !used[j] && columnSignature(r) === sig);
    if (i < 0) continue;
    used[i] = true;
    rename.set((removed[i] as Table).id, t.id);
  }
  return rename;
}

// ---------------------------------------------------------------------------------------------
// diffModels

/**
 * Compares two models entry by entry (tables, columns, indexes, checks, refs, enums, groups,
 * notes, views, project settings), pairing renamed tables when their columns are identical.
 *
 * @param before - The older model.
 * @param after - The newer model; ids in the result refer to it, except for removed entries.
 * @example
 * ```ts
 * import { compileDbml, diffModels } from '@relvista/core';
 *
 * const before = compileDbml('Table users { id int [pk] }').model!;
 * const after = compileDbml('Table users { id int [pk]\n  email varchar }').model!;
 * const diff = diffModels(before, after);
 * diff.tables[0]; // { id: 'public.users', status: 'changed', columns: [{ name: 'email', status: 'added', ... }], ... }
 * diff.summary; // { added: 0, removed: 0, changed: 1 }
 * ```
 */
export function diffModels(
  before: DiagramModel,
  after: DiagramModel,
  options: DiffOptions = {},
): ModelDiff {
  const rename =
    (options.detectRenames ?? true) ? detectRenames(before, after) : new Map<string, string>();
  const renamedTo = new Map<string, string>();
  for (const t of before.tables) {
    const to = rename.get(t.id);
    if (to !== undefined) renamedTo.set(to, t.id);
  }
  const mapTable = (id: string) => rename.get(id) ?? id;

  // Tables
  const beforeTables = byId(before.tables, (t) => t.id);
  const afterTables = byId(after.tables, (t) => t.id);
  const tables: TableDiff[] = [];
  for (const t of after.tables) {
    const oldId = renamedTo.get(t.id) ?? t.id;
    const old = beforeTables.get(oldId);
    if (!old) {
      tables.push({ id: t.id, status: 'added', changes: [], columns: [], indexes: [], checks: [] });
      continue;
    }
    const d = diffTable(old, t);
    if (tableChanged(d)) tables.push(d);
  }
  for (const t of before.tables) {
    if (!afterTables.has(t.id) && !rename.has(t.id)) {
      tables.push({
        id: t.id,
        status: 'removed',
        changes: [],
        columns: [],
        indexes: [],
        checks: [],
      });
    }
  }

  // Refs (before ids rewritten through renames)
  const beforeRefs = byId(before.refs, (r) => remapRefId(r.id, rename));
  const afterRefs = byId(after.refs, (r) => r.id);
  const refs: ModelDiff['refs'] = [];
  for (const r of after.refs) {
    const old = beforeRefs.get(r.id);
    if (!old) refs.push({ id: r.id, status: 'added', changes: [] });
    else {
      const changes = compareFields(old, r, REF_FIELDS);
      if (changes.length > 0) refs.push({ id: r.id, status: 'changed', changes });
    }
  }
  for (const r of before.refs) {
    if (!afterRefs.has(remapRefId(r.id, rename)))
      refs.push({ id: r.id, status: 'removed', changes: [] });
  }

  // Enums
  const beforeEnums = byId(before.enums, (e) => e.id);
  const afterEnums = byId(after.enums, (e) => e.id);
  const enums: ModelDiff['enums'] = [];
  for (const e of after.enums) {
    const old = beforeEnums.get(e.id);
    if (!old) {
      enums.push({ id: e.id, status: 'added', values: [] });
      continue;
    }
    const oldValues = byId(old.values, (v) => v.name);
    const newValues = byId(e.values, (v) => v.name);
    const values: { name: string; status: ChangeStatus }[] = [];
    for (const v of e.values) {
      const ov = oldValues.get(v.name);
      if (!ov) values.push({ name: v.name, status: 'added' });
      else if (ov.note !== v.note) values.push({ name: v.name, status: 'changed' });
    }
    for (const v of old.values)
      if (!newValues.has(v.name)) values.push({ name: v.name, status: 'removed' });
    if (values.length > 0) enums.push({ id: e.id, status: 'changed', values });
  }
  for (const e of before.enums)
    if (!afterEnums.has(e.id)) enums.push({ id: e.id, status: 'removed', values: [] });

  // Groups
  const groups: ModelDiff['groups'] = diffSimple(before.groups, after.groups, (g) => g.id, [
    ['color', (g) => g.color],
    ['note', (g) => g.note],
    ['tables', (g) => g.tableIds],
  ]);
  // Membership compares through renames and ignores order.
  for (const g of groups) {
    if (g.status !== 'changed') continue;
    g.changes = g.changes.filter((c) => {
      if (c.field !== 'tables') return true;
      const b = sortedStrings((c.before as string[]).map(mapTable));
      const a = sortedStrings(c.after as string[]);
      return !same(a, b);
    });
  }

  // Notes
  const notes = diffSimple(before.stickyNotes, after.stickyNotes, (n) => n.id, [
    ['content', (n) => n.content],
    ['color', (n) => n.color],
  ]);

  // Views
  const beforeViews = byId(before.views, (v) => v.name);
  const afterViews = byId(after.views, (v) => v.name);
  const views: ModelDiff['views'] = [];
  for (const v of after.views) {
    const old = beforeViews.get(v.name);
    if (!old) views.push({ name: v.name, status: 'added' });
    else {
      const changed =
        !same(sortedStrings(old.tableIds.map(mapTable)), sortedStrings(v.tableIds)) ||
        !same(sortedStrings(old.noteIds), sortedStrings(v.noteIds)) ||
        !same(sortedStrings(old.groupIds), sortedStrings(v.groupIds));
      if (changed) views.push({ name: v.name, status: 'changed' });
    }
  }
  for (const v of before.views)
    if (!afterViews.has(v.name)) views.push({ name: v.name, status: 'removed' });

  // Project
  const project = diffProject(before, after);

  const result: ModelDiff = {
    tables,
    refs,
    enums,
    groups: groups.filter((g) => g.status !== 'changed' || g.changes.length > 0),
    notes,
    views,
    project,
    summary: { added: 0, removed: 0, changed: 0 },
    empty: true,
  };
  for (const list of [
    result.tables,
    result.refs,
    result.enums,
    result.groups,
    result.notes,
    result.views,
  ]) {
    for (const entry of list) result.summary[entry.status]++;
  }
  if (project.length > 0) result.summary.changed++;
  result.empty = result.summary.added + result.summary.removed + result.summary.changed === 0;
  return result;
}

function diffSimple<T>(
  before: readonly T[],
  after: readonly T[],
  key: (x: T) => string,
  fields: ReadonlyArray<[string, (x: T) => unknown]>,
): { id: string; status: ChangeStatus; changes: FieldChange[] }[] {
  const b = byId(before, key);
  const a = byId(after, key);
  const out: { id: string; status: ChangeStatus; changes: FieldChange[] }[] = [];
  for (const x of after) {
    const old = b.get(key(x));
    if (!old) out.push({ id: key(x), status: 'added', changes: [] });
    else {
      const changes = compareFields(old, x, fields);
      if (changes.length > 0) out.push({ id: key(x), status: 'changed', changes });
    }
  }
  for (const x of before)
    if (!a.has(key(x))) out.push({ id: key(x), status: 'removed', changes: [] });
  return out;
}

function diffProject(before: DiagramModel, after: DiagramModel): FieldChange[] {
  const b = before.project;
  const a = after.project;
  const changes: FieldChange[] = [];
  const push = (field: string, x: unknown, y: unknown) => {
    if (!same(x, y)) changes.push({ field, before: x, after: y });
  };
  push('name', b?.name ?? null, a?.name ?? null);
  push('note', b?.note ?? null, a?.note ?? null);
  push('databaseType', b?.databaseType ?? null, a?.databaseType ?? null);
  const bs = b?.settings ?? {};
  const as = a?.settings ?? {};
  const keys = [...Object.keys(as), ...Object.keys(bs).filter((k) => !(k in as))];
  for (const k of keys) push(`settings.${k}`, bs[k] ?? null, as[k] ?? null);
  return changes;
}

// ---------------------------------------------------------------------------------------------
// mergeForDiff

const beforeSpan = (span: SourceSpan): SourceSpan => ({ ...span, file: `before:${span.file}` });

/**
 * One model to draw: `after` plus everything `before` had that `after` lacks (removed tables at
 * the end of `tables`, removed columns re-inserted after their former predecessor, removed refs,
 * enums, groups, notes). Spans of re-inserted elements point into `before` (`span.file` is
 * prefixed with `before:` so nothing reveals them in the editor's files).
 *
 * Removed refs keep their `before` id; endpoints on a renamed table point at its new id.
 * Re-inserted columns keep their `isFk` flag from `before`. Views, records and the project come
 * from `after`.
 */
export function mergeForDiff(
  before: DiagramModel,
  after: DiagramModel,
  diff: ModelDiff,
): DiagramModel {
  const rename = new Map<string, string>();
  for (const t of diff.tables) if (t.renamedFrom !== undefined) rename.set(t.renamedFrom, t.id);
  const mapTable = (id: string) => rename.get(id) ?? id;
  const beforeTables = byId(before.tables, (t) => t.id);

  const removedColumns = new Map<string, string[]>();
  for (const t of diff.tables) {
    if (t.status !== 'changed') continue;
    const names = t.columns.filter((c) => c.status === 'removed').map((c) => c.name);
    if (names.length > 0) removedColumns.set(t.id, names);
  }

  const tables: Table[] = after.tables.map((t) => {
    const names = removedColumns.get(t.id);
    if (!names) return t;
    const old = beforeTables.get(diffTableOrigin(diff, t.id));
    if (!old) return t;
    const columns = [...t.columns];
    for (const name of names) {
      const at = old.columns.findIndex((c) => c.name === name);
      const removed = old.columns[at] as Column;
      // Insert after the nearest former predecessor that is present, else first.
      let insertAt = 0;
      for (let p = at - 1; p >= 0; p--) {
        const predName = (old.columns[p] as Column).name;
        const k = columns.findIndex((c) => c.name === predName);
        if (k >= 0) {
          insertAt = k + 1;
          break;
        }
      }
      columns.splice(insertAt, 0, { ...removed, span: beforeSpan(removed.span) });
    }
    return { ...t, columns };
  });
  for (const d of diff.tables) {
    if (d.status !== 'removed') continue;
    const t = beforeTables.get(d.id);
    if (!t) continue;
    tables.push({
      ...t,
      span: beforeSpan(t.span),
      columns: t.columns.map((c) => ({ ...c, span: beforeSpan(c.span) })),
    });
  }

  const pick = <T>(items: readonly T[], key: (x: T) => string, ids: readonly string[]) => {
    const map = byId(items, key);
    return ids.map((id) => map.get(id)).filter((x): x is T => x !== undefined);
  };
  const removedIds = (list: readonly { id: string; status: ChangeStatus }[]) =>
    list.filter((x) => x.status === 'removed').map((x) => x.id);

  const refs: Ref[] = [
    ...after.refs,
    ...pick(before.refs, (r) => r.id, removedIds(diff.refs)).map((r) => ({
      ...r,
      from: { ...r.from, tableId: mapTable(r.from.tableId) },
      to: { ...r.to, tableId: mapTable(r.to.tableId) },
      span: beforeSpan(r.span),
    })),
  ];
  const enums = [
    ...after.enums,
    ...pick(before.enums, (e) => e.id, removedIds(diff.enums)).map((e) => ({
      ...e,
      span: beforeSpan(e.span),
    })),
  ];
  const groups = [
    ...after.groups,
    ...pick(before.groups, (g) => g.id, removedIds(diff.groups)).map((g) => ({
      ...g,
      tableIds: g.tableIds.map(mapTable),
      span: beforeSpan(g.span),
    })),
  ];
  const stickyNotes = [
    ...after.stickyNotes,
    ...pick(before.stickyNotes, (n) => n.id, removedIds(diff.notes)).map((n) => ({
      ...n,
      span: beforeSpan(n.span),
    })),
  ];
  return { ...after, tables, refs, enums, groups, stickyNotes };
}

function diffTableOrigin(diff: ModelDiff, afterId: string): string {
  return (
    diff.tables.find((t) => t.id === afterId && t.status === 'changed')?.renamedFrom ?? afterId
  );
}

// ---------------------------------------------------------------------------------------------
// formatDiff

const SIGN: Record<ChangeStatus, string> = { added: '+', removed: '-', changed: '~' };

/** `name` for ids in the default schema, `schema.name` otherwise (segments as encoded). */
function shortId(id: string): string {
  const prefix = `${DEFAULT_SCHEMA_NAME}.`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

function refLabel(id: string): string {
  const parsed = parseRefId(id);
  if (!parsed) return id;
  const ep = (e: { tableId: string; columns: string[] }) =>
    `${shortId(e.tableId)}.${e.columns.length === 1 ? e.columns[0] : `(${e.columns.join(', ')})`}`;
  return `${ep(parsed.from)} ${parsed.relation} ${ep(parsed.to)}${parsed.n > 1 ? ` #${parsed.n}` : ''}`;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string') return v === '' ? "''" : v.replace(/\n/g, '\\n');
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`;
  if (typeof v === 'object' && 'kind' in v && 'value' in v) {
    const d = v as ColumnDefault;
    if (d.kind === 'string') return `'${String(d.value)}'`;
    if (d.kind === 'expression') return `\`${String(d.value)}\``;
    return String(d.value);
  }
  return JSON.stringify(v);
}

const shownValue = (field: string, v: unknown) =>
  field === 'group' && typeof v === 'string' && v.startsWith('group:') ? v.slice(6) : v;

const change = (c: FieldChange) =>
  `${formatValue(shownValue(c.field, c.before))} → ${formatValue(shownValue(c.field, c.after))}`;

/** Plain-text / Markdown summary ("+ table billing.invoices", "~ users.email: varchar → text"). */
export function formatDiff(diff: ModelDiff, options: { markdown?: boolean } = {}): string {
  const lines: string[] = [];
  for (const t of diff.tables) {
    const name = shortId(t.id);
    if (t.status !== 'changed') {
      lines.push(`${SIGN[t.status]} table ${name}`);
      continue;
    }
    if (t.renamedFrom !== undefined) lines.push(`~ table ${shortId(t.renamedFrom)} → ${name}`);
    for (const c of t.changes) {
      if (t.renamedFrom !== undefined && (c.field === 'name' || c.field === 'schema')) continue;
      lines.push(`~ ${name} (${c.field}): ${change(c)}`);
    }
    for (const col of t.columns) {
      if (col.status !== 'changed') {
        lines.push(`${SIGN[col.status]} column ${name}.${col.name}`);
        continue;
      }
      for (const c of col.changes) {
        const field = c.field === 'type' ? '' : ` (${c.field})`;
        lines.push(`~ ${name}.${col.name}${field}: ${change(c)}`);
      }
    }
    for (const ix of t.indexes) lines.push(`${SIGN[ix.status]} index ${name} ${ix.label}`);
    for (const ck of t.checks) lines.push(`${SIGN[ck.status]} check ${name} ${ck.label}`);
  }
  for (const r of diff.refs) {
    if (r.status !== 'changed') lines.push(`${SIGN[r.status]} ref ${refLabel(r.id)}`);
    else
      for (const c of r.changes) lines.push(`~ ref ${refLabel(r.id)} (${c.field}): ${change(c)}`);
  }
  for (const e of diff.enums) {
    const name = shortId(e.id);
    if (e.status !== 'changed') lines.push(`${SIGN[e.status]} enum ${name}`);
    else for (const v of e.values) lines.push(`${SIGN[v.status]} enum value ${name}.${v.name}`);
  }
  const named = (kind: string, prefix: string, list: ModelDiff['groups']) => {
    for (const g of list) {
      const name = g.id.startsWith(prefix) ? g.id.slice(prefix.length) : g.id;
      if (g.status !== 'changed') lines.push(`${SIGN[g.status]} ${kind} ${name}`);
      else for (const c of g.changes) lines.push(`~ ${kind} ${name} (${c.field}): ${change(c)}`);
    }
  };
  named('group', 'group:', diff.groups);
  named('note', 'note:', diff.notes);
  for (const v of diff.views) lines.push(`${SIGN[v.status]} view ${v.name}`);
  for (const c of diff.project) lines.push(`~ project (${c.field}): ${change(c)}`);

  const { added, removed, changed } = diff.summary;
  const summary = diff.empty
    ? 'No changes'
    : `${added} added, ${removed} removed, ${changed} changed`;
  if (!options.markdown) return [summary, ...lines].join('\n');
  if (diff.empty) return `**${summary}**`;
  return [`**${summary}**`, '', '```diff', ...lines, '```'].join('\n');
}
