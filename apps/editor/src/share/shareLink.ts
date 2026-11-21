/**
 * Share links (decision 0004): `<editor>#dbml=<b64u>[&layout=<b64u>][&view=<name>]`. The codec
 * lives in @relvista/renderer so the docs viewer and the editor never drift; this module adds the
 * editor's policy (what goes in, size thresholds, reading the hash on load).
 */
import { DEFAULT_VIEW, type Layout } from '@relvista/core';
import {
  ShareTooLargeError,
  createEditorLink,
  decodeShareHash,
  type SharePayload,
} from '@relvista/renderer';
import { LIMITS } from '../files/limits.js';

/** Above this many characters some chat apps cut the link. */
export const LONG_LINK_CHARS = 8000;
/** Above this the link is not offered at all. */
export const MAX_LINK_CHARS = 2 * 1024 * 1024;

export interface ShareOptions {
  dbml: string;
  layout: Layout | null;
  view: string;
  includeLayout: boolean;
  includeView: boolean;
}

export type ShareSize =
  | { level: 'ok'; chars: number; label: string }
  | { level: 'long'; chars: number; label: string; message: string }
  | { level: 'too-large'; chars: number; label: string; message: string };

export function sharePayload(o: ShareOptions): SharePayload {
  const payload: SharePayload = { dbml: o.dbml };
  if (o.includeLayout && o.layout) payload.layout = o.layout;
  if (o.includeView && o.view !== DEFAULT_VIEW) payload.view = o.view;
  return payload;
}

/** The editor's own URL without query and hash (works on any deploy base). */
export function currentEditorUrl(loc: Pick<Location, 'origin' | 'pathname'> = location): string {
  return `${loc.origin}${loc.pathname}`;
}

export async function buildShareLink(
  o: ShareOptions,
  editorUrl = currentEditorUrl(),
): Promise<string> {
  return createEditorLink(editorUrl, sharePayload(o));
}

function sizeLabel(chars: number): string {
  if (chars < 1000) return `${chars} character link`;
  if (chars < 1_000_000) return `${(chars / 1000).toFixed(1)} KB link`;
  return `${(chars / 1_000_000).toFixed(1)} MB link`;
}

/** Size verdict for a built link (1 char ≈ 1 byte: the link is ASCII). */
export function shareSize(link: string): ShareSize {
  const chars = link.length;
  const label = sizeLabel(chars);
  if (chars > MAX_LINK_CHARS) {
    return {
      level: 'too-large',
      chars,
      label,
      message: 'Too large to share as a link; save the file instead.',
    };
  }
  if (chars > LONG_LINK_CHARS) {
    return {
      level: 'long',
      chars,
      label,
      message: 'Long link — some chat apps cut links this long.',
    };
  }
  return { level: 'ok', chars, label };
}

/** Note shown in the dialog for multi-file workspaces. */
export function multiFileNote(fileCount: number, entry: string): string | null {
  if (fileCount <= 1) return null;
  return `The link carries ${entry} only; the other ${fileCount - 1} file${fileCount === 2 ? '' : 's'} of this folder are not included.`;
}

export type HashRead =
  | { kind: 'none' }
  | { kind: 'damaged' }
  | { kind: 'too-large'; maxBytes: number }
  | {
      kind: 'share';
      dbml: string;
      layout: Layout | null;
      view: string;
      legacy: boolean;
      layoutError: string | null;
    };

/** True when a location hash carries a share link. */
export function isShareHash(hash: string): boolean {
  return /(^#?|&)dbml=/.test(hash);
}

/** Reads `#dbml=` from a location hash. Never throws. Text over LIMITS.maxFileBytes is refused. */
export async function readShareHash(
  hash: string,
  maxBytes: number = LIMITS.maxFileBytes,
): Promise<HashRead> {
  if (!isShareHash(hash)) return { kind: 'none' };
  try {
    const r = await decodeShareHash(hash, { maxBytes });
    if (!r) return { kind: 'damaged' };
    return {
      kind: 'share',
      dbml: r.dbml,
      layout: r.layout ?? null,
      view: r.view && r.view !== '' ? r.view : DEFAULT_VIEW,
      legacy: r.legacy === true,
      layoutError: r.layoutError ?? null,
    };
  } catch (e) {
    if (e instanceof ShareTooLargeError) return { kind: 'too-large', maxBytes };
    return { kind: 'damaged' };
  }
}

/** Display name for a shared document: `<Project name>.dbml`, else `shared.dbml`. */
export function sharedName(projectName: string | null | undefined): string {
  const n = (projectName ?? '').trim().replace(/[\\/:*?"<>|]+/g, '-');
  return n ? `${n}.dbml` : 'shared.dbml';
}
