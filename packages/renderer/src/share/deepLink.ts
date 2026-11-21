/**
 * Deep links (docs/design/phase3-v1.md §4.5): what a URL points at inside a diagram — a view, a
 * table (optionally in focus mode), a detail level, a viewport, a search or an FK path. Read from
 * and written to a hash or query body next to the share keys (`dbml=`, `layout=`), which this
 * codec ignores. Pure; SSR-safe.
 *
 * Grammar (URLSearchParams syntax, keys in this order):
 * `view=<enc>&table=<enc>&hops=<0..5>&detail=all|keys|names&vp=<x>,<y>,<zoom>&q=<enc>&path=<enc>~<enc>`
 * where `vp` numbers have at most 2 decimals and zoom is 0.05..4, and each `path` part is
 * percent-encoded on its own (a `~` inside a table name is `%7E`).
 */
import { DEFAULT_VIEW, type DetailLevel, type Viewport } from '@relvista/core';

/**
 * What a deep link points at: a view, a table (optionally in focus mode), a detail level, a viewport, a search or a path.
 */
export interface DiagramTarget {
  /** DiagramView name; absent = default view. */
  view?: string;
  /** Table as written (id, name or alias; resolved with `resolveTableRef`). */
  table?: string;
  /** With `table`: focus mode, related tables within this many hops (0..5). */
  hops?: number;
  detail?: DetailLevel;
  /** Viewport (x, y, zoom). */
  viewport?: Viewport;
  search?: string;
  /** Shortest FK path between two tables. */
  path?: [string, string];
}

/** Keys this codec reads and writes, in order. */
export const DEEP_LINK_KEYS = ['view', 'table', 'hops', 'detail', 'vp', 'q', 'path'] as const;

/**
 * Largest number of hops a focus shows: the canvas clamps to it, the focus chip stops at it and a
 * deep link carries at most it.
 */
export const MAX_FOCUS_HOPS = 5;
/** Smallest zoom a deep link viewport carries. */
export const MIN_LINK_ZOOM = 0.05;
/** Largest zoom a deep link viewport carries. */
export const MAX_LINK_ZOOM = 4;
/** Largest |x| / |y| a link carries (keeps numbers out of exponent notation). */
const MAX_COORD = 1e7;
const DETAILS: ReadonlySet<string> = new Set(['all', 'keys', 'names']);

function body(hash: string): string {
  return hash.startsWith('#') || hash.startsWith('?') ? hash.slice(1) : hash;
}

/** URLSearchParams decoding ('+' is a space); null when the escape sequence is malformed. */
function decode(raw: string): string | null {
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return null;
  }
}

/** Raw (still encoded) key/value pairs; first occurrence of a key wins, like URLSearchParams.get. */
function rawPairs(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const seg of text.split('&')) {
    const eq = seg.indexOf('=');
    if (eq < 0) continue;
    const key = decode(seg.slice(0, eq));
    if (key === null || out.has(key)) continue;
    out.set(key, seg.slice(eq + 1));
  }
  return out;
}

function round2(n: number): number {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
}

function nonEmpty(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0;
}

function validHops(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_FOCUS_HOPS;
}

function validViewport(v: unknown): Viewport | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const { x, y, zoom } = v as Record<string, unknown>;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof zoom !== 'number') return undefined;
  if (![x, y, zoom].every(Number.isFinite)) return undefined;
  if (Math.abs(x) > MAX_COORD || Math.abs(y) > MAX_COORD) return undefined;
  const z = round2(zoom);
  if (z < MIN_LINK_ZOOM || z > MAX_LINK_ZOOM) return undefined;
  return { x: round2(x), y: round2(y), zoom: z };
}

const NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

function parseViewport(raw: string): Viewport | undefined {
  const text = decode(raw);
  if (text === null) return undefined;
  const parts = text.split(',');
  if (parts.length !== 3 || !parts.every((p) => NUMBER.test(p.trim()))) return undefined;
  const [x, y, zoom] = parts.map((p) => Number(p.trim())) as [number, number, number];
  return validViewport({ x, y, zoom });
}

