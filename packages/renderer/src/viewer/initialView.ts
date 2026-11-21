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
  /**
   * The table a reader looks for first (the first one declared): when the window can hold it, the
   * first view shows it whole.
   */
  anchor?: Box;
}

/**
 * Screen offset (px) of content `size` px long on an axis of `full` px whose padding leaves
 * `[start, start + avail]` free: centred on the whole axis, so a small diagram sits in the middle
 * of the viewer rather than low under a tall title band, but never under the padding.
 */
export function centredOffset(size: number, full: number, start: number, avail: number): number {
  const lo = start;
  const hi = start + avail - size;
  if (hi <= lo) return start + (avail - size) / 2;
  return Math.min(hi, Math.max(lo, (full - size) / 2));
}

/**
 * Viewport showing the whole diagram, at most `maxZoom`, centred in the viewer (and inside the
 * padded area). Null when the viewer or the diagram has no size.
 */
export function fitViewport(input: Omit<ViewportInput, 'nodes'>): Viewport | null {
  const { bounds: b, width, height, padding: p, maxZoom } = input;
  const aw = width - p.left - p.right;
  const ah = height - p.top - p.bottom;
  if (!(aw > 0) || !(ah > 0) || !(b.width > 0) || !(b.height > 0)) return null;
  const zoom = Math.min(aw / b.width, ah / b.height, maxZoom);
  return {
    x: centredOffset(b.width * zoom, width, p.left, aw) - b.x * zoom,
    y: centredOffset(b.height * zoom, height, p.top, ah) - b.y * zoom,
    zoom,
  };
}

/**
 * First view: the fit, unless that is below `fitFloor` (default `minZoom`). A diagram too big for
 * that opens at `minZoom` (readable), or lower down to `fitFloor` when that fills one axis (the
 * spare room is used, not left as empty bands), on the window that shows the most whole tables:
 *
 * - every candidate window has a table or group edge, or the diagram's own edge, on a padded
 *   viewer edge, so tables at the borders are whole rather than sliced;
 * - tables cut by the window (or left under the overlays in the padding) count against it, more
 *   so at the top and left where a reader starts; tables hidden entirely just left of or above
 *   the window cost more than their area (the reader would not know they exist); a group whose label is
 *   cut off costs too;
 * - a table under an overlay (`obstacles`, e.g. the minimap) counts as not shown, and a bit
 *   more; candidates that end a table just before the overlay are tried too (the canvas holds the
 *   minimap back when the chosen window still covers a table);
 * - the window never extends past the diagram's bounds (no empty canvas beyond the edges) and its
 *   content starts at the padding, never under the title / toolbar band;
 * - when the window can hold the first declared table (`anchor`), it does;
 * - ties go to the window nearest the diagram's top-left corner, where a reader starts.
 */
/** Cost, in multiples of its area, of a table hidden left of or above the first view. */
const HIDDEN_BEFORE_COST = 1.5;
/**
 * Cost, in multiples of its area, of a table under an overlay such as the minimap: it counts as
 * not shown, and a little more, so a window that keeps it clear wins over one that does not.
 */
const OBSTACLE_COST = 0.25;

