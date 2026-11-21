/**
 * Snowflake DDL from the diagram model (design phase3 §6.3). Own generator: `@dbml/core` 12.1.0
 * has no Snowflake exporter. Runs on the main thread, no `@dbml/core` needed.
 *
 * - `CREATE SCHEMA IF NOT EXISTS` for every schema but `public` (Snowflake's default `PUBLIC`);
 *   tables in `public` are written unqualified.
 * - Identifiers are quoted only when needed (`quoteIdent`): not a plain identifier, or a keyword
 *   of Snowflake's grammar (then upper case, the name Snowflake gives the unquoted word).
 * - Types: `serial` → `NUMBER AUTOINCREMENT`, `[increment]` → `<type> AUTOINCREMENT`,
 *   `text` → `VARCHAR`, `timestamp` → `TIMESTAMP_NTZ`, `timestamptz` → `TIMESTAMP_TZ`,
 *   `json`/`jsonb` → `VARIANT`, `uuid` → `VARCHAR(36)`, arrays → `ARRAY`, enums → `VARCHAR` (the
 *   values in a comment: Snowflake has no enum type), numeric types as they are, unknown types
 *   passed through.
 * - `NOT NULL`, `DEFAULT`, `PRIMARY KEY`, `UNIQUE`; foreign keys as `ALTER TABLE … ADD FOREIGN
 *   KEY` after all tables (Snowflake records PRIMARY KEY / UNIQUE / FOREIGN KEY but does not
 *   enforce them: the header says so). Indexes other than PK / unique and CHECK constraints are
 *   comments (Snowflake has neither). `COMMENT ON TABLE / COLUMN` from notes.
 */
import type { Column, DiagramModel, Enum, Index, Ref, Table } from '@relvista/core';
import { SNOWFLAKE_KEYWORDS } from './snowflakeKeywords.js';

/**
 * A plain identifier (`[A-Za-z_][A-Za-z0-9_$]*`) is written as is, unless it is a keyword: then
 * quoted in upper case, which names the same object as the unquoted word would (Snowflake folds
 * unquoted identifiers to upper case): `users` → `users`, `order` → `"ORDER"`. Anything else is
 * quoted exactly: `my col` → `"my col"`.
 */
export function quoteIdent(name: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_$]*$/.test(name)) {
    const upper = name.toUpperCase();
    return SNOWFLAKE_KEYWORDS.has(upper) ? `"${upper}"` : name;
  }
  return `"${name.replaceAll('"', '""')}"`;
}

/** `public.users` → `users`; `core.users` → `core.users` (each part quoted as needed). */
export function tableName(schema: string, name: string): string {
  return schema === 'public' ? quoteIdent(name) : `${quoteIdent(schema)}.${quoteIdent(name)}`;
}