/**
 * Reads target keys from a hash or query body ('#…', '?…' or bare), ignoring every other key
 * (share keys dbml=/layout= coexist). Invalid values are dropped, never thrown.
 *
 * @example
 * ```ts
 * import { formatDiagramTarget, parseDiagramTarget } from '@relvista/renderer';
 *
 * parseDiagramTarget('#view=billing&table=orders&hops=1');
 * // { view: 'billing', table: 'orders', hops: 1 }
 * formatDiagramTarget({ table: 'users', detail: 'keys' }); // 'table=users&detail=keys'
 * ```
 */
export function parseDiagramTarget(hash: string): DiagramTarget {
  const pairs = rawPairs(body(typeof hash === 'string' ? hash : ''));
  const get = (key: string) => {
    const raw = pairs.get(key);
    return raw === undefined ? null : decode(raw);
  };
  const out: DiagramTarget = {};
  const view = get('view');
  if (nonEmpty(view) && view !== DEFAULT_VIEW) out.view = view;
  const table = get('table');
  if (nonEmpty(table)) out.table = table;
  const hops = get('hops');
  if (out.table && hops !== null && /^\d$/.test(hops) && validHops(Number(hops)))
    out.hops = Number(hops);
  const detail = get('detail');
  if (detail !== null && DETAILS.has(detail)) out.detail = detail as DetailLevel;
  const vp = pairs.get('vp');
  if (vp !== undefined) {
    const viewport = parseViewport(vp);
    if (viewport) out.viewport = viewport;
  }
  const q = get('q');
  if (nonEmpty(q) && q.trim().length > 0) out.search = q;
  const path = pairs.get('path');
  if (path !== undefined) {
    const parts = path.split('~');
    if (parts.length === 2) {
      const a = decode(parts[0]!);
      const b = decode(parts[1]!);
      if (nonEmpty(a) && nonEmpty(b)) out.path = [a, b];
    }
  }
  return out;
}

/** encodeURIComponent, plus '~' (the path separator). */
function enc(s: string): string {
  return encodeURIComponent(s).replace(/~/g, '%7E');
}

/**
 * Hash body without '#': the keys of the grammar in its order, invalid values left out; '' for an
 * empty target.
 */
export function formatDiagramTarget(target: DiagramTarget): string {
  const t = target ?? {};
  const out: string[] = [];
  if (nonEmpty(t.view) && t.view !== DEFAULT_VIEW) out.push(`view=${enc(t.view)}`);
  if (nonEmpty(t.table)) {
    out.push(`table=${enc(t.table)}`);
    if (validHops(t.hops)) out.push(`hops=${t.hops}`);
  }
  if (typeof t.detail === 'string' && DETAILS.has(t.detail)) out.push(`detail=${t.detail}`);
  const vp = validViewport(t.viewport);
  if (vp) out.push(`vp=${vp.x},${vp.y},${vp.zoom}`);
  if (nonEmpty(t.search) && t.search.trim().length > 0) out.push(`q=${enc(t.search)}`);
  if (Array.isArray(t.path) && t.path.length === 2 && nonEmpty(t.path[0]) && nonEmpty(t.path[1]))
    out.push(`path=${enc(t.path[0])}~${enc(t.path[1])}`);
  return out.join('&');
}

/**
 * Docs anchors: '#<anchor>&<target keys>' or '#<anchor>' — the first segment, when it has no
 * '=', is the anchor. Returns null when the hash names no anchor.
 */
export function parseAnchoredTarget(
  hash: string,
): { anchor: string; target: DiagramTarget } | null {
  const text = body(typeof hash === 'string' ? hash : '');
  const amp = text.indexOf('&');
  const first = amp < 0 ? text : text.slice(0, amp);
  if (first.length === 0 || first.includes('=')) return null;
  const anchor = decode(first);
  if (!nonEmpty(anchor)) return null;
  return { anchor, target: parseDiagramTarget(amp < 0 ? '' : text.slice(amp + 1)) };
}

/** Hash body without '#': '<anchor>' or '<anchor>&<target keys>'. */
export function formatAnchoredTarget(anchor: string, target: DiagramTarget): string {
  const keys = formatDiagramTarget(target);
  const a = encodeURIComponent(anchor);
  return keys ? `${a}&${keys}` : a;
}
