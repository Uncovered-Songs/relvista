import {
  BlockExpressionNode,
  ElementDeclarationNode,
  FunctionApplicationNode,
  WildcardNode,
  splitQualifiedIdentifier,
} from '@dbml/parse';
import type { Compiler, DiagramView as ParserDiagramView } from '@dbml/parse';
import type {
  DiagramModel,
  DiagramView,
  SourceSpan,
  StickyNote,
  Table,
  TableGroup,
} from './types.js';

export interface ViewContext {
  tables: Table[];
  groups: TableGroup[];
  stickyNotes: StickyNote[];
  /** Maps a table id as the parser names it in views to the id it has in the model (import aliases). */
  resolveTableId: (schema: string | null, name: string) => string;
  /** Maps a table name as written in the source to its model id, if one matches. */
  resolveVisibleTableId?: (schema: string | null, name: string) => string | undefined;
  /** The view's `Tables { ... }` entries as written, from `viewTableEntries`. */
  tableEntries?: ViewTableEntry[] | undefined;
}

/** A `Tables { ... }` entry of a DiagramView as written in the source. */
export interface ViewTableEntry {
  schema: string | null;
  name: string;
}

/**
 * Reads the `Tables { ... }` entries of a DiagramView from its syntax tree, as written.
 *
 * The parser reports view entries by the table's *original* declaration name, so a table imported
 * as `use { table users as busers }` comes back as `users`, which is ambiguous when the entry file
 * also declares a `users` table. The written name (`busers`) is not. Returns `undefined` when the
 * block cannot be found or an entry is not a plain (optionally schema-qualified) name.
 */
export function viewTableEntries(
  compiler: Compiler,
  view: ParserDiagramView,
): ViewTableEntry[] | undefined {
  const ast = compiler.parse.ast(view.token.filepath);
  const decl = ast.body.find(
    (n): n is ElementDeclarationNode =>
      n instanceof ElementDeclarationNode && n.start === view.token.start.offset,
  );
  if (!(decl?.body instanceof BlockExpressionNode)) return undefined;
  const entries: ViewTableEntry[] = [];
  for (const sub of decl.body.body) {
    if (!(sub instanceof ElementDeclarationNode)) continue;
    if (sub.type?.value.toLowerCase() !== 'tables') continue;
    if (!(sub.body instanceof BlockExpressionNode)) continue;
    for (const entry of sub.body.body) {
      if (!(entry instanceof FunctionApplicationNode) || !entry.callee) return undefined;
      if (entry.callee instanceof WildcardNode) continue;
      const parts = splitQualifiedIdentifier(
        ast.source.slice(entry.callee.start, entry.callee.end),
      );
      if (parts.length === 1) entries.push({ schema: null, name: parts[0] as string });
      else if (parts.length === 2)
        entries.push({ schema: parts[0] as string, name: parts[1] as string });
      else return undefined;
    }
  }
  return entries;
}

/**
 * Resolves the parser's tri-state `FilterConfig` (`null` = hide all, `[]` = show all, `[...]` = only
 * these) into concrete id lists.
 *
 * Tables, TableGroups and Schemas are one combined dimension: the parser sets the unmentioned ones
 * to `[]` as soon as one of them has items, so `[]` there means "contributes nothing". The visible
 * tables are the union of the listed tables, the members of the listed groups and the tables of
 * the listed schemas. When none has items and at least one is `[]` (`*`, `Tables { * }`,
 * `Schemas { * }`), every table is visible; when all are `null`, none is.
 */
export function resolveView(
  view: ParserDiagramView,
  ctx: ViewContext,
  span: SourceSpan,
): DiagramView {
  const { tables, tableGroups, schemas, stickyNotes } = view.visibleEntities;
  const dims = [tables, tableGroups, schemas];
  const anyItems = dims.some((d) => d !== null && d.length > 0);
  const allTables = !anyItems && dims.some((d) => d !== null && d.length === 0);

  let visible: Set<string>;
  const listedGroups = new Set<string>();
  if (allTables) {
    visible = new Set(ctx.tables.map((t) => t.id));
  } else {
    visible = new Set();
    const listed = tables ?? [];
    // Prefer the names as written (see `viewTableEntries`) when they line up with the parser's list.
    const written = ctx.tableEntries?.length === listed.length ? ctx.tableEntries : undefined;
    listed.forEach((t, i) => {
      const w = written?.[i];
      const id = w ? ctx.resolveVisibleTableId?.(w.schema, w.name) : undefined;
      visible.add(id ?? ctx.resolveTableId(t.schemaName, t.name));
    });
    for (const g of tableGroups ?? []) {
      const id = `group:${g.name}`;
      listedGroups.add(id);
      for (const tableId of ctx.groups.find((x) => x.id === id)?.tableIds ?? [])
        visible.add(tableId);
    }
    const schemaNames = new Set((schemas ?? []).map((s) => s.name));
    for (const t of ctx.tables) if (schemaNames.has(t.schema)) visible.add(t.id);
  }

  const allNotes = stickyNotes !== null && stickyNotes.length === 0;
  const listedNotes = new Set((stickyNotes ?? []).map((n) => `note:${n.name}`));

  return {
    name: view.name,
    tableIds: ctx.tables.filter((t) => visible.has(t.id)).map((t) => t.id),
    noteIds: ctx.stickyNotes.filter((n) => allNotes || listedNotes.has(n.id)).map((n) => n.id),
    groupIds: ctx.groups
      .filter(
        (g) => allTables || listedGroups.has(g.id) || g.tableIds.some((id) => visible.has(id)),
      )
      .map((g) => g.id),
    allTables,
    allNotes,
    span,
  };
}

/**
 * Returns the part of `model` that the named DiagramView shows: its tables, the refs whose both
 * endpoints are visible, its groups (with `tableIds` trimmed to visible tables), its sticky notes
 * and the records of visible tables. Enums and the view list are kept whole. Columns keep their
 * `isFk` flag from the full model. Returns `null` when no view has that name.
 */
export function selectView(model: DiagramModel, viewName: string): DiagramModel | null {
  const view = model.views.find((v) => v.name === viewName);
  if (!view) return null;
  const tableIds = new Set(view.tableIds);
  const groupIds = new Set(view.groupIds);
  const noteIds = new Set(view.noteIds);

  const groups = model.groups
    .filter((g) => groupIds.has(g.id))
    .map((g) => ({ ...g, tableIds: g.tableIds.filter((id) => tableIds.has(id)) }));

  const result: DiagramModel = {
    ...model,
    tables: model.tables.filter((t) => tableIds.has(t.id)),
    refs: model.refs.filter((r) => tableIds.has(r.from.tableId) && tableIds.has(r.to.tableId)),
    groups,
    stickyNotes: model.stickyNotes.filter((n) => noteIds.has(n.id)),
  };
  if (model.records) {
    result.records = Object.fromEntries(
      Object.entries(model.records).filter(([id]) => tableIds.has(id)),
    );
  }
  return result;
}
