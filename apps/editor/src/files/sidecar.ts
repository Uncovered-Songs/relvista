/** The layout sidecar `<entry>.layout.json`: naming, pairing and parsing. Pure. */
import { layoutFileName, parseLayout, type Layout } from '@relvista/core';

export const SIDECAR_SUFFIX = '.layout.json';

/** `schema.dbml` → `schema.dbml.layout.json`; `db/main.dbml` → `db/main.dbml.layout.json`. */
export function sidecarKey(dbmlKey: string): string {
  return layoutFileName(dbmlKey);
}

/**
 * `schema.dbml.layout.json` → `schema.dbml`; null when the name is not a DBML sidecar. The
 * `.dbml` part matches in any case, like isDbmlName (`Schema.DBML.layout.json` → `Schema.DBML`);
 * the suffix is exactly what sidecarKey writes, so a save replaces the file that was read.
 */
export function dbmlKeyOfSidecar(name: string): string | null {
  if (!/\.dbml\.layout\.json$/i.test(name) || !name.endsWith(SIDECAR_SUFFIX)) return null;
  return name.slice(0, -SIDECAR_SUFFIX.length);
}

export function isDbmlName(name: string): boolean {
  return /\.dbml$/i.test(name);
}

export function isSidecarName(name: string): boolean {
  return dbmlKeyOfSidecar(name) !== null;
}

export type SidecarParse =
  { ok: true; layout: Layout; text: string } | { ok: false; error: string; text: string };

/** Parses sidecar text; the error names the first failing JSON pointer. */
export function parseSidecar(text: string): SidecarParse {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `not valid JSON (${(e as Error).message})`, text };
  }
  const r = parseLayout(json);
  if (r.ok) return { ok: true, layout: r.layout, text };
  const first = r.errors[0];
  const where = first ? (first.path === '' ? '(root)' : first.path) : '(root)';
  return { ok: false, error: `${where}: ${first?.message ?? 'invalid layout'}`, text };
}

/**
 * Pairs picked files: every `.dbml` and, by name, its sidecar. Returns the DBML names and a map
 * dbml name → sidecar name; sidecars without their DBML are listed in `orphans`.
 */
export function pairSidecars(names: readonly string[]): {
  dbml: string[];
  sidecarOf: Map<string, string>;
  orphans: string[];
} {
  const dbml = names.filter(isDbmlName);
  const set = new Set(dbml);
  const sidecarOf = new Map<string, string>();
  const orphans: string[] = [];
  for (const n of names) {
    const target = dbmlKeyOfSidecar(n);
    if (target === null) continue;
    if (set.has(target)) sidecarOf.set(target, n);
    else orphans.push(n);
  }
  return { dbml, sidecarOf, orphans };
}
