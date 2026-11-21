/**
 * Share links: `#dbml=<b64u>[&layout=<b64u>][&view=<name>]`, where `<b64u>` is base64url (no
 * padding) of the deflate-raw compressed UTF-8 text. Platform APIs only (CompressionStream,
 * btoa/atob); nothing runs at import time, so the module is SSR-safe. Decision 0004.
 */
import { DEFAULT_VIEW, parseLayout, serializeLayout, type Layout } from '@relvista/core';

/** What a share link carries. */
export interface SharePayload {
  /** DBML text, without BOM (a leading U+FEFF is dropped when encoding). */
  dbml: string;
  layout?: Layout | null;
  /** DiagramView name; omitted / '*' / null → default view. */
  view?: string | null;
}

/** The hosted relvista editor, the default target of "Open in editor" links. */
export const DEFAULT_EDITOR_URL = 'https://relvista.org/editor/';

/** Bytes per `String.fromCharCode(...chunk)` call (stays under engines' argument limits). */
const CHUNK = 0x8000;
const BASE64URL = /^[A-Za-z0-9_-]*$/;

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(b64u: string): Uint8Array<ArrayBuffer> {
  // A length of 1 mod 4 is never produced by an encoder.
  if (!BASE64URL.test(b64u) || b64u.length % 4 === 1) throw new Error('not base64url');
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Default cap on the inflated size of one share-link value (a small link can inflate a lot). */
export const MAX_SHARE_BYTES = 5 * 1024 * 1024;

/** The inflated text of a share link is larger than the cap. */
export class ShareTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`the shared text is larger than ${Math.round(maxBytes / (1024 * 1024))} MB`);
    this.name = 'ShareTooLargeError';
  }
}

/**
 * Runs bytes through a (de)compression stream, reading at most `maxBytes` of output: past it the
 * stream is cancelled and ShareTooLargeError thrown, so a decompression bomb never materialises.
 */
async function transform(
  bytes: Uint8Array<ArrayBuffer>,
  stream: CompressionStream | DecompressionStream,
  maxBytes = Infinity,
): Promise<Uint8Array> {
  // `Response` rather than `Blob#stream()`: test DOMs (jsdom) replace Blob with one that has no
  // stream(), while Response is always the platform's.
  const body = new Response(bytes).body;
  if (!body) throw new Error('streams are not supported');
  const reader = body.pipeThrough(stream).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new ShareTooLargeError(maxBytes);
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** base64url(deflate-raw(UTF-8(text))). */
export async function deflateToBase64Url(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  return bytesToBase64Url(await transform(bytes, new CompressionStream('deflate-raw')));
}

/**
 * Inverse of `deflateToBase64Url`; throws on bad base64url, bad deflate data or bad UTF-8, and
 * ShareTooLargeError when the text would be larger than `maxBytes` (default MAX_SHARE_BYTES).
 */
export async function inflateFromBase64Url(
  b64u: string,
  maxBytes: number = MAX_SHARE_BYTES,
): Promise<string> {
  const raw = await transform(
    base64UrlToBytes(b64u),
    new DecompressionStream('deflate-raw'),
    maxBytes,
  );
  return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(raw);
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Hash body without '#': "dbml=<b64u>[&layout=<b64u>][&view=<enc>]", keys in this order.
 *
 * @example
 * ```ts
 * import { decodeShareHash, encodeShareHash } from '@relvista/renderer';
 *
 * const hash = await encodeShareHash({ dbml: source, view: 'billing' });
 * const url = `https://relvista.org/editor/#${hash}`;
 * // … and back:
 * const payload = await decodeShareHash(new URL(url).hash);
 * ```
 */
export async function encodeShareHash(payload: SharePayload): Promise<string> {
  let out = `dbml=${await deflateToBase64Url(stripBom(payload.dbml))}`;
  if (payload.layout) out += `&layout=${await deflateToBase64Url(serializeLayout(payload.layout))}`;
  if (payload.view && payload.view !== DEFAULT_VIEW)
    out += `&view=${encodeURIComponent(payload.view)}`;
  return out;
}

/**
 * Accepts "#…" or "…". Returns null when there is no `dbml` key. A `dbml` value that is not
 * base64url or does not inflate is read as legacy `encodeURIComponent` text (phase-1 links).
 * A `layout` that fails to inflate or `parseLayout` is dropped (`layoutError` says why).
 * Throws ShareTooLargeError when the DBML (inflated, or legacy text) is larger than
 * `options.maxBytes` (default MAX_SHARE_BYTES, UTF-8 bytes); a too-large layout is dropped.
 */
export async function decodeShareHash(
  hash: string,
  options: { maxBytes?: number } = {},
): Promise<(SharePayload & { layoutError?: string; legacy?: boolean }) | null> {
  const maxBytes = options.maxBytes ?? MAX_SHARE_BYTES;
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const dbmlParam = params.get('dbml');
  if (dbmlParam === null) return null;
  const out: SharePayload & { layoutError?: string; legacy?: boolean } = { dbml: '' };
  try {
    out.dbml = await inflateFromBase64Url(dbmlParam, maxBytes);
  } catch (err) {
    if (err instanceof ShareTooLargeError) throw err;
    // Phase-1 link: URLSearchParams already undid encodeURIComponent.
    if (new TextEncoder().encode(dbmlParam).length > maxBytes)
      throw new ShareTooLargeError(maxBytes);
    out.dbml = dbmlParam;
    out.legacy = true;
  }
  out.dbml = stripBom(out.dbml);
  const layoutParam = params.get('layout');
  if (layoutParam !== null) {
    let text: string | null = null;
    try {
      text = await inflateFromBase64Url(layoutParam, maxBytes);
    } catch (err) {
      out.layoutError =
        err instanceof ShareTooLargeError
          ? `layout is too large: ${err.message}`
          : `layout is damaged: ${(err as Error).message || 'cannot inflate'}`;
    }
    if (text !== null) {
      const parsed = parseLayout(text);
      if (parsed.ok) out.layout = parsed.layout;
      else {
        const e = parsed.errors[0];
        out.layoutError = `layout is invalid: ${e ? `${e.path || '/'} ${e.message}` : 'unknown error'}`;
      }
    }
  }
  const view = params.get('view');
  if (view && view !== DEFAULT_VIEW) out.view = view;
  return out;
}

/** `editorUrl` without its hash + '#' + encodeShareHash(payload). */
export async function createEditorLink(editorUrl: string, payload: SharePayload): Promise<string> {
  const base = editorUrl.replace(/#[\s\S]*$/, '');
  return `${base}#${await encodeShareHash(payload)}`;
}
