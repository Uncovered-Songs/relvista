/**
 * Text search over a diagram model: tables, columns, enums, groups, sticky notes and views.
 *
 * Pure and deterministic: hits are ranked by score, then kind, then model order.
 */
import { DEFAULT_SCHEMA_NAME } from '../ids.js';
import type { DiagramModel, Table } from '../model/types.js';

/** What a search hit points at. */
export type SearchKind = 'table' | 'column' | 'enum' | 'group' | 'note' | 'view';

/** One search result, with the matched ranges of its label for highlighting. */
export interface SearchHit {
  kind: SearchKind;
  /** Node id for tables/groups/notes, table id for columns, enum id, view name. */
  id: string;
  /** Column name for kind 'column'. */
  column?: string;
  /** Text shown in a result list, e.g. "orders.user_id", "billing (view)". */
  label: string;
  /** UTF-16 [start, end) ranges of `label` that matched, for highlighting. */
  ranges: Array<[number, number]>;
  score: number;
}

/** Options of `searchModel`. */
export interface SearchOptions {
  /** Kinds to search. Default: all. */
  kinds?: SearchKind[];
  /** Maximum number of hits. Default 50. */
  limit?: number;
}

/** Scores of the match levels, best first. */
export const SEARCH_SCORES = {
  exact: 100,
  prefix: 80,
  wordStart: 60,
  substring: 40,
  subsequence: 20,
} as const;

const KIND_RANK: Record<SearchKind, number> = {
  table: 0,
  column: 1,
  enum: 2,
  group: 3,
  note: 4,
  view: 5,
};

const MARKS = /\p{M}/gu;

/** Case- and accent-folded form of one string (NFD, combining marks removed, lower case). */
export function foldSearchText(text: string): string {
  return text.normalize('NFD').replace(MARKS, '').toLowerCase();
}

/**
 * A folded string plus, for every folded UTF-16 unit, the [start, end) range of the original
 * string it came from. Combining marks that fold to nothing extend the preceding range.
 */
interface Folded {
  text: string;
  start: number[];
  end: number[];
  /** Whether a word starts at the folded unit (after a non-alphanumeric or a lower→upper step). */
  wordStart: boolean[];
}

const ALNUM = /[\p{L}\p{N}]/u;
const UPPER = /\p{Lu}/u;
const LOWER = /\p{Ll}/u;

function fold(original: string): Folded {
  const out: Folded = { text: '', start: [], end: [], wordStart: [] };
  let prev = '';
  let i = 0;
  for (const ch of original) {
    const folded = foldSearchText(ch);
    if (folded.length === 0) {
      // A lone combining mark: belongs to the previous character.
      if (out.end.length > 0) out.end[out.end.length - 1] = i + ch.length;
    } else {
      const boundary =
        ALNUM.test(ch) &&
        (prev === '' || !ALNUM.test(prev) || (LOWER.test(prev) && UPPER.test(ch)));
      for (let k = 0; k < folded.length; k++) {
        out.start.push(i);
        out.end.push(i + ch.length);
        out.wordStart.push(k === 0 && boundary);
      }
      out.text += folded;
      prev = ch;
    }
    i += ch.length;
  }
  return out;
}

interface Match {
  score: number;
  /** Folded-index ranges. */
  ranges: Array<[number, number]>;
}

function matchFolded(f: Folded, q: string): Match | null {
  const t = f.text;
  if (t === q) return { score: SEARCH_SCORES.exact, ranges: [[0, t.length]] };
  if (t.startsWith(q)) return { score: SEARCH_SCORES.prefix, ranges: [[0, q.length]] };
  let first = -1;
  for (let at = t.indexOf(q); at >= 0; at = t.indexOf(q, at + 1)) {
    if (first < 0) first = at;
    if (f.wordStart[at]) return { score: SEARCH_SCORES.wordStart, ranges: [[at, at + q.length]] };
  }
  if (first >= 0) return { score: SEARCH_SCORES.substring, ranges: [[first, first + q.length]] };
  // Subsequence: greedy leftmost.
  const ranges: Array<[number, number]> = [];
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] !== q[qi]) continue;
    const last = ranges[ranges.length - 1];
    if (last && last[1] === ti) last[1] = ti + 1;
    else ranges.push([ti, ti + 1]);
    qi++;
  }
  return qi === q.length ? { score: SEARCH_SCORES.subsequence, ranges } : null;
}

function isSubsequence(text: string, q: string): boolean {
  let qi = 0;
  for (let ti = 0; ti < text.length && qi < q.length; ti++) if (text[ti] === q[qi]) qi++;
  return qi === q.length;
}

/** A piece of a label that a query is matched against. `offset` is its position in the label. */
interface Candidate {
  text: string;
  offset: number;
}

interface Entry {
  kind: SearchKind;
  id: string;
  column?: string;
  label: string;
  candidates: Candidate[];
}

