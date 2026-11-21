/**
 * Renderer-agnostic diagram model built from `@dbml/parse` output.
 *
 * Everything here is plain JSON-serialisable data (no parser classes), so it can cross a Web Worker
 * boundary, be snapshot-tested, and be consumed by any renderer.
 */

/**
 * A point in a source file. `line` and `column` are 1-based; `offset` is a 0-based UTF-16 index.
 * All three refer to the source string exactly as given, including a leading BOM (which the parser
 * never sees): `original[offset]` is the character at `line`/`column`.
 */
export interface SourcePosition {
  line: number;
  column: number;
  offset: number;
}

/** A range in one source file. `file` is the key the caller used in `compileDbml` input. */
export interface SourceSpan {
  file: string;
  start: SourcePosition;
  end: SourcePosition;
}

/** A parser or model error or warning, located in one source file. */
export interface Diagnostic extends SourceSpan {
  severity: 'error' | 'warning';
  message: string;
  /** `CompileErrorCode` from `@dbml/parse`, when the diagnostic came from the parser. */
  code?: number;
}

/** A multi-file DBML project: every file by name, plus the entry file. */
export interface CompileInputFiles {
  /**
   * File name → DBML source. Keys may be relative (`schema.dbml`) or absolute (`/db/schema.dbml`).
   * Two keys that name the same path (`main.dbml`, `./main.dbml`) are an error.
   */
  files: Record<string, string>;
  /** Key of the entry file in `files`. */
  entry: string;
}

/** What `compileDbml` accepts: one DBML string, or a multi-file project. */
export type CompileInput = string | CompileInputFiles;

/** What `compileDbml` returns: the model (when the source parsed) and every diagnostic. */
export interface CompileResult {
  /** `null` when the parser could not produce a database (most errors), or the entry file is missing. */
  model: DiagramModel | null;
  diagnostics: Diagnostic[];
}

/** The whole schema as plain data: tables, refs, enums, groups, sticky notes and views. */
export interface DiagramModel {
  /** Entry file key, as given in the input. */
  entry: string;
  /** Every file the entry reaches through `use` / `reuse`, entry first, as input keys. */
  files: string[];
  project?: ProjectInfo;
  tables: Table[];
  refs: Ref[];
  enums: Enum[];
  groups: TableGroup[];
  stickyNotes: StickyNote[];
  views: DiagramView[];
  /** Row count of the `Records` block per table id; tables without records are absent. */
  records?: Record<string, number>;
}

/** The `Project` block of the entry file. */
export interface ProjectInfo {
  name: string | null;
  note: string | null;
  /** The `database_type` setting. */
  databaseType: string | null;
  /** Every other string setting of the `Project` block (e.g. custom keys), verbatim. */
  settings: Record<string, string>;
}

/** A table, with its own columns and the columns of the TablePartials it injects. */
export interface Table {
  /**
   * `schema.table`, schema defaulting to `public`. A segment containing `.`, `"`, `\`, `:`, `,`,
   * `(` or `)`, or starting with `<`, `>`, `-` or `?`, is double-quoted (`a."b.c"`), see `tableIdOf`.
   */
  id: string;
  schema: string;
  name: string;
  alias: string | null;
  note: string | null;
  headerColor: string | null;
  columns: Column[];
  indexes: Index[];
  checks: Check[];
  /** `group:<name>` of the TableGroup that contains this table. */
  groupId: string | null;
  /** Names of the TablePartials injected (`~name`), in source order. Their content is already merged. */
  partials: string[];
  span: SourceSpan;
}

/** A column's `default:` value, with the kind of literal it was written as. */
export interface ColumnDefault {
  kind: 'number' | 'string' | 'boolean' | 'expression';
  value: string | number;
}

/** A table column with its type and constraints. */
export interface Column {
  name: string;
  /** Type as written, including arguments, e.g. `varchar(255)`, `s.mood` for a schema-qualified enum. */
  type: string;
  /** Arguments only, e.g. `255` or `10,2`. */
  typeArgs: string | null;
  /** Id of the enum this column's type refers to, when it resolves to one in the model. */
  enumId: string | null;
  pk: boolean;
  unique: boolean;
  notNull: boolean;
  increment: boolean;
  default: ColumnDefault | null;
  note: string | null;
  /** Column-level `check:` constraints. */
  checks: Check[];
  /** Computed: the column is on the referencing side of at least one ref (see `Ref`). */
  isFk: boolean;
  /** Name of the TablePartial this column was injected from, or `null` for an own column. */
  fromPartial: string | null;
  span: SourceSpan;
}

