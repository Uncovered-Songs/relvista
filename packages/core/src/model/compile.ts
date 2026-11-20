import {
  Compiler,
  Filepath,
  MemoryProjectLayout,
  getMultiplicities,
  getRelationshipOp,
  isEndpointManySide,
  isEndpointOptional,
} from '@dbml/parse';
import type {
  CompileError,
  CompileWarning,
  Database,
  Column as ParserColumn,
  Ref as ParserRef,
  RefEndpoint as ParserRefEndpoint,
  RelationCardinality,
  TokenPosition,
} from '@dbml/parse';
import { DEFAULT_SCHEMA_NAME, idSegment, refIdOf, tableIdOf } from '../ids.js';
import { colorOrNull, expandPartials } from './partials.js';
import { SourceMap, toAbsolute } from './source.js';
import type {
  Column,
  CompileInput,
  CompileResult,
  Diagnostic,
  DiagramModel,
  Enum,
  ProjectInfo,
  Ref,
  RefEndpoint,
  SourceSpan,
  StickyNote,
  Table,
  TableGroup,
} from './types.js';
import { resolveView, viewTableEntries, type ViewTableEntry } from './views.js';

export { DEFAULT_SCHEMA_NAME, tableIdOf };
/** File key used when `compileDbml` is given a plain string. */
export const DEFAULT_FILE = 'main.dbml';

const PROJECT_RESERVED_KEYS = new Set([
  'name',
  'note',
  'token',
  'tables',
  'refs',
  'enums',
  'tableGroups',
  'tablePartials',
  'records',
  'metadata',
  'database_type',
]);

/**
 * Parses DBML (one string, or several files linked with `use` / `reuse`) into a `DiagramModel`.
 * Never throws: every problem, including unexpected parser exceptions, becomes a diagnostic.
 */
export function compileDbml(input: CompileInput): CompileResult {
  const sources = new SourceMap();
  const diagnostics: Diagnostic[] = [];
  const files = typeof input === 'string' ? { [DEFAULT_FILE]: input } : input.files;
  const entryKey = typeof input === 'string' ? DEFAULT_FILE : input.entry;

  try {
    const at = { line: 1, column: 1, offset: 0 };
    for (const [key, text] of Object.entries(files)) {
      const clash = sources.add(key, text);
      if (clash !== null) {
        diagnostics.push({
          severity: 'error',
          message: `Input files '${clash}' and '${key}' resolve to the same path '${toAbsolute(key)}'`,
          file: key,
          start: at,
          end: at,
        });
      }
    }
    if (diagnostics.length > 0) return { model: null, diagnostics };
    const entryAbs = toAbsolute(entryKey);
    if (!(entryKey in files)) {
      return {
        model: null,
        diagnostics: [
          {
            severity: 'error',
            message: `Entry file '${entryKey}' is not in the input files`,
            file: entryKey,
            start: at,
            end: at,
          },
        ],
      };
    }

    const compiler = new Compiler(new MemoryProjectLayout(sources.parserFiles()));
    const entry = Filepath.from(entryAbs);
    const report = compiler.interpretFile(entry);

    const seen = new Set<string>();
    const pushDiagnostic = (severity: 'error' | 'warning', d: CompileError | CompileWarning) => {
      const abs = d.filepath.absolute;
      const key = `${severity}|${d.code}|${abs}|${d.start}|${d.end}|${d.diagnostic}`;
      if (seen.has(key)) return;
      seen.add(key);
      diagnostics.push({
        severity,
        message: d.diagnostic,
        code: d.code,
        ...sources.span(abs, d.start, d.end),
      });
    };
    for (const e of report.getErrors()) pushDiagnostic('error', e);
    for (const w of report.getWarnings()) pushDiagnostic('warning', w);

    const db = report.getValue();
    if (!db) return { model: null, diagnostics };

    const reachable = compiler.reachableFiles(entry).map((f) => sources.keyOf(f.absolute));
    const viewEntries = db.diagramViews.map((v) => viewTableEntries(compiler, v));
    const model = buildModel(db, sources, entryKey, reachable, viewEntries, diagnostics);
    return { model, diagnostics };
  } catch (err) {
    const at = { line: 1, column: 1, offset: 0 };
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push({
      severity: 'error',
      message: `Internal parser error: ${message}`,
      file: entryKey,
      start: at,
      end: at,
    });
    return { model: null, diagnostics };
  }
}