/** `name` for tables in the default schema, `schema.name` otherwise. */
function displayName(t: { schema: string; name: string }): string {
  return t.schema === DEFAULT_SCHEMA_NAME ? t.name : `${t.schema}.${t.name}`;
}

function tableEntry(t: Table): Entry {
  const shown = displayName(t);
  const label = t.alias ? `${shown} (${t.alias})` : shown;
  const nameOffset = shown.length - t.name.length;
  const candidates: Candidate[] = [{ text: t.name, offset: nameOffset }];
  if (shown !== t.name) candidates.push({ text: shown, offset: 0 });
  if (t.alias) candidates.push({ text: t.alias, offset: shown.length + 2 });
  return { kind: 'table', id: t.id, label, candidates };
}

function* entries(model: DiagramModel, kinds: ReadonlySet<SearchKind>): Generator<Entry> {
  if (kinds.has('table')) for (const t of model.tables) yield tableEntry(t);
  if (kinds.has('column')) {
    for (const t of model.tables) {
      const shown = displayName(t);
      for (const c of t.columns) {
        const label = `${shown}.${c.name}`;
        const tableQualified = `${t.name}.${c.name}`;
        const candidates: Candidate[] = [
          { text: c.name, offset: shown.length + 1 },
          { text: tableQualified, offset: label.length - tableQualified.length },
        ];
        if (shown !== t.name) candidates.push({ text: label, offset: 0 });
        yield { kind: 'column', id: t.id, column: c.name, label, candidates };
      }
    }
  }
  const suffixed = (kind: SearchKind, id: string, shown: string, name: string): Entry => ({
    kind,
    id,
    label: `${shown} (${kind})`,
    candidates:
      shown === name
        ? [{ text: name, offset: 0 }]
        : [
            { text: name, offset: shown.length - name.length },
            { text: shown, offset: 0 },
          ],
  });
  if (kinds.has('enum'))
    for (const e of model.enums) yield suffixed('enum', e.id, displayName(e), e.name);
  if (kinds.has('group'))
    for (const g of model.groups) yield suffixed('group', g.id, g.name, g.name);
  if (kinds.has('note'))
    for (const n of model.stickyNotes) yield suffixed('note', n.id, n.name, n.name);
  if (kinds.has('view'))
    for (const v of model.views) yield suffixed('view', v.name, v.name, v.name);
}

const ALL_KINDS: SearchKind[] = ['table', 'column', 'enum', 'group', 'note', 'view'];

/**
 * Case- and accent-insensitive. Score: exact name 100 > prefix 80 > word-start 60 > substring 40
 * > subsequence (fuzzy, all chars in order) 20; tables before columns on ties, then model order.
 * `schema.table`, `table.column` and aliases match too. Empty query → [].
 *
 * Sticky notes match by name only, not by content.
 *
 * @example
 * ```ts
 * import { compileDbml, searchModel } from '@relvista/core';
 *
 * const { model } = compileDbml(source);
 * const hits = searchModel(model!, 'user', { kinds: ['table', 'column'], limit: 10 });
 * hits[0]; // { kind: 'table', id: 'public.users', label: 'users', ranges: [[0, 4]], ... }
 * ```
 */
export function searchModel(
  model: DiagramModel,
  query: string,
  options: SearchOptions = {},
): SearchHit[] {
  const q = foldSearchText(query.trim());
  const limit = Math.max(0, Math.floor(options.limit ?? 50));
  if (q.length === 0 || limit === 0) return [];
  const kinds = new Set(options.kinds ?? ALL_KINDS);

  const hits: Array<SearchHit & { seq: number }> = [];
  let seq = 0;
  for (const entry of entries(model, kinds)) {
    let best: { match: Match; f: Folded; offset: number } | null = null;
    for (const cand of entry.candidates) {
      // Cheap reject before building the index map: every match level implies a subsequence.
      if (!isSubsequence(foldSearchText(cand.text), q)) continue;
      const f = fold(cand.text);
      const match = matchFolded(f, q);
      if (match && (!best || match.score > best.match.score))
        best = { match, f, offset: cand.offset };
    }
    if (best) {
      const { match, f, offset } = best;
      const ranges = match.ranges.map(([s, e]): [number, number] => [
        offset + (f.start[s] ?? 0),
        offset + (f.end[e - 1] ?? 0),
      ]);
      const hit: SearchHit & { seq: number } = {
        kind: entry.kind,
        id: entry.id,
        label: entry.label,
        ranges,
        score: match.score,
        seq,
      };
      if (entry.column !== undefined) hit.column = entry.column;
      hits.push(hit);
    }
    seq++;
  }
  hits.sort((a, b) => b.score - a.score || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.seq - b.seq);
  return hits.slice(0, limit).map(({ seq: _seq, ...hit }) => hit);
}
