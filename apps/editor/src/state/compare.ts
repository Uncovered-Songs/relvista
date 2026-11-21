/**
 * Compare (schema diff, design phase3 §6.11): where the other version comes from (a file, pasted
 * text, a URL, or a Git ref of the GitHub file the document came from), which side is "before",
 * and the diff of the two models. Pure apart from `resolveCompareSource`, which fetches.
 */
import {
  DEFAULT_VIEW,
  compileDbml,
  diffModels,
  mergeForDiff,
  parseRefId,
  selectView,
  type Diagnostic,
  type DiagramModel,
  type ModelDiff,
} from '@relvista/core';
import {
  RemoteError,
  fetchBytes,
  gitHubFile,
  normalizeRemoteUrl,
  remoteFileName,
  withGitRef,
} from '../files/remote.js';
import { NotUtf8Error, decodeDbml, normalizeToLf } from '../files/text.js';

export type CompareSourceKind = 'file' | 'paste' | 'url' | 'git';

/** What the user asked to compare with. */
export type CompareRequest =
  | { kind: 'paste'; text: string }
  | { kind: 'file'; name: string; bytes: Uint8Array }
  | { kind: 'url'; url: string }
  /** `docUrl`: the document's own (GitHub) URL; `ref`: branch, tag or commit. */
  | { kind: 'git'; docUrl: string; ref: string };

/** The other version, resolved to text. */
export interface CompareOther {
  kind: CompareSourceKind;
  /** Short label for the UI: file name, "Pasted text", "main: schema.dbml". */
  label: string;
  /** DBML with '\n' line ends. */
  text: string;
  /** Where it was fetched from (URL and Git ref sources). */
  url?: string;
}

export class CompareError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CompareError';
  }
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

function decodeOther(bytes: Uint8Array): string {
  try {
    return normalizeToLf(decodeDbml(bytes).text);
  } catch (e) {
    if (e instanceof NotUtf8Error) throw new CompareError('relvista only compares UTF-8 files.');
    throw e;
  }
}

/** The ref a Git-ref source would show by default: the ref the document was opened at. */
export function documentRef(docUrl: string | null | undefined): string | null {
  return docUrl ? (gitHubFile(docUrl)?.ref ?? null) : null;
}

/** True when the Git ref source is offered: the document came from a GitHub file URL. */
export function canCompareGitRef(docUrl: string | null | undefined): boolean {
  return documentRef(docUrl) !== null;
}

/**
 * The URL a request fetches (URL and Git ref sources), or null for local sources. Throws
 * CompareError for URLs relvista does not open.
 */
export function compareSourceUrl(req: CompareRequest): string | null {
  try {
    if (req.kind === 'url') return normalizeRemoteUrl(req.url);
    if (req.kind === 'git') return withGitRef(req.docUrl, req.ref);
  } catch (e) {
    if (e instanceof RemoteError) throw new CompareError(e.message);
    throw e;
  }
  return null;
}

/** Resolves a request to text. Throws CompareError with a message for the dialog. */
export async function resolveCompareSource(
  req: CompareRequest,
  options: { fetch?: FetchLike } = {},
): Promise<CompareOther> {
  if (req.kind === 'paste') {
    const text = normalizeToLf(req.text);
    if (!text.trim()) throw new CompareError('Paste a DBML schema to compare with.');
    return { kind: 'paste', label: 'Pasted text', text };
  }
  if (req.kind === 'file') {
    return { kind: 'file', label: req.name || 'File', text: decodeOther(req.bytes) };
  }
  const url = compareSourceUrl(req)!;
  let bytes: Uint8Array;
  try {
    bytes = (await fetchBytes(url, options.fetch ? { fetch: options.fetch } : {}))!;
  } catch (e) {
    if (e instanceof RemoteError) throw new CompareError(e.message);
    throw e;
  }
  const text = decodeOther(bytes);
  const name = remoteFileName(url);
  const label = req.kind === 'git' ? `${req.ref.trim()}: ${name}` : name;
  return { kind: req.kind, label, text, url };
}

/** Compiles the other version; the model, or the first error to show. */
export function compileOther(
  text: string,
): { ok: true; model: DiagramModel } | { ok: false; message: string } {
  const r = compileDbml(text);
  if (r.model) return { ok: true, model: r.model };
  const first: Diagnostic | undefined = r.diagnostics.find((d) => d.severity === 'error');
  return {
    ok: false,
    message: first
      ? `The other schema has errors (line ${first.start.line}: ${first.message}).`
      : 'The other schema could not be read.',
  };
}