function buildModel(
  db: Readonly<Database>,
  sources: SourceMap,
  entry: string,
  files: string[],
  viewEntries: (ViewTableEntry[] | undefined)[],
  diagnostics: Diagnostic[],
): DiagramModel {
  const spanOf = (token: TokenPosition): SourceSpan =>
    sources.span(token.filepath.absolute, token.start.offset, token.end.offset);

  // Table names as written (aliases, import aliases) → table id.
  const aliasToId = new Map<string, string>();
  for (const a of db.aliases)
    aliasToId.set(a.name, tableIdOf(a.value.schemaName, a.value.tableName));
  // Original name of an imported table → the name it is visible under here (`use { table x as y }`).
  const importedAs = new Map<string, string>();
  for (const ext of db.externals.tables) {
    const visible = ext.visibleNames[0];
    if (visible)
      importedAs.set(
        tableIdOf(ext.schemaName, ext.name),
        tableIdOf(visible.schemaName, visible.name),
      );
  }

  const enums: Enum[] = db.enums.map((e) => ({
    id: tableIdOf(e.schemaName, e.name),
    schema: e.schemaName || DEFAULT_SCHEMA_NAME,
    name: e.name,
    values: e.values.map((v) => ({ name: v.name, note: v.note?.value ?? null })),
    span: spanOf(e.token),
  }));
  const enumIds = new Set(enums.map((e) => e.id));
  // Enums imported under another name: `<declaring file>|<original id>` → visible id. Columns of
  // imported tables keep the original type name, so they resolve through this map.
  const enumImportedAs = new Map<string, string>();
  for (const ext of db.externals.enums) {
    const visible = ext.visibleNames[0];
    if (visible)
      enumImportedAs.set(
        `${ext.filepath.absolute}|${tableIdOf(ext.schemaName, ext.name)}`,
        tableIdOf(visible.schemaName, visible.name),
      );
  }

  const partialsByName = new Map(db.tablePartials.map((p) => [p.name, p]));
  const partialRefs: { ref: ParserRef; fromPartial: string }[] = [];

  const tables: Table[] = db.tables.map((t) => {
    const id = tableIdOf(t.schemaName, t.name);
    const expanded = expandPartials(t, (name) => partialsByName.get(name));
    const resolveEnum = (schema: string | null, name: string): string | null => {
      const id = tableIdOf(schema, name);
      const imported = enumImportedAs.get(`${t.token.filepath.absolute}|${id}`);
      if (imported !== undefined && enumIds.has(imported)) return imported;
      return enumIds.has(id) ? id : null;
    };
    const columns = expanded.fields.map(({ item, fromPartial }) => {
      if (fromPartial !== null) {
        for (const ir of item.inline_refs)
          partialRefs.push({ ref: partialInlineRef(t.schemaName, t.name, item, ir), fromPartial });
      }
      return toColumn(item, fromPartial, resolveEnum, spanOf);
    });
    return {
      id,
      schema: t.schemaName || DEFAULT_SCHEMA_NAME,
      name: t.name,
      alias: t.alias,
      note: expanded.note,
      headerColor: expanded.headerColor,
      columns,
      indexes: expanded.indexes.map(({ item, fromPartial }) => ({
        name: item.name ?? null,
        columns: item.columns.map((c) => ({
          value: c.value,
          kind: c.type === 'expression' ? ('expression' as const) : ('column' as const),
          ...(c.sortOrder ? { sortOrder: c.sortOrder } : {}),
        })),
        unique: item.unique ?? false,
        pk: item.pk ?? false,
        type: item.type ?? null,
        note: item.note?.value ?? null,
        fromPartial,
      })),
      checks: expanded.checks.map(({ item, fromPartial }) => ({
        name: item.name ?? null,
        expression: item.expression,
        fromPartial,
      })),
      groupId: null,
      partials: [...t.partials].sort((a, b) => a.order - b.order).map((p) => p.name),
      span: spanOf(t.token),
    };
  });
  const tablesById = new Map(tables.map((t) => [t.id, t]));
  const resolveTableId = (schema: string | null, name: string): string => {
    const id = tableIdOf(schema, name);
    if (tablesById.has(id)) return id;
    if (!schema) {
      const aliased = aliasToId.get(name);
      if (aliased) return aliased;
    }
    return importedAs.get(id) ?? id;
  };
  // A name as written in the source (not the parser's original declaration name).
  const resolveVisibleTableId = (schema: string | null, name: string): string | undefined => {
    const id = tableIdOf(schema, name);
    if (tablesById.has(id)) return id;
    if (!schema) return aliasToId.get(name);
    return undefined;
  };

  const refs = buildRefs(
    [...db.refs.map((ref) => ({ ref, fromPartial: null as string | null })), ...partialRefs],
    resolveTableId,
    spanOf,
    diagnostics,
  );
  for (const ref of refs) {
    const side = ref.fkSide === 'from' ? ref.from : ref.fkSide === 'to' ? ref.to : null;
    const table = side ? tablesById.get(side.tableId) : undefined;
    for (const col of table?.columns ?? []) if (side?.columns.includes(col.name)) col.isFk = true;
  }

  const groups: TableGroup[] = db.tableGroups.map((g) => {
    const id = `group:${g.name ?? ''}`;
    const tableIds = g.tables.map((f) => resolveTableId(f.schemaName, f.name));
    for (const tableId of tableIds) {
      const table = tablesById.get(tableId);
      if (table && table.groupId === null) table.groupId = id;
    }
    return {
      id,
      name: g.name ?? '',
      tableIds,
      color: colorOrNull(g.color),
      note: g.note?.value ?? null,
      span: spanOf(g.token),
    };
  });

  const stickyNotes: StickyNote[] = db.notes.map((n) => ({
    id: `note:${n.name}`,
    name: n.name,
    content: n.content,
    color: colorOrNull(n.color),
    span: spanOf(n.token),
  }));

  const views = db.diagramViews.map((v, i) =>
    resolveView(
      v,
      {
        tables,
        groups,
        stickyNotes,
        resolveTableId,
        resolveVisibleTableId,
        tableEntries: viewEntries[i],
      },
      spanOf(v.token),
    ),
  );

  const model: DiagramModel = { entry, files, tables, refs, enums, groups, stickyNotes, views };
  const project = toProject(db.project);
  if (project) model.project = project;
  if (db.records.length > 0) {
    const records: Record<string, number> = {};
    for (const r of db.records) {
      const id = resolveTableId(r.schemaName, r.tableName);
      records[id] = (records[id] ?? 0) + r.values.length;
    }
    model.records = records;
  }
  return model;
}

