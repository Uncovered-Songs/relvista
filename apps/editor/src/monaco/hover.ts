/**
 * Hover from the diagram model: word → @dbml/parse definition → declaration → model element.
 * All user text is escaped; Markdown is untrusted, no HTML.
 */
import type { Column, DiagramModel, Table } from '@relvista/core';
import type * as Monaco from 'monaco-editor/editor/editor.api';
import { elementStartingAt } from './positions.js';

const MAX_COLUMNS = 30;

/** Escapes Markdown punctuation (and pipes for tables). */
export function md(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');
}

function flags(c: Column): string {
  return [c.pk && 'PK', c.isFk && 'FK', c.notNull && 'NN', c.unique && 'U']
    .filter(Boolean)
    .join(' ');
}

export function tableHover(model: DiagramModel, t: Table): string {
  const parts: string[] = [`**${md(t.id)}**${t.alias ? ` (alias ${md(t.alias)})` : ''}`];
  const cols = t.columns.slice(0, MAX_COLUMNS);
  if (cols.length > 0) {
    parts.push(
      [
        '| column | type | |',
        '| --- | --- | --- |',
        ...cols.map((c) => `| ${md(c.name)} | ${md(c.type)} | ${flags(c)} |`),
      ].join('\n'),
    );
    if (t.columns.length > MAX_COLUMNS)
      parts.push(`… ${t.columns.length - MAX_COLUMNS} more columns`);
  }
  if (t.note) parts.push(md(t.note));
  const refs = model.refs.filter((r) => r.from.tableId === t.id || r.to.tableId === t.id).length;
  parts.push(`${refs} ref${refs === 1 ? '' : 's'}`);
  return parts.join('\n\n');
}

export function columnHover(t: Table, c: Column): string {
  const settings = flags(c);
  const parts = [`**${md(t.id)}.${md(c.name)}** ${md(c.type)}${settings ? ` · ${settings}` : ''}`];
  if (c.note) parts.push(md(c.note));
  return parts.join('\n\n');
}

export interface HoverDeps {
  getModel(): DiagramModel | null;
  definition(
    model: Monaco.editor.ITextModel,
    position: Monaco.Position,
  ): Promise<Array<{ uri: Monaco.Uri; range: Monaco.IRange }>>;
  keyOfUri(uri: Monaco.Uri): string;
}

/** Finds the hover text for the declaration at `key:line:col`. */
export function hoverAt(
  model: DiagramModel,
  key: string,
  line: number,
  column: number,
): string | null {
  const el = elementStartingAt(model, key, line, column);
  if (el?.kind === 'table') {
    const t = model.tables.find((x) => x.id === el.id);
    return t ? tableHover(model, t) : null;
  }
  if (el?.kind === 'enum') {
    const e = model.enums.find((x) => x.id === el.id);
    if (!e) return null;
    return [
      `**enum ${md(e.id)}**`,
      e.values.map((v) => `- ${md(v.name)}${v.note ? ` — ${md(v.note)}` : ''}`).join('\n'),
    ].join('\n\n');
  }
  if (el?.kind === 'group') {
    const g = model.groups.find((x) => x.id === el.id);
    return g
      ? `**TableGroup ${md(g.name)}** · ${g.tableIds.length} tables${g.note ? `\n\n${md(g.note)}` : ''}`
      : null;
  }
  if (el?.kind === 'note') {
    const n = model.stickyNotes.find((x) => x.id === el.id);
    return n ? `**Note ${md(n.name)}**\n\n${md(n.content)}` : null;
  }
  const col = columnDeclaredAt(model, key, line, column);
  return col ? columnHover(col.table, col.column) : null;
}

/**
 * The column whose declaration starts at `line:column` — its name, or the opening quote of a
 * quoted name — so a word further along the line (the type, a ref target) is not taken for it.
 */
function columnDeclaredAt(
  model: DiagramModel,
  key: string,
  line: number,
  column: number,
): { table: Table; column: Column } | null {
  for (const t of model.tables) {
    for (const c of t.columns) {
      if (c.fromPartial !== null) continue;
      const d = column - c.span.start.column;
      if (c.span.file === key && c.span.start.line === line && d >= 0 && d <= 1) {
        return { table: t, column: c };
      }
    }
  }
  return null;
}