function sqlString(text: string): string {
  return `'${text.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
}

/** One-line comment text (line breaks folded). */
function commentText(text: string): string {
  return text.replace(/\s*\r?\n\s*/g, ' ').trim();
}

const SERIAL = new Set(['serial', 'serial4', 'bigserial', 'serial8', 'smallserial', 'serial2']);

/** Maps a DBML column type to Snowflake (`enum` columns become `VARCHAR`), AUTOINCREMENT included. */
export function snowflakeType(column: Pick<Column, 'type' | 'enumId' | 'increment'>): string {
  if (column.enumId) return 'VARCHAR';
  const raw = column.type.trim();
  const lower = raw.toLowerCase();
  if (SERIAL.has(lower)) return 'NUMBER AUTOINCREMENT';
  let base: string;
  if (/\[\s*\]$/.test(lower)) base = 'ARRAY';
  else {
    const m = /^([a-z_][a-z0-9_ ]*?)\s*(\(([^)]*)\))?$/.exec(lower);
    const name = m?.[1]?.replace(/\s+/g, ' ') ?? '';
    const args = m?.[3] !== undefined ? `(${m[3].replace(/\s+/g, '')})` : '';
    switch (name) {
      case 'text':
      case 'tinytext':
      case 'mediumtext':
      case 'longtext':
      case 'string':
      case 'citext':
      case 'inet':
      case 'cidr':
      case 'macaddr':
      case 'xml':
        base = 'VARCHAR';
        break;
      case 'varchar':
      case 'character varying':
      case 'nvarchar':
      case 'varchar2':
      case 'nvarchar2':
        base = `VARCHAR${args}`;
        break;
      case 'char':
      case 'character':
      case 'nchar':
      case 'bpchar':
        base = `CHAR${args}`;
        break;
      case 'uuid':
        base = 'VARCHAR(36)';
        break;
      case 'json':
      case 'jsonb':
        base = 'VARIANT';
        break;
      case 'timestamp':
      case 'datetime':
      case 'datetime2':
      case 'timestamp without time zone':
      case 'smalldatetime':
        base = `TIMESTAMP_NTZ${args}`;
        break;
      case 'timestamptz':
      case 'timestamp with time zone':
      case 'datetimeoffset':
        base = `TIMESTAMP_TZ${args}`;
        break;
      case 'time':
      case 'timetz':
      case 'time without time zone':
      case 'time with time zone':
        base = `TIME${args}`;
        break;
      case 'date':
        base = 'DATE';
        break;
      case 'bool':
      case 'boolean':
      case 'bit':
        base = 'BOOLEAN';
        break;
      case 'int':
      case 'int4':
      case 'integer':
      case 'mediumint':
        base = 'INTEGER';
        break;
      case 'int2':
      case 'smallint':
        base = 'SMALLINT';
        break;
      case 'tinyint':
        base = 'TINYINT';
        break;
      case 'int8':
      case 'bigint':
      case 'bigint unsigned':
      case 'int unsigned':
      case 'integer unsigned':
        base = name.startsWith('big') ? 'BIGINT' : 'INTEGER';
        break;
      case 'float4':
      case 'real':
        base = 'REAL';
        break;
      case 'float8':
      case 'double':
      case 'double precision':
        base = 'DOUBLE';
        break;
      case 'float':
        base = `FLOAT${args}`;
        break;
      case 'decimal':
      case 'numeric':
      case 'number':
        base = `${name.toUpperCase()}${args}`;
        break;
      case 'money':
        base = 'NUMBER(19,4)';
        break;
      case 'bytea':
      case 'blob':
      case 'binary':
      case 'varbinary':
        base = `BINARY${args}`;
        break;
      default:
        base = raw; // unknown: as written
    }
  }
  return column.increment ? `${base} AUTOINCREMENT` : base;
}

function defaultSql(c: Column): string | null {
  const d = c.default;
  if (!d) return null;
  switch (d.kind) {
    case 'number':
      return String(d.value);
    case 'boolean': {
      const v = String(d.value).toLowerCase();
      return v === 'null' ? 'NULL' : v === 'true' ? 'TRUE' : 'FALSE';
    }
    case 'string':
      return sqlString(String(d.value));
    case 'expression': {
      const v = String(d.value).trim();
      if (/^now\(\s*\)$/i.test(v) || /^current_timestamp(\(\s*\))?$/i.test(v))
        return 'CURRENT_TIMESTAMP()';
      return v;
    }
  }
}

function indexColumns(i: Index): string {
  return i.columns.map((c) => (c.kind === 'column' ? quoteIdent(c.value) : c.value)).join(', ');
}

function enumComment(e: Enum): string {
  const name = e.schema === 'public' ? e.name : `${e.schema}.${e.name}`;
  return `-- Enum ${name}: ${e.values.map((v) => v.name).join(', ')} (columns of this type are VARCHAR)`;
}

function tableDdl(t: Table, model: DiagramModel): string[] {
  const name = tableName(t.schema, t.name);
  const lines: string[] = [];
  const pkCols = t.columns.filter((c) => c.pk);
  const pkIndex = t.indexes.find((i) => i.pk && i.columns.every((c) => c.kind === 'column'));
  const inlinePk = pkCols.length === 1 && !pkIndex;
  for (const c of t.columns) {
    const parts = [quoteIdent(c.name), snowflakeType(c)];
    const def = defaultSql(c);
    if (def !== null) parts.push(`DEFAULT ${def}`);
    if (c.notNull && !(c.pk && inlinePk)) parts.push('NOT NULL');
    if (c.pk && inlinePk) parts.push('PRIMARY KEY');
    if (c.unique && !c.pk) parts.push('UNIQUE');
    lines.push(`  ${parts.join(' ')}`);
  }
  if (pkIndex) lines.push(`  PRIMARY KEY (${indexColumns(pkIndex)})`);
  else if (pkCols.length > 1)
    lines.push(`  PRIMARY KEY (${pkCols.map((c) => quoteIdent(c.name)).join(', ')})`);
  for (const i of t.indexes) {
    if (i.pk || !i.unique || i.columns.some((c) => c.kind !== 'column')) continue;
    const constraint = i.name ? `CONSTRAINT ${quoteIdent(i.name)} ` : '';
    lines.push(`  ${constraint}UNIQUE (${indexColumns(i)})`);
  }
  const out: string[] = [];
  const enums = [...new Set(t.columns.map((c) => c.enumId).filter((id) => id !== null))];
  for (const id of enums) {
    const e = model.enums.find((x) => x.id === id);
    if (e) out.push(enumComment(e));
  }
  out.push(`CREATE TABLE ${name} (`, lines.join(',\n'), ');');
  // What Snowflake cannot hold: secondary indexes and CHECK constraints.
  for (const i of t.indexes) {
    if (i.pk || (i.unique && i.columns.every((c) => c.kind === 'column'))) continue;
    const label = [i.unique ? 'unique index' : 'index', i.name, i.type ? `using ${i.type}` : null]
      .filter(Boolean)
      .join(' ');
    out.push(`-- ${label} on ${name} (${indexColumns(i)}): Snowflake has no secondary indexes`);
  }
  const checks = [...t.checks, ...t.columns.flatMap((c) => c.checks)];
  for (const ch of checks)
    out.push(`-- check${ch.name ? ` ${ch.name}` : ''} on ${name}: ${commentText(ch.expression)}`);
  return out;
}

function fkDdl(r: Ref, model: DiagramModel): string[] {
  const byId = (id: string) => model.tables.find((t) => t.id === id);
  if (r.fkSide === null) {
    const a = byId(r.from.tableId);
    const b = byId(r.to.tableId);
    if (!a || !b) return [];
    return [
      `-- many-to-many: ${tableName(a.schema, a.name)} (${r.from.columns.join(', ')}) <> ${tableName(b.schema, b.name)} (${r.to.columns.join(', ')}); add a junction table to enforce it`,
    ];
  }
  const fk = r.fkSide === 'from' ? r.from : r.to;
  const pk = r.fkSide === 'from' ? r.to : r.from;
  const child = byId(fk.tableId);
  const parent = byId(pk.tableId);
  if (!child || !parent) return [];
  const cols = (cs: string[]) => cs.map(quoteIdent).join(', ');
  let stmt = `ALTER TABLE ${tableName(child.schema, child.name)} ADD `;
  if (r.name) stmt += `CONSTRAINT ${quoteIdent(r.name)} `;
  stmt += `FOREIGN KEY (${cols(fk.columns)}) REFERENCES ${tableName(parent.schema, parent.name)} (${cols(pk.columns)})`;
  if (r.onDelete) stmt += ` ON DELETE ${r.onDelete.toUpperCase()}`;
  if (r.onUpdate) stmt += ` ON UPDATE ${r.onUpdate.toUpperCase()}`;
  stmt += ';';
  return [r.inactive ? `-- inactive: ${stmt}` : stmt];
}

/** Snowflake DDL for every table, enum and ref of the model (all files of a workspace). */
export function exportSnowflake(model: DiagramModel, options: { title?: string } = {}): string {
  const out: string[] = [
    `-- ${options.title ?? model.project?.name ?? 'Schema'}: Snowflake DDL generated by relvista`,
    '-- Snowflake records PRIMARY KEY, UNIQUE and FOREIGN KEY constraints but does not enforce them',
    '-- (NOT NULL is enforced). It has no secondary indexes, CHECK constraints or enum types: those',
    '-- are kept below as comments.',
    '',
  ];
  const schemas = [...new Set(model.tables.map((t) => t.schema))].filter((s) => s !== 'public');
  for (const s of schemas) out.push(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(s)};`);
  if (schemas.length) out.push('');
  for (const t of model.tables) out.push(...tableDdl(t, model), '');
  const fks = model.refs.flatMap((r) => fkDdl(r, model));
  if (fks.length) out.push(...fks, '');
  const comments: string[] = [];
  for (const t of model.tables) {
    const name = tableName(t.schema, t.name);
    if (t.note) comments.push(`COMMENT ON TABLE ${name} IS ${sqlString(t.note)};`);
    for (const c of t.columns)
      if (c.note)
        comments.push(`COMMENT ON COLUMN ${name}.${quoteIdent(c.name)} IS ${sqlString(c.note)};`);
  }
  if (comments.length) out.push(...comments, '');
  return `${out.join('\n').replace(/\n+$/, '')}\n`;
}