function toColumn(
  c: ParserColumn,
  fromPartial: string | null,
  resolveEnum: (schema: string | null, name: string) => string | null,
  spanOf: (token: TokenPosition) => SourceSpan,
): Column {
  return {
    name: c.name,
    type: c.type.schemaName ? `${c.type.schemaName}.${c.type.type_name}` : c.type.type_name,
    typeArgs: c.type.args,
    enumId: resolveEnum(c.type.schemaName, c.type.type_name),
    pk: c.pk ?? false,
    unique: c.unique ?? false,
    notNull: c.not_null ?? false,
    increment: c.increment ?? false,
    default: c.dbdefault ? { kind: c.dbdefault.type, value: c.dbdefault.value } : null,
    note: c.note?.value ?? null,
    checks: c.checks.map((k) => ({ name: k.name ?? null, expression: k.expression, fromPartial })),
    isFk: false,
    fromPartial,
    span: spanOf(c.token),
  };
}

/**
 * `@dbml/parse` lifts inline refs of a table's own columns into `refs`, but not those of columns
 * injected from a TablePartial. Build them the same way the parser does for own columns: target
 * endpoint first, holding column second.
 */
function partialInlineRef(
  schemaName: string | null,
  tableName: string,
  column: ParserColumn,
  ir: ParserColumn['inline_refs'][number],
): ParserRef {
  const [holder, target] = getMultiplicities(ir.relation) ?? (['*', '*'] as RelationCardinality[]);
  return {
    schemaName: null,
    name: null,
    endpoints: [
      {
        schemaName: ir.schemaName,
        tableName: ir.tableName,
        fieldNames: ir.fieldNames,
        relation: target ?? '*',
        token: ir.token,
      },
      {
        schemaName,
        tableName,
        fieldNames: [column.name],
        relation: holder ?? '*',
        token: column.token,
      },
    ],
    token: ir.token,
  };
}

