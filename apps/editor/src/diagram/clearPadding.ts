/** Room a fit keeps free for the overlays drawn over the diagram (pure, unit-tested). */

/** Gap (px) between an overlay and the framed nodes. */
const CLEARANCE = 12;

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Padding (px from each pane edge) that keeps a fit clear of the overlays drawn over the canvas.
 * An overlay at least half the pane's height covers a side (the wide Changes panel: right); any
 * other covers the top or the bottom strip, by where its centre is (toolbar and legend chip at the
 * top, the narrow Changes bottom sheet at the bottom). Pure, for tests.
 */
export function clearPadding(
  pane: Rect,
  overlays: Rect[],
): { top: number; right: number; bottom: number; left: number } {
  const pad = { top: 0, right: 0, bottom: 0, left: 0 };
  const w = pane.right - pane.left;
  const h = pane.bottom - pane.top;
  if (w <= 0 || h <= 0) return pad;
  for (const r of overlays) {
    const left = Math.max(r.left, pane.left);
    const right = Math.min(r.right, pane.right);
    const top = Math.max(r.top, pane.top);
    const bottom = Math.min(r.bottom, pane.bottom);
    if (right <= left || bottom <= top) continue;
    if (bottom - top >= h / 2) {
      if ((left + right) / 2 > pane.left + w / 2)
        pad.right = Math.max(pad.right, pane.right - left + CLEARANCE);
      else pad.left = Math.max(pad.left, right - pane.left + CLEARANCE);
    } else if ((top + bottom) / 2 < pane.top + h / 2) {
      pad.top = Math.max(pad.top, bottom - pane.top + CLEARANCE);
    } else {
      pad.bottom = Math.max(pad.bottom, pane.bottom - top + CLEARANCE);
    }
  }
  return pad;
}
