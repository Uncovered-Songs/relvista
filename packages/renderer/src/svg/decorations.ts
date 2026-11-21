/**
 * Decorations: the one seam through which search hits, FK paths, focus and schema diffs colour a
 * drawn diagram (docs/design/phase3-v1.md §4.2). Pure data; every SVG component takes the slice it
 * needs (`tone`, `columnTones`, `badge`).
 */
import type { PaletteKey } from '../theme.js';

/** The emphasis a decoration draws with: search match, path, or a diff status. */
export type DecorationTone = 'match' | 'path' | 'added' | 'removed' | 'changed';

/** Extra emphasis drawn over a diagram (search hits, paths, diff tones) without moving anything. */
export interface Decorations {
  /** Node (table / note / group) id → tone; drawn as a ring + tint (removed: dashed outline, 60% opacity, name struck through). */
  nodes?: Record<string, DecorationTone>;
  /** Table id → column name → tone (row tint; removed rows struck through). */
  columns?: Record<string, Record<string, DecorationTone>>;
  /** Ref id → tone (stroke colour + width 2; removed dashed). */
  refs?: Record<string, DecorationTone>;
  /** Dim (opacity 0.28) every node and ref without a decoration. Default false. */
  dimOthers?: boolean;
  /** Small text badges at a node's header right, e.g. "~3" (changed column count). */
  badges?: Record<string, string>;
}

/** The palette colour of each tone. */
export const TONE_COLOR: Readonly<Record<DecorationTone, PaletteKey>> = {
  match: 'match',
  path: 'path',
  added: 'diffAdded',
  removed: 'diffRemoved',
  changed: 'diffChanged',
};

/** Opacity of an undecorated node or ref under `dimOthers`. */
export const DIM_OPACITY = 0.28;
/** Opacity of a node decorated `removed`. */
export const REMOVED_OPACITY = 0.6;
/** Fill opacity of a decorated node's body tint and of a decorated column row. */
export const TINT_OPACITY = 0.1;
export const ROW_TINT_OPACITY = 0.16;
/** Dash of a removed node's outline and of a removed ref. */
export const REMOVED_DASH = '6 4';

const TONES = new Set<string>(Object.keys(TONE_COLOR));

/** `value` when it is a known tone (decorations may come from untyped JSON), else undefined. */
export function asTone(value: unknown): DecorationTone | undefined {
  return typeof value === 'string' && TONES.has(value) ? (value as DecorationTone) : undefined;
}

/** Tone of node `id`, if any. */
export function nodeTone(
  d: Decorations | null | undefined,
  id: string,
): DecorationTone | undefined {
  return asTone(d?.nodes?.[id]);
}

/** Column tones of table `id`, if any. */
export function columnTonesOf(
  d: Decorations | null | undefined,
  id: string,
): Readonly<Record<string, DecorationTone>> | undefined {
  const c = d?.columns?.[id];
  return c && Object.keys(c).length > 0 ? c : undefined;
}

/** Tone of ref `id`, if any. */
export function refTone(d: Decorations | null | undefined, id: string): DecorationTone | undefined {
  return asTone(d?.refs?.[id]);
}

/** Badge text of node `id`, if any (empty strings count as none). */
export function badgeOf(d: Decorations | null | undefined, id: string): string | undefined {
  const b = d?.badges?.[id];
  return typeof b === 'string' && b.length > 0 ? b : undefined;
}

/** Whether node `id` carries any decoration (tone, column tones or badge): not dimmed by `dimOthers`. */
export function isNodeDecorated(d: Decorations | null | undefined, id: string): boolean {
  return (
    nodeTone(d, id) !== undefined ||
    columnTonesOf(d, id) !== undefined ||
    badgeOf(d, id) !== undefined
  );
}

/** Whether `dimOthers` dims node `id`. */
export function dimmedByDecorations(d: Decorations | null | undefined, id: string): boolean {
  return !!d?.dimOthers && !isNodeDecorated(d, id);
}