export function initialViewport(
  input: ViewportInput & {
    minZoom: number;
    /** Padding of the fit, when it differs (e.g. room for the minimap all along the bottom). */
    fitPadding?: Padding;
    /**
     * Lowest zoom the first view uses to show the whole diagram, or to fill one axis of it
     * (small diagrams, phones). Default `minZoom`.
     */
    fitFloor?: number;
  },
): Viewport | null {
  const fit = fitViewport({ ...input, padding: input.fitPadding ?? input.padding });
  const floor = Math.min(input.fitFloor ?? input.minZoom, input.minZoom);
  if (!fit || fit.zoom >= floor || input.nodes.length === 0) return fit;
  const { bounds: b, width, height, padding: p, nodes } = input;
  const groups = input.groups ?? [];
  const obstacles = input.obstacles ?? [];
  const aw = width - p.left - p.right;
  const ah = height - p.top - p.bottom;
  // Between the floor and the readable zoom, the zoom that fills one axis exactly: the diagram
  // pans along the other one only.
  const fill = Math.min(input.maxZoom, Math.max(aw / b.width, ah / b.height));
  const zoom = fill >= floor && fill < input.minZoom ? fill : input.minZoom;
  // World size of the visible window.
  const ww = aw / zoom;
  const wh = ah / zoom;

  /** Candidate window starts (world) along one axis. */
  const starts = (
    start: number,
    size: number,
    avail: number,
    boxes: readonly { s: number; e: number }[],
    /** Window offsets (world) at which an overlay starts: a box may end just before one. */
    stops: readonly number[],
    /** The axis on screen: its full length and padding start (px). */
    axis: { full: number; pad: number },
  ): number[] => {
    if (size <= avail) {
      // The whole diagram fits along this axis: centred in the viewer (see `centredOffset`).
      const at = centredOffset(size * zoom, axis.full, axis.pad, avail * zoom);
      return [start - (at - axis.pad) / zoom];
    }
    const lo = start;
    const hi = start + size - avail;
    const out = new Set<number>([lo, hi]);
    for (const box of boxes) {
      for (const v of [box.s, box.e - avail, ...stops.map((o) => box.e - o)])
        out.add(Math.min(hi, Math.max(lo, v)));
    }
    return Array.from(out);
  };
  const all = [...nodes, ...groups];
  // Overlays in world units relative to the window's top-left corner.
  const obs = obstacles.map((o) => ({
    x: (o.x - p.left) / zoom,
    y: (o.y - p.top) / zoom,
    w: o.width / zoom,
    h: o.height / zoom,
  }));
  const xs = starts(
    b.x,
    b.width,
    ww,
    all.map((n) => ({ s: n.x, e: n.x + n.width })),
    obs.filter((o) => o.x > 0 && o.x < ww).map((o) => o.x),
    { full: width, pad: p.left },
  );
  const ys = starts(
    b.y,
    b.height,
    wh,
    all.map((n) => ({ s: n.y, e: n.y + n.height })),
    obs.filter((o) => o.y > 0 && o.y < wh).map((o) => o.y),
    { full: height, pad: p.top },
  );

  const diag = Math.hypot(b.width, b.height) || 1;
  // The padding band around the window is canvas too (under the title, toolbar and minimap).
  const [pl, pr, pt, pb] = [p.left / zoom, p.right / zoom, p.top / zoom, p.bottom / zoom];
  // Windows that hold the anchor whole, when any does.
  const a = input.anchor;
  const holds = (v: number, s: number, e: number, size: number) =>
    s >= v - 0.5 && e <= v + size + 0.5;
  const ax = a ? xs.filter((x) => holds(x, a.x, a.x + a.width, ww)) : [];
  const ay = a ? ys.filter((y) => holds(y, a.y, a.y + a.height, wh)) : [];
  if (a) {
    // A window starting at the anchor (or ending at it) is always a candidate.
    for (const v of [a.x, a.x + a.width - ww]) {
      const c = Math.min(b.x + Math.max(0, b.width - ww), Math.max(b.x, v));
      if (b.width > ww && holds(c, a.x, a.x + a.width, ww)) ax.push(c);
    }
    for (const v of [a.y, a.y + a.height - wh]) {
      const c = Math.min(b.y + Math.max(0, b.height - wh), Math.max(b.y, v));
      if (b.height > wh && holds(c, a.y, a.y + a.height, wh)) ay.push(c);
    }
  }
  const xc = ax.length ? ax : xs;
  const yc = ay.length ? ay : ys;
  let best = { x: xc[0]!, y: yc[0]!, score: -Infinity };
  for (const x0 of xc) {
    for (const y0 of yc) {
      const x1 = x0 + ww;
      const y1 = y0 + wh;
      let score = 0;
      for (const n of nodes) {
        const nx1 = n.x + n.width;
        const ny1 = n.y + n.height;
        const area = n.width * n.height;
        // Under an overlay (whole or sliced, the canvas draws it there): it counts as not shown.
        if (
          obs.some(
            (o) =>
              Math.min(nx1, x0 + o.x + o.w) > Math.max(n.x, x0 + o.x) &&
              Math.min(ny1, y0 + o.y + o.h) > Math.max(n.y, y0 + o.y),
          )
        ) {
          score -= OBSTACLE_COST * area;
          continue;
        }
        // Not on screen at all. Just left of the window (in its rows) or just above it (in its
        // columns), where a reader expects the start of the diagram, a hidden table costs more
        // than its area: its refs run off the edge to nothing, so a window never skips the first
        // column for one or two more whole tables.
        const rows = ny1 > y0 && n.y < y1;
        const cols = nx1 > x0 && n.x < x1;
        if ((nx1 <= x0 - pl && rows) || (ny1 <= y0 - pt && cols)) {
          score -= HIDDEN_BEFORE_COST * area;
          continue;
        }
        if (nx1 <= x0 - pl || n.x >= x1 + pr || ny1 <= y0 - pt || n.y >= y1 + pb) continue;
        const ix = Math.max(0, Math.min(x1, nx1) - Math.max(x0, n.x));
        const iy = Math.max(0, Math.min(y1, ny1) - Math.max(y0, n.y));
        const seen = ix * iy;
        if (seen >= area - 0.5) {
          score += area;
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
