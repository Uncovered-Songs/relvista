/**
 * Stable id encoding shared by the diagram model and the layout file.
 *
 * A table id is `<schema>.<table>`. Each segment is written as is, unless it is empty, contains one
 * of `.` `"` `\` `:` `,` `(` `)`, or starts with a relationship-operator character (`<` `>` `-` `?`).
 * Such a segment is wrapped in double quotes, with `"` and `\` escaped by a backslash:
 * `Table a."b.c"` → `a."b.c"`, `Table "a.b".c` → `"a.b".c`. The encoding is injective, so two
 * different (schema, name) pairs never share an id, and a table id can never look like a
 * `note:` / `group:` id.
 *
 * A ref id is derived from its endpoints and relationship operator:
 * `ref:<tableId>(<col>,<col>)<op><tableId>(<col>)`, columns encoded like segments, plus `#<n>`
 * (n ≥ 2) only when several refs have exactly the same endpoints and operator.
 */

export const DEFAULT_SCHEMA_NAME = 'public';

const NEEDS_QUOTES = /[."\\:,()]|^[<>?-]|^$/;
const REL_OP_CHARS = '<>-?';

/** Encodes one id segment (schema, table or column name). */
export function idSegment(name: string): string {
  return NEEDS_QUOTES.test(name) ? `"${name.replace(/["\\]/g, '\\$&')}"` : name;
}

/** Stable table (and enum) id: `schema.name`, schema defaulting to `public`, segments encoded. */
export function tableIdOf(schema: string | null | undefined, name: string): string {
  return `${idSegment(schema || DEFAULT_SCHEMA_NAME)}.${idSegment(name)}`;
}

/** One endpoint of a ref id: the table id and its column names. */
export interface RefIdEndpoint {
  tableId: string;
  columns: string[];
}

/** A ref id split into its parts by `parseRefId`. */
export interface ParsedRefId {
  from: RefIdEndpoint;
  relation: string;
  to: RefIdEndpoint;
  /** Collision suffix (`#n`), 1 when absent. */
  n: number;
}

/** Builds a ref id from its endpoints (see the module comment). `n` > 1 adds the `#n` suffix. */
export function refIdOf(from: RefIdEndpoint, relation: string, to: RefIdEndpoint, n = 1): string {
  const ep = (e: RefIdEndpoint) => `${e.tableId}(${e.columns.map(idSegment).join(',')})`;
  return `ref:${ep(from)}${relation}${ep(to)}${n > 1 ? `#${n}` : ''}`;
}

/** Parses an id produced by `refIdOf`; returns `null` for anything else. */
export function parseRefId(id: string): ParsedRefId | null {
  if (!id.startsWith('ref:')) return null;
  let i = 4;

  // Reads one segment; returns its encoded form (as it appears in the id) and decoded value.
  const segment = (stops: string): { raw: string; value: string } | null => {
    const start = i;
    if (id[i] === '"') {
      let value = '';
      i++;
      while (i < id.length && id[i] !== '"') {
        if (id[i] === '\\') i++;
        if (i >= id.length) return null;
        value += id[i];
        i++;
      }
      if (id[i] !== '"') return null;
      i++;
      const raw = id.slice(start, i);
      return idSegment(value) === raw ? { raw, value } : null;
    }
    while (i < id.length && !stops.includes(id[i] as string)) i++;
    if (i === start) return null;
    const value = id.slice(start, i);
    return idSegment(value) === value ? { raw: value, value } : null;
  };
  const endpoint = (): RefIdEndpoint | null => {
    const schema = segment('.(');
    if (!schema || id[i] !== '.') return null;
    i++;
    const table = segment('(');
    if (!table || id[i] !== '(') return null;
    i++;
    const columns: string[] = [];
    if (id[i] !== ')') {
      for (;;) {
        const col = segment(',)');
        if (!col) return null;
        columns.push(col.value);
        if (id[i] === ',') i++;
        else break;
      }
    }
    if (id[i] !== ')') return null;
    i++;
    return { tableId: `${schema.raw}.${table.raw}`, columns };
  };

  const from = endpoint();
  if (!from) return null;
  const opStart = i;
  while (i < id.length && REL_OP_CHARS.includes(id[i] as string)) i++;
  const relation = id.slice(opStart, i);
  if (!relation) return null;
  const to = endpoint();
  if (!to) return null;
  let n = 1;
  if (i < id.length) {
    const m = /^#([2-9]|[1-9]\d+)$/.exec(id.slice(i));
    if (!m) return null;
    n = Number(m[1]);
  }
  return { from, relation, to, n };
}