const SEGMENT = /"(?:[^"\\]|\\.)*"|[A-Za-z0-9_$]+/y;

/** The dotted name (`auth.users.id`) around 0-based `index` of `text`, split into segments. */
export function dottedNameAt(
  text: string,
  index: number,
): { parts: string[]; hovered: number } | null {
  const parts: Array<{ text: string; start: number; end: number }> = [];
  let at = 0;
  while (at < text.length) {
    SEGMENT.lastIndex = at;
    const m = SEGMENT.exec(text);
    if (!m) {
      at++;
      continue;
    }
    const seg = { text: m[0], start: at, end: at + m[0].length };
    const chained =
      parts.length > 0 &&
      text[parts[parts.length - 1]!.end] === '.' &&
      parts[parts.length - 1]!.end + 1 === seg.start;
    if (!chained) {
      if (parts.length && index < seg.start) break;
      parts.length = 0;
    }
    parts.push(seg);
    at = seg.end;
  }
  const hovered = parts.findIndex((p) => index >= p.start && index < p.end);
  if (hovered < 0) return null;
  const unquote = (p: string) => (p.startsWith('"') ? p.slice(1, -1).replace(/\\(.)/g, '$1') : p);
  return { parts: parts.map((p) => unquote(p.text)), hovered };
}

function tableNamed(model: DiagramModel, parts: string[]): Table | null {
  if (parts.length === 1) {
    const [name] = parts;
    return (
      model.tables.find((t) => t.schema === 'public' && t.name === name) ??
      model.tables.find((t) => t.alias === name) ??
      null
    );
  }
  if (parts.length === 2) {
    return model.tables.find((t) => t.schema === parts[0] && t.name === parts[1]) ?? null;
  }
  return null;
}

/**
 * Hover where the definition provider found nothing: the declaration under the word itself
 * (`Table users {`, a column's name), else a `[schema.]table[.column]` reference on the line
 * resolved against the diagram model. Null when the word is none of these.
 */
export function fallbackHover(
  model: DiagramModel,
  key: string,
  line: number,
  lineText: string,
  wordStartColumn: number,
): string | null {
  const own = hoverAt(model, key, line, wordStartColumn);
  if (own) return own;
  const name = dottedNameAt(lineText, wordStartColumn - 1);
  if (!name) return null;
  const upTo = name.parts.slice(0, name.hovered + 1);
  const table = tableNamed(model, upTo);
  if (table) return tableHover(model, table);
  if (name.hovered === 0) return null;
  const owner = tableNamed(model, upTo.slice(0, -1));
  const column = owner?.columns.find((c) => c.name === upTo[upTo.length - 1]);
  return owner && column ? columnHover(owner, column) : null;
}

export function registerHover(m: typeof Monaco, deps: HoverDeps): Monaco.IDisposable {
  return m.languages.registerHoverProvider('dbml', {
    async provideHover(textModel, position) {
      try {
        const dm = deps.getModel();
        if (!dm) return null;
        const word = textModel.getWordAtPosition(position);
        if (!word) return null;
        const range = new m.Range(
          position.lineNumber,
          word.startColumn,
          position.lineNumber,
          word.endColumn,
        );
        const defs = await deps.definition(textModel, position);
        const target = defs[0];
        let text: string | null = null;
        if (target) {
          text = hoverAt(
            dm,
            deps.keyOfUri(target.uri),
            target.range.startLineNumber,
            target.range.startColumn,
          );
        }
        // On the declaration itself (`Table users {`), or a reference @dbml/parse did not resolve.
        text ??= fallbackHover(
          dm,
          deps.keyOfUri(textModel.uri),
          position.lineNumber,
          textModel.getLineContent(position.lineNumber),
          word.startColumn,
        );
        if (!text) return null;
        return { range, contents: [{ value: text, isTrusted: false, supportHtml: false }] };
      } catch {
        return null;
      }
    },
  });
}
