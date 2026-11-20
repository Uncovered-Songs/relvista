/**
 * Pure viewport maths for the interactive viewer: the Fit view and the first view of a diagram.
 * No React Flow, no DOM, so it is unit-tested directly.
 */
import type { Box } from '@relvista/core';

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export interface Padding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ViewportInput {
  /** Diagram bounds (world coordinates). */
  bounds: Box;
  /** Tables and sticky notes (world coordinates). */
  nodes: readonly Box[];
  /** Group boxes; their top-left corner carries the group label. */
  groups?: readonly Box[];
  /** Viewer size in px. */
  width: number;
  height: number;
  /** Room kept free for the overlays (title, toolbar, minimap) at each edge. */
  padding: Padding;
  maxZoom: number;
  /**
   * Overlays inside the padded area (screen px, relative to the viewer), such as the minimap in a
   * corner: the first view avoids putting tables under them.
   */
  obstacles?: readonly Box[];
}

/**
 * Viewport showing the whole diagram centred in the padded area, at most `maxZoom`. Null when the
 * viewer or the diagram has no size.
 */
export function fitViewport(input: Omit<ViewportInput, 'nodes'>): Viewport | null {
  const { bounds: b, width, height, padding: p, maxZoom } = input;
  const aw = width - p.left - p.right;
  const ah = height - p.top - p.bottom;
  if (!(aw > 0) || !(ah > 0) || !(b.width > 0) || !(b.height > 0)) return null;
  const zoom = Math.min(aw / b.width, ah / b.height, maxZoom);
  return {
    x: p.left + (aw - b.width * zoom) / 2 - b.x * zoom,
    y: p.top + (ah - b.height * zoom) / 2 - b.y * zoom,
    zoom,
  };
}

/**
 * First view: the fit, unless that is below `minZoom`. A diagram too big for that opens at
 * `minZoom` (readable) on the window that shows the most whole tables:
 *
 * - every candidate window has a table or group edge, or the diagram's own edge, on a padded
 *   viewer edge, so tables at the borders are whole rather than sliced;
 * - tables cut by the window (or left under the overlays in the padding) count against it, more
 *   so at the top and left where a reader starts; a group whose label is cut off costs too;
 * - the window never extends past the diagram's bounds (no empty canvas beyond the edges) and its
 *   content starts at the padding, never under the title / toolbar band;
 * - ties go to the window nearest the diagram's top-left corner, where a reader starts.
 */
export function initialViewport(
  input: ViewportInput & {
    minZoom: number;
    /** Padding of the fit, when it differs (e.g. room for the minimap all along the bottom). */
    fitPadding?: Padding;
  },
): Viewport | null {
  const fit = fitViewport({ ...input, padding: input.fitPadding ?? input.padding });
  if (!fit || fit.zoom >= input.minZoom || input.nodes.length === 0) return fit;
  const { bounds: b, width, height, padding: p, nodes, minZoom: zoom } = input;
  const groups = input.groups ?? [];
  const obstacles = input.obstacles ?? [];
  const aw = width - p.left - p.right;
  const ah = height - p.top - p.bottom;
  // World size of the visible window.
  const ww = aw / zoom;
  const wh = ah / zoom;

  /** Candidate window starts (world) along one axis. */
  const starts = (
    start: number,
    size: number,
    avail: number,
    boxes: readonly { s: number; e: number }[],
  ): number[] => {
    if (size <= avail) return [start - (avail - size) / 2];
    const lo = start;
    const hi = start + size - avail;
    const out = new Set<number>([lo, hi]);
    for (const box of boxes) {
      for (const v of [box.s, box.e - avail]) out.add(Math.min(hi, Math.max(lo, v)));
    }
    return [...out];
  };
  const all = [...nodes, ...groups];
  const xs = starts(
    b.x,
    b.width,
    ww,
    all.map((n) => ({ s: n.x, e: n.x + n.width })),
  );
  const ys = starts(
    b.y,
    b.height,
    wh,
    all.map((n) => ({ s: n.y, e: n.y + n.height })),
  );

  const diag = Math.hypot(b.width, b.height) || 1;
  // The padding band around the window is canvas too (under the title, toolbar and minimap).
  const [pl, pr, pt, pb] = [p.left / zoom, p.right / zoom, p.top / zoom, p.bottom / zoom];
  let best = { x: xs[0]!, y: ys[0]!, score: -Infinity };
  for (const x0 of xs) {
    for (const y0 of ys) {
      const x1 = x0 + ww;
      const y1 = y0 + wh;
      let score = 0;
      for (const n of nodes) {
        const nx1 = n.x + n.width;
        const ny1 = n.y + n.height;
        // Not on screen at all.
        if (nx1 <= x0 - pl || n.x >= x1 + pr || ny1 <= y0 - pt || n.y >= y1 + pb) continue;
        const area = n.width * n.height;
        const ix = Math.max(0, Math.min(x1, nx1) - Math.max(x0, n.x));
        const iy = Math.max(0, Math.min(y1, ny1) - Math.max(y0, n.y));
        const seen = ix * iy;
        if (seen >= area - 0.5) {
          // Whole, unless an overlay covers part of it.
          let covered = 0;
          for (const o of obstacles) {
            const ox0 = x0 + (o.x - p.left) / zoom;
            const oy0 = y0 + (o.y - p.top) / zoom;
            const cx = Math.min(nx1, ox0 + o.width / zoom) - Math.max(n.x, ox0);
            const cy = Math.min(ny1, oy0 + o.height / zoom) - Math.max(n.y, oy0);
            if (cx > 0 && cy > 0) covered += cx * cy;
          }
          score += area - 2 * covered;
          continue;
        }
        // A sliced table (or one under the overlays) costs what is hidden of it; sliced at the
        // top or left, where a reader starts, it costs its whole area again.
        const early = n.y < y0 - 0.5 || n.x < x0 - 0.5;
        score += seen - (area - seen) - (early ? area : 0);
      }
      for (const g of groups) {
        const visible = g.x < x1 && g.x + g.width > x0 && g.y < y1 && g.y + g.height > y0;
        const labelIn = g.x >= x0 - 0.5 && g.x < x1 && g.y >= y0 - 0.5 && g.y < y1;
        if (visible && !labelIn) score -= 0.1 * ww * wh;
      }
      // Tie-break: nearer the top-left corner of the diagram.
      score -= (Math.hypot(x0 - b.x, y0 - b.y) / diag) * 1e-3 * ww * wh;
      if (score > best.score) best = { x: x0, y: y0, score };
    }
  }
  return { x: p.left - best.x * zoom, y: p.top - best.y * zoom, zoom };
}
