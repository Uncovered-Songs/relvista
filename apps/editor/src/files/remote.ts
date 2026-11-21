/**
 * `?url=` remote files: URL checks, GitHub blob / tree → raw rewrite, Git ref rewrite (Compare…),
 * fetch with a size cap.
 */
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
 * GitHub `blob`, `tree` and `raw` URLs of a file become `raw.githubusercontent.com`. Throws
 * RemoteError.
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
    const m = /^\/([^/]+)\/([^/]+)\/(?:blob|tree|raw)\/(.+)$/.exec(u.pathname);
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

/**
 * Where a remote file's layout comes from. Probing for a sidecar that does not exist costs a
 * request that the browser logs as a 404 in the console (no fetch option hides it), so the
 * editor only asks for one when told to:
 * - `none`: no request (plain `?url=`);
 * - `auto`: `<url>.layout.json` next to the file (`&layout`, `&layout=auto`, the dialog's checkbox);
 *   a missing file is not an error;
 * - `url`: an explicit layout URL (`&layout=<url>`, relative to the .dbml URL).
 */
export type RemoteLayout = { kind: 'none' } | { kind: 'auto' } | { kind: 'url'; url: string };

/** Reads `&layout=` next to `?url=`. */
export function readLayoutParam(search: string): RemoteLayout {
  const params = new URLSearchParams(search);
  if (!params.has('layout')) return { kind: 'none' };
  const v = params.get('layout')!.trim();
  if (v === '' || v === 'auto' || v === '1' || v === 'true') return { kind: 'auto' };
  return { kind: 'url', url: v };
}

/** The layout URL to fetch for a remote file, or null for none. Throws RemoteError. */
export function remoteLayoutUrl(fileUrl: string, layout: RemoteLayout): string | null {
  if (layout.kind === 'none') return null;
  if (layout.kind === 'auto') return sidecarUrl(fileUrl);
  let resolved: string;
  try {
    resolved = new URL(layout.url, fileUrl).toString();
  } catch {
    throw new RemoteError('The layout URL is not valid.', layout.url);
  }
  return normalizeRemoteUrl(resolved);
}

/** A file on raw.githubusercontent.com: `<owner>/<repo>/<ref>/<path>`. */
export interface GitHubFile {
  owner: string;
  repo: string;
  /** Branch, tag or commit (`refs/heads/x` and `refs/tags/x` kept as written). */
  ref: string;
  /** Path inside the repository, still percent-encoded as in the URL. */
  path: string;
}

/**
 * The parts of a GitHub file URL (any form `normalizeRemoteUrl` accepts), or null for other URLs.
 * The ref is one path segment (a branch with `/` in its name cannot be told from a folder), or
 * three for `refs/heads/<x>` / `refs/tags/<x>`.
 */
export function gitHubFile(url: string): GitHubFile | null {
  let raw: string;
  try {
    raw = normalizeRemoteUrl(url);
  } catch {
    return null;
  }
  const u = new URL(raw);
  if (u.hostname !== 'raw.githubusercontent.com') return null;
  const seg = u.pathname.split('/').filter(Boolean);
  if (seg.length < 4) return null;
  const [owner, repo, ...rest] = seg as [string, string, ...string[]];
  const n = rest[0] === 'refs' && (rest[1] === 'heads' || rest[1] === 'tags') ? 3 : 1;
  if (rest.length <= n) return null;
  return { owner, repo, ref: rest.slice(0, n).join('/'), path: rest.slice(n).join('/') };
}

/**
 * The raw URL of the same file at another Git ref (branch, tag or commit; may contain `/`).
 * Throws RemoteError when `url` is not a GitHub file or the ref is empty or unsafe.
 */
export function withGitRef(url: string, ref: string): string {
  const file = gitHubFile(url);
  if (!file) throw new RemoteError('Git refs work for files opened from GitHub.', url);
  const r = ref.trim();
  if (!r || /[\s?#\\]|\.\.|^\/|\/$|\/\//.test(r))
    throw new RemoteError('This is not a valid branch, tag or commit.', ref);
  const encoded = r
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return `https://raw.githubusercontent.com/${file.owner}/${file.repo}/${encoded}/${file.path}`;
}
