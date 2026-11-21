import { estimateTextWidth, type TextMeasure, type TextRole } from '@relvista/core';

/** Shortens `text` with an ellipsis so it fits `maxWidth` in the role's font. */
export function truncate(
  text: string,
  role: TextRole,
  maxWidth: number,
  measure: TextMeasure = estimateTextWidth,
): string {
  if (maxWidth <= 0) return '';
  if (measure(text, role) <= maxWidth) return text;
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(chars.slice(0, mid).join('') + '…', role) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? '…' : chars.slice(0, lo).join('') + '…';
}

/** Baseline y that visually centres a line of text of `fontSize` on `centerY`. */
export function baseline(centerY: number, fontSize: number): number {
  return Math.round((centerY + fontSize * 0.36) * 100) / 100;
}