/**
 * Before and after: by default the other version is "before" and the open document "after"
 * (what changed since); swapped, the other way round.
 */
export function compareSides<T>(
  current: T,
  other: T,
  swapped: boolean,
): { before: T; after: T; beforeIsOther: boolean } {
  return swapped
    ? { before: current, after: other, beforeIsOther: false }
    : { before: other, after: current, beforeIsOther: true };
}

/** The diff and the merged model drawn in compare mode. */
export interface CompareResult {
  diff: ModelDiff;
  /** `mergeForDiff(before, after, diff)`: every element of both versions. */
  merged: DiagramModel;
}

export function computeCompare(
  current: DiagramModel,
  other: DiagramModel,
  swapped: boolean,
): CompareResult {
  const { before, after } = compareSides(current, other, swapped);
  const diff = diffModels(before, after);
  return { diff, merged: mergeForDiff(before, after, diff) };
}

/** The merged model filtered to a view (as the canvas draws the open view). */
export function mergedForView(merged: DiagramModel, view: string): DiagramModel {
  return view === DEFAULT_VIEW ? merged : (selectView(merged, view) ?? merged);
}

export type ChangeKindGroup = 'tables' | 'refs' | 'enums' | 'groups' | 'notes' | 'views';

/** One row of the Changes panel. */
export interface ChangeRow {
  group: ChangeKindGroup;
  status: 'added' | 'removed' | 'changed';
  /** Diagram node to focus on click (tables, groups, notes), or a ref id. */
  target: string | null;
  label: string;
  /** Details for 'changed' rows ("3 columns changed", "renamed from x"). */
  detail?: string;
}

const short = (id: string, prefix = '') =>
  (id.startsWith(prefix) ? id.slice(prefix.length) : id).replace(/^public\./, '');

/** The diff as panel rows, grouped in the panel's order. */
export function changeRows(diff: ModelDiff): ChangeRow[] {
  const rows: ChangeRow[] = [];
  for (const t of diff.tables) {
    const parts: string[] = [];
    if (t.renamedFrom !== undefined) parts.push(`renamed from ${short(t.renamedFrom)}`);
    const cols = t.columns.length;
    if (cols) parts.push(`${cols} column${cols === 1 ? '' : 's'}`);
    const fields = t.changes.filter(
      (c) => t.renamedFrom === undefined || (c.field !== 'name' && c.field !== 'schema'),
    ).length;
    if (fields) parts.push(`${fields} setting${fields === 1 ? '' : 's'}`);
    const more = t.indexes.length + t.checks.length;
    if (more) parts.push(`${more} index${more === 1 ? '' : 'es'} / checks`);
    rows.push({
      group: 'tables',
      status: t.status,
      target: t.id,
      label: short(t.id),
      ...(t.status === 'changed' && parts.length ? { detail: parts.join(', ') } : {}),
    });
  }
  for (const r of diff.refs)
    rows.push({ group: 'refs', status: r.status, target: r.id, label: refLabel(r.id) });
  for (const e of diff.enums)
    rows.push({
      group: 'enums',
      status: e.status,
      target: null,
      label: short(e.id),
      ...(e.status === 'changed' ? { detail: `${e.values.length} values` } : {}),
    });
  for (const g of diff.groups)
    rows.push({ group: 'groups', status: g.status, target: g.id, label: short(g.id, 'group:') });
  for (const n of diff.notes)
    rows.push({ group: 'notes', status: n.status, target: n.id, label: short(n.id, 'note:') });
  for (const v of diff.views)
    rows.push({ group: 'views', status: v.status, target: null, label: v.name });
  return rows;
}

/** A ref id shortened for the panel, as `formatDiff` writes it: "orders.user_id > users.id". */
export function refLabel(id: string): string {
  const parsed = parseRefId(id);
  if (!parsed) return id;
  const ep = (e: { tableId: string; columns: string[] }) =>
    `${short(e.tableId)}.${e.columns.length === 1 ? e.columns[0] : `(${e.columns.join(', ')})`}`;
  return `${ep(parsed.from)} ${parsed.relation} ${ep(parsed.to)}${parsed.n > 1 ? ` #${parsed.n}` : ''}`;
}

/** The first line of `formatDiff`: "3 added, 1 removed, 4 changed" or "No changes". */
export function summaryLine(diff: ModelDiff): string {
  const { added, removed, changed } = diff.summary;
  return diff.empty ? 'No changes' : `${added} added, ${removed} removed, ${changed} changed`;
}
