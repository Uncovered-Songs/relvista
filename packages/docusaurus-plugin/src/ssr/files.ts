// Node only (build time): files of the site's static directories, by the URL path a page uses.
import { readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, posix, resolve, sep } from 'node:path';
import type { SiteFile } from './types.js';

export interface SiteFilesConfig {
  siteDir: string;
  /** `siteConfig.staticDirectories` (relative to `siteDir` or absolute). Default `['static']`. */
  staticDirectories?: readonly string[];
  /** `siteConfig.baseUrl`: a path that starts with it is read without it, too. */
  baseUrl?: string;
}

/** Whether a path is a remote URL (`https://…`, `//host/…`, `data:` …), never read at build time. */
export function isRemote(path: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith('//');
}

/**
 * The site-relative form of a URL path (`/layouts/a.json?x#y` → `layouts/a.json`), or null when it
 * is not a plain path inside the site: remote URLs, `..` segments (also percent-encoded),
 * backslashes and NUL bytes are refused.
 */
export function normalizeSitePath(path: string): string | null {
  if (isRemote(path)) return null;
  let p = path.replace(/[?#].*$/, '');
  try {
    p = decodeURIComponent(p);
  } catch {
    return null;
  }
  if (p.includes('\0') || p.includes('\\')) return null;
  if (p.split('/').some((s) => s === '..')) return null;
  const n = posix.normalize(`/${p}`).replace(/^\/+/, '');
  if (!n || n === '.' || n.startsWith('../')) return null;
  return n;
}

/**
 * A reader of the site's static files (cached: each file is read once per build). Paths are
 * resolved against every static directory in order, also without the site's `baseUrl`.
 */
export function createSiteFileReader(config: SiteFilesConfig): (path: string) => SiteFile {
  const dirs = (config.staticDirectories ?? ['static']).map((d) =>
    isAbsolute(d) ? resolve(d) : resolve(config.siteDir, d),
  );
  const base = (config.baseUrl ?? '/').replace(/^\/+|\/+$/g, '');
  const cache = new Map<string, SiteFile>();

  const read = (path: string): SiteFile => {
    if (isRemote(path)) return { ok: false, message: `${path} is remote (not read at build time)` };
    const rel = normalizeSitePath(path);
    if (rel === null) return { ok: false, message: `${path} is not a path inside the site` };
    const candidates = [rel];
    if (base && rel.startsWith(`${base}/`)) candidates.push(rel.slice(base.length + 1));
    for (const c of candidates) {
      for (const dir of dirs) {
        const file = join(dir, ...c.split('/'));
        // Belt and braces: never outside the static directory.
        if (!file.startsWith(dir + sep)) continue;
        try {
          if (!statSync(file).isFile()) continue;
          return { ok: true, text: readFileSync(file, 'utf8') };
        } catch {
          // not in this directory
        }
      }
    }
    return { ok: false, message: `${path} was not found in the site's static directories` };
  };

  return (path: string): SiteFile => {
    const hit = cache.get(path);
    if (hit) return hit;
    const out = read(path);
    cache.set(path, out);
    return out;
  };
}
