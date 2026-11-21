/** `?url=` remote files: URL checks, GitHub blob → raw rewrite, fetch with a size cap. */
import { LIMITS, formatBytes } from './limits.js';

export class RemoteError extends Error {
  constructor(
    message: string,
    readonly url: string,
  ) {
    super(message);
    this.name = 'RemoteError';
  }
}

/**
 * Validates and normalises a user URL: only `https:` (and `http://localhost` / 127.0.0.1 for dev);
 * GitHub `blob` URLs become `raw.githubusercontent.com`. Throws RemoteError.
 */
export function normalizeRemoteUrl(input: string): string {
  let u: URL;
  try {
    u = new URL(input.trim());
  } catch {
    throw new RemoteError('This is not a valid URL.', input);
  }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (!(u.protocol === 'https:' || (u.protocol === 'http:' && local))) {
    throw new RemoteError('Only https:// URLs can be opened.', input);
  }
  if (u.hostname === 'github.com') {
    const m = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/.exec(u.pathname);
    if (m) return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}`;
  }
  return u.toString();
}

/** Last path segment, decoded: `…/db/schema.dbml?x` → `schema.dbml`. */
export function remoteFileName(url: string): string {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    const name = decodeURIComponent(seg);
    return name || 'remote.dbml';
  } catch {
    return 'remote.dbml';
  }
}

/** URL of a remote file's layout sidecar: `.layout.json` goes on the path, the query stays. */
export function sidecarUrl(url: string): string {
  const u = new URL(url);
  u.pathname += '.layout.json';
  u.hash = '';
  return u.toString();
}

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Fetches bytes with CORS and no credentials; rejects > 5 MB. `null` for a 404 when `optional`. */
export async function fetchBytes(
  url: string,
  options: { optional?: boolean; fetch?: FetchLike; maxBytes?: number } = {},
): Promise<Uint8Array | null> {
  const f = options.fetch ?? ((u, i) => fetch(u, i));
  const max = options.maxBytes ?? LIMITS.maxFileBytes;
  let res: Response;
  try {
    res = await f(url, { mode: 'cors', credentials: 'omit' });
  } catch {
    if (options.optional) return null;
    throw new RemoteError(
      'The file could not be downloaded. The server may not allow cross-origin requests (CORS), or it is offline.',
      url,
    );
  }
  if (!res.ok) {
    if (options.optional) return null;
    throw new RemoteError(
      res.status === 404
        ? 'The server says this file does not exist (404).'
        : `The server answered ${res.status} ${res.statusText}.`.trim(),
      url,
    );
  }
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > max) throw new RemoteError(`The file is larger than ${formatBytes(max)}.`, url);
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.length > max)
      throw new RemoteError(`The file is larger than ${formatBytes(max)}.`, url);
    return buf;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > max) {
      await reader.cancel();
      throw new RemoteError(`The file is larger than ${formatBytes(max)}.`, url);
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

/** Reads `?url=` from a location search string; null when absent. */
export function readUrlParam(search: string): string | null {
  const v = new URLSearchParams(search).get('url');
  return v && v.trim() ? v.trim() : null;
}
