import type { TextRole } from './types.js';

/**
 * Drawing metrics shared by layout (core) and drawing (renderer).
 * The renderer MUST draw with these values so measured sizes match what is drawn.
 */
export const METRICS = {
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  monoFontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  fontSize: { tableName: 13, columnName: 12.5, columnType: 12, noteText: 12 },
  fontWeight: { tableName: 600, columnName: 400, columnType: 400, noteText: 400 },
  headerHeight: 36,
  rowHeight: 26,
  paddingX: 12,
  /** Space reserved left of a column name for the PK/FK marker. */
  keyMarkerWidth: 18,
  /** Minimum gap between a column name and its type. */
  nameTypeGap: 16,
  minTableWidth: 180,
  maxTableWidth: 420,
  /** Height of the bottom padding under the last column row. */
  tableBottomPadding: 4,
  /** Default sticky-note width; a saved `w` replaces it (clamped to noteMinWidth..noteMaxWidth). */
  noteWidth: 220,
  noteMinWidth: 120,
  noteMaxWidth: 640,
  notePadding: 12,
  noteLineHeight: 18,
  noteMinHeight: 64,
  groupPadding: 24,
  groupHeaderHeight: 28,
  cornerRadius: 8,
  /**
   * How far a self ref's loop reaches out of the left edge of its table (room for the markers at
   * both ends). Layout counts it in the diagram bounds; the renderer draws the loop with it.
   */
  selfLoopReach: 44,
  /** Room for the note icon at the right end of a table header (tables with a note). */
  headerNoteIconWidth: 18,
  /** Column badges (NN / U pills and the note dot), drawn between a column's name and type. */
  badge: {
    fontSize: 9,
    height: 14,
    /** Gap between two badges. */
    gap: 4,
    /** Gap between the badges and the name before / the type after them. */
    margin: 8,
    dotWidth: 6,
  },
} as const;

/** Average glyph width as a fraction of font size, per role (Inter-like proportional / monospace). */
const WIDTH_FACTOR: Record<TextRole, number> = {
  tableName: 0.6,
  columnName: 0.56,
  columnType: 0.6,
  noteText: 0.55,
};

function isWide(ch: string): boolean {
  return ch.codePointAt(0)! > 0x2e80; // CJK and other wide glyphs
}

/**
 * Deterministic text width estimate (no DOM), used in Node, SSR and as the default measure.
 * Browsers may pass a canvas-based TextMeasure for exact widths. Column types are drawn in
 * `monoFontFamily`, so they are estimated as fixed-width (0.6 em per glyph, wide glyphs twice).
 */
export function estimateTextWidth(text: string, role: TextRole): number {
  if (role === 'columnType') {
    let cells = 0;
    for (const ch of text) cells += isWide(ch) ? 2 : 1;
    return Math.ceil(cells * WIDTH_FACTOR.columnType * METRICS.fontSize.columnType);
  }
  let units = 0;
  for (const ch of text) {
    if (/[iljtfI.,:;'|!]/.test(ch)) units += 0.55;
    else if (/[mwMW@]/.test(ch)) units += 1.45;
    else if (/[A-Z]/.test(ch)) units += 1.2;
    else if (isWide(ch)) units += 1.8;
    else units += 1;
  }
  return Math.ceil(units * WIDTH_FACTOR[role] * METRICS.fontSize[role]);
}