/** One column or expression of an index. */
export interface IndexColumn {
  /** Column name, or the expression text for an expression index. */
  value: string;
  kind: 'column' | 'expression';
  sortOrder?: 'desc';
}

/** An entry of a table's `indexes` block. */
export interface Index {
  name: string | null;
  columns: IndexColumn[];
  unique: boolean;
  pk: boolean;
  /** Index method, e.g. `btree`, `hash`. */
  type: string | null;
  note: string | null;
  fromPartial: string | null;
}

/** A `check` constraint (table-level, or column-level in `Column.checks`). */
export interface Check {
  name: string | null;
  expression: string;
  fromPartial: string | null;
}

/** How many rows one side of a ref can have. */
export type Cardinality = 'one' | 'many';

/** One side of a ref: the table, its columns and their cardinality. */
export interface RefEndpoint {
  tableId: string;
  columns: string[];
  cardinality: Cardinality;
  /** The endpoint is optional (`?` in the relation, i.e. min cardinality 0). */
  optional: boolean;
  /** Raw parser cardinality: `1`, `*`, `0..1`, `0..*`, ... */
  raw: string;
}

/**
 * A relationship between columns of two tables (`Ref`, inline `ref:`, or one from a TablePartial).
 */
export interface Ref {
  /**
   * Stable id derived from both endpoints and the op, also for named refs:
   * `ref:<fromTableId>(<cols>)<op><toTableId>(<cols>)`, plus `#<n>` only when several refs have the
   * same endpoints and op. See `refIdOf` / `parseRefId`.
   */
  id: string;
  name: string | null;
  /** Endpoint order as the parser returns it. For inline refs the parser puts the target first. */
  from: RefEndpoint;
  to: RefEndpoint;
  /** Relationship operator reconstructed from both cardinalities: `>`, `<`, `-`, `<>`, `?-`, ... */
  relation: string;
  /**
   * Which endpoint holds the foreign key: the `many` side; `to` for one-to-one (same rule as
   * `@dbml/core`'s SQL exporters); `null` for many-to-many.
   */
  fkSide: 'from' | 'to' | null;
  onDelete: string | null;
  onUpdate: string | null;
  color: string | null;
  inactive: boolean;
  note: string | null;
  /** Set when the ref was synthesised from an inline `ref:` inside a TablePartial. */
  fromPartial: string | null;
  span: SourceSpan;
}

/** One value of an enum. */
export interface EnumValue {
  name: string;
  note: string | null;
}

/** An `enum` declaration. */
export interface Enum {
  /** `schema.name`, schema defaulting to `public`, encoded like table ids. */
  id: string;
  schema: string;
  name: string;
  values: EnumValue[];
  span: SourceSpan;
}

/** A `TableGroup`: a named, optionally coloured set of tables drawn inside one box. */
export interface TableGroup {
  /** `group:<name>`. */
  id: string;
  name: string;
  tableIds: string[];
  color: string | null;
  note: string | null;
  span: SourceSpan;
}

/** A sticky note (top-level `Note name { ... }`) drawn on the diagram. */
export interface StickyNote {
  /** `note:<name>`. */
  id: string;
  name: string;
  content: string;
  color: string | null;
  span: SourceSpan;
}

/** A `DiagramView`: the tables, notes and groups one named view shows. */
export interface DiagramView {
  name: string;
  /** Visible tables, in model order, with `*`, `TableGroups` and `Schemas` already resolved. */
  tableIds: string[];
  noteIds: string[];
  /** Groups with at least one visible table, plus groups listed explicitly. */
  groupIds: string[];
  /** The view shows every table (`*`, `Tables { * }` or `Schemas { * }`). */
  allTables: boolean;
  /** The view shows every sticky note (`*` or `Notes { * }`). */
  allNotes: boolean;
  span: SourceSpan;
}
