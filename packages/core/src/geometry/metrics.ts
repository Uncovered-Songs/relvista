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
  noteWidth: 220,
  notePadding: 12,
  noteLineHeight: 18,
  noteMinHeight: 64,
  groupPadding: 24,
  groupHeaderHeight: 28,
  cornerRadius: 8,
} as const;

/** Average glyph width as a fraction of font size, per role (Inter-like proportional / monospace). */
const WIDTH_FACTOR: Record<TextRole, number> = {
  tableName: 0.6,
  columnName: 0.56,
  columnType: 0.6,
  noteText: 0.55,
};

/**
 * Deterministic text width estimate (no DOM), used in Node, SSR and as the default measure.
 * Browsers may pass a canvas-based TextMeasure for exact widths.
 */
export function estimateTextWidth(text: string, role: TextRole): number {
  let units = 0;
  for (const ch of text) {
    if (/[iljtfI.,:;'|!]/.test(ch)) units += 0.55;
    else if (/[mwMW@]/.test(ch)) units += 1.45;
    else if (/[A-Z]/.test(ch)) units += 1.2;
    else if (ch.codePointAt(0)! > 0x2e80)
      units += 1.8; // CJK and wide glyphs
    else units += 1;
  }
  return Math.ceil(units * WIDTH_FACTOR[role] * METRICS.fontSize[role]);
}
