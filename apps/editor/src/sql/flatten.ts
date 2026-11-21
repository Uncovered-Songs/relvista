/**
 * One single-file DBML document generated from a compiled model (design phase3 §6.3), so the
 * `@dbml/core` SQL exporters, which take one DBML text, can export multi-file workspaces: tables
 * (columns, settings, indexes, checks, notes), enums, refs and table groups, with every name
 * written by its model id (import aliases resolved). Sticky notes and views are left out (no SQL
 * for them), and so are `Records` blocks: the model keeps only their row counts, so a multi-file
 * export has no INSERT statements (the editor says so after the export). Single-file workspaces
 * keep exporting the entry text itself, records included.
 */
import { addDoubleQuoteIfNeeded } from '@dbml/parse';
import type {
  Check,
  Column,
  DiagramModel,
  Enum,
  Index,
  Ref,
  Table,
  TableGroup,
} from '@relvista/core';

const ident = (name: string): string => addDoubleQuoteIfNeeded(name);

const qualified = (schema: string, name: string): string =>
  schema === 'public' ? ident(name) : `${ident(schema)}.${ident(name)}`;

/** A single-quoted DBML string. */
function str(text: string): string {
  return `'${text.replaceAll('\\', '\\\\').replaceAll("'", "\\'").replaceAll('\n', '\\n')}'`;
}

/** A backtick expression (backticks inside cannot be escaped in DBML: replaced). */
const expr = (text: string): string => `\`${text.replaceAll('`', "'")}\``;

/** Column types: as written when DBML accepts them bare, else double-quoted. */
function typeText(c: Column, model: DiagramModel): string {
  if (c.enumId) {
    const e = model.enums.find((x) => x.id === c.enumId);
    if (e) return qualified(e.schema, e.name);
  }
  const t = c.type.trim();
  if (/^[A-Za-z_][\w]*(\.[A-Za-z_][\w]*)?(\([^()"']*\))?(\[\])*$/.test(t)) return t;
  return `"${t.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function defaultText(c: Column): string | null {
  const d = c.default;
  if (!d) return null;
  switch (d.kind) {
    case 'number':
      return String(d.value);
    case 'boolean':
      return String(d.value).toLowerCase();
    case 'string':
      return str(String(d.value));
    case 'expression':
      return expr(String(d.value));
  }
}

const settings = (items: Array<string | null | false>): string => {
  const list = items.filter((x): x is string => typeof x === 'string' && x !== '');
  return list.length ? ` [${list.join(', ')}]` : '';
};

const checkText = (ch: Check): string =>
  `${expr(ch.expression)}${settings([ch.name ? `name: ${str(ch.name)}` : null])}`;

function columnLine(c: Column, model: DiagramModel): string {
  const def = defaultText(c);
  return `  ${ident(c.name)} ${typeText(c, model)}${settings([
    c.pk ? 'pk' : null,
    c.increment ? 'increment' : null,
    c.notNull ? 'not null' : null,
    c.unique ? 'unique' : null,
    def !== null ? `default: ${def}` : null,
    ...c.checks.map((ch) => `check: ${expr(ch.expression)}`),
    c.note ? `note: ${str(c.note)}` : null,
  ])}`;
}

function indexLine(i: Index): string {
  const cols = i.columns.map(
    (c) =>
      (c.kind === 'expression' ? expr(c.value) : ident(c.value)) +
      (c.sortOrder ? ` [${c.sortOrder}]` : ''),
  );
  const sorted = i.columns.some((c) => c.sortOrder);
  const target = cols.length === 1 && !sorted ? cols[0]! : `(${cols.join(', ')})`;
  return `    ${target}${settings([
    i.pk ? 'pk' : null,
    i.unique && !i.pk ? 'unique' : null,
    i.name ? `name: ${str(i.name)}` : null,
    i.type ? `type: ${i.type}` : null,
    i.note ? `note: ${str(i.note)}` : null,
  ])}`;
}

function tableBlock(t: Table, model: DiagramModel): string {
  const lines = [
    `Table ${qualified(t.schema, t.name)}${settings([
      t.headerColor ? `headercolor: ${t.headerColor}` : null,
    ])} {`,
    ...t.columns.map((c) => columnLine(c, model)),
  ];
  if (t.indexes.length) lines.push('', '  indexes {', ...t.indexes.map(indexLine), '  }');
  if (t.checks.length)
    lines.push('', '  checks {', ...t.checks.map((ch) => `    ${checkText(ch)}`), '  }');
  if (t.note) lines.push('', `  Note: ${str(t.note)}`);
  lines.push('}');
  return lines.join('\n');
}

function enumBlock(e: Enum): string {
  return [
    `Enum ${qualified(e.schema, e.name)} {`,
    ...e.values.map(
      (v) => `  ${ident(v.name)}${settings([v.note ? `note: ${str(v.note)}` : null])}`,
    ),
    '}',
  ].join('\n');
}

function refLine(r: Ref, model: DiagramModel): string | null {
  const end = (tableId: string, cols: string[]) => {
    const t = model.tables.find((x) => x.id === tableId);
    if (!t) return null;
    const c = cols.map(ident);
    return `${qualified(t.schema, t.name)}.${c.length === 1 ? c[0] : `(${c.join(', ')})`}`;
  };
  const a = end(r.from.tableId, r.from.columns);
  const b = end(r.to.tableId, r.to.columns);
  if (!a || !b) return null;
  return `Ref${r.name ? ` ${ident(r.name)}` : ''}: ${a} ${r.relation} ${b}${settings([
    r.onDelete ? `delete: ${r.onDelete}` : null,
    r.onUpdate ? `update: ${r.onUpdate}` : null,
    r.color ? `color: ${r.color}` : null,
    r.inactive ? 'inactive' : null,
  ])}`;
}

function groupBlock(g: TableGroup, model: DiagramModel): string {
  const members = g.tableIds
    .map((id) => model.tables.find((t) => t.id === id))
    .filter((t): t is Table => t !== undefined)
    .map((t) => `  ${qualified(t.schema, t.name)}`);
  return [
    `TableGroup ${ident(g.name)}${settings([g.color ? `color: ${g.color}` : null])} {`,
    ...members,
    '}',
  ].join('\n');
}

/** Single-file DBML with the model's tables, enums, refs and groups. */
export function flattenModel(model: DiagramModel): string {
  const blocks: string[] = [];
  const p = model.project;
  if (p?.databaseType || p?.name) {
    blocks.push(
      [
        `Project ${ident(p.name ?? 'project')} {`,
        ...(p.databaseType ? [`  database_type: ${str(p.databaseType)}`] : []),
        '}',
      ].join('\n'),
    );
  }
  for (const e of model.enums) blocks.push(enumBlock(e));
  for (const t of model.tables) blocks.push(tableBlock(t, model));
  const refs = model.refs.map((r) => refLine(r, model)).filter((x): x is string => x !== null);
  if (refs.length) blocks.push(refs.join('\n'));
  for (const g of model.groups) blocks.push(groupBlock(g, model));
  return `${blocks.join('\n\n')}\n`;
}

/** What the SQL exporters get: the entry text for one file, the flattened model for several. */
export function sqlSourceOf(
  files: Record<string, string>,
  entry: string,
  model: DiagramModel | null,
): string {
  if (Object.keys(files).length <= 1 || !model) return files[entry] ?? '';
  return flattenModel(model);
}
