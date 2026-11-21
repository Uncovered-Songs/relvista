// Browser-safe and dependency-free (part of every page's bundle): per-diagram anchors
// (docs/design/phase3-v1.md §5.2), the same on the server and in the browser.
import type { CompileInputFiles } from '@relvista/core';
import { sourceText } from '../../source.js';

/** 32-bit FNV-1a of `text` (UTF-16 code units), as 8 hex digits. */
export function fnv1aHex(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/**
 * A heading-style slug: lowercase, letters and digits of any script kept, spaces to `-`, other
 * punctuation dropped ("Billing & invoices" → `billing-invoices`). '' when nothing is left.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** What a diagram draws, as text: inline DBML, every file of a project, or the `src` path. */
export function sourceIdentity(
  value: string | CompileInputFiles | undefined,
  src: string | undefined,
): string {
  if (value !== undefined) return sourceText(value);
  return src ?? '';
}

export interface AnchorInputs {
  /** The `id` prop / fence meta: used as is. */
  id?: string | undefined;
  title?: string | undefined;
  /** `sourceIdentity` of what is drawn. */
  source: string;
  view?: string | undefined;
}

/**
 * The anchor of a diagram on its page: `id` when given, else `diagram-<slug(title)>`, else
 * `diagram-<8 hex digits of FNV-1a(source + view)>`. Deterministic, so the server and the browser
 * agree and links keep working across builds while the diagram does not change. The `diagram-`
 * prefix keeps default anchors apart from heading slugs: `## Billing` (`#billing`) and a diagram
 * titled "Billing" (`#diagram-billing`) can share a page.
 */
export function diagramAnchor({ id, title, source, view }: AnchorInputs): string {
  const own = id?.trim();
  if (own) return own;
  const slug = title ? slugify(title) : '';
  if (slug) return `diagram-${slug}`;
  return `diagram-${fnv1aHex(source + (view ?? ''))}`;
}

/**
 * Anchors rendered so far on the server, per page (a build renders each page once), with the
 * instance (`useId()`) that rendered each one first.
 */
const serverAnchors = new Map<string, Map<string, string>>();

/**
 * The warning for an anchor already used on `page` in this build by another diagram, else null
 * (and the anchor is recorded). `instance` names the rendering component (its `useId()`): React
 * renders a component again after it suspends, and that second render of the same diagram is not
 * a duplicate. Server only: called while a page is rendered to HTML.
 */
export function duplicateAnchorWarning(
  page: string,
  anchor: string,
  instance: string,
): string | null {
  let seen = serverAnchors.get(page);
  if (!seen) serverAnchors.set(page, (seen = new Map()));
  const first = seen.get(anchor);
  if (first === undefined) {
    seen.set(anchor, instance);
    return null;
  }
  if (first === instance) return null;
  return (
    `relvista: two diagrams on ${page} have the anchor "#${anchor}"; ` +
    'links to it reach only the first. Give one of them its own `id` (or a different title).'
  );
}

/** Forgets the anchors recorded by `duplicateAnchorWarning` (tests). */
export function resetServerAnchors(): void {
  serverAnchors.clear();
}

/**
 * The anchor a location hash names ('#<anchor>' or '#<anchor>&<target keys>'), decoded; null when
 * its first segment is empty or has an '='. The rule of `parseAnchoredTarget` in
 * `@relvista/renderer`, repeated here so pages can match anchors before the viewer chunk loads.
 */
export function anchorOfHash(hash: string): string | null {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  const amp = text.indexOf('&');
  const first = amp < 0 ? text : text.slice(0, amp);
  if (!first || first.includes('=')) return null;
  try {
    return decodeURIComponent(first.replace(/\+/g, ' ')) || null;
  } catch {
    return null;
  }
}