/** Order-independent key of a ref's endpoint pair, used to spot duplicate relationships. */
function endpointPairKey(from: RefEndpoint, to: RefEndpoint): string {
  const ep = (e: RefEndpoint) => `${e.tableId}(${[...e.columns].sort().map(idSegment).join(',')})`;
  return [ep(from), ep(to)].sort().join('|');
}

function buildRefs(
  input: { ref: ParserRef; fromPartial: string | null }[],
  resolveTableId: (schema: string | null, name: string) => string,
  spanOf: (token: TokenPosition) => SourceSpan,
  diagnostics: Diagnostic[],
): Ref[] {
  const used = new Map<string, number>();
  const pairs = new Set<string>();
  const out: Ref[] = [];
  for (const { ref, fromPartial } of input) {
    const [a, b] = ref.endpoints;
    const from = toEndpoint(a, resolveTableId);
    const to = toEndpoint(b, resolveTableId);
    const pair = endpointPairKey(from, to);
    if (fromPartial !== null && pairs.has(pair)) {
      // The parser rejects duplicate endpoints among its own refs; partial inline refs bypass it.
      diagnostics.push({
        severity: 'warning',
        message: `References with same endpoints exist: the inline ref from TablePartial '${fromPartial}' duplicates another ref and is ignored`,
        ...spanOf(ref.token),
      });
      continue;
    }
    pairs.add(pair);
    const relation = getRelationshipOp(a.relation, b.relation);
    const fkSide =
      from.cardinality === 'many' && to.cardinality === 'one'
        ? 'from'
        : to.cardinality === 'many' && from.cardinality === 'one'
          ? 'to'
          : from.cardinality === 'one'
            ? 'to'
            : null;
    const base = refIdOf(from, relation, to);
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    out.push({
      id: refIdOf(from, relation, to, n),
      name: ref.name ?? null, // inline refs come back without `name` despite the .d.ts
      from,
      to,
      relation,
      fkSide,
      onDelete: ref.onDelete ?? null,
      onUpdate: ref.onUpdate ?? null,
      color: colorOrNull(ref.color),
      inactive: ref.inactive ?? false,
      note: ref.note?.value ?? null,
      fromPartial,
      span: spanOf(ref.token),
    });
  }
  return out;
}

function toEndpoint(
  e: ParserRefEndpoint,
  resolveTableId: (schema: string | null, name: string) => string,
): RefEndpoint {
  return {
    tableId: resolveTableId(e.schemaName, e.tableName),
    columns: [...e.fieldNames],
    cardinality: isEndpointManySide(e.relation) ? 'many' : 'one',
    optional: isEndpointOptional(e.relation),
    raw: e.relation,
  };
}

function toProject(project: Database['project']): ProjectInfo | undefined {
  if (!project || !('token' in project)) return undefined;
  const settings: Record<string, string> = {};
  for (const [k, v] of Object.entries(project)) {
    if (!PROJECT_RESERVED_KEYS.has(k) && typeof v === 'string') settings[k] = v;
  }
  const databaseType = (project as Record<string, unknown>)['database_type'];
  return {
    name: project.name ?? null,
    note: project.note?.value ?? null,
    databaseType: typeof databaseType === 'string' ? databaseType : null,
    settings,
  };
}
