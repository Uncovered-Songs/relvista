/**
 * The interactive viewer's first view as a pure function of the diagram and the viewer's size:
 * the constants and rules `DiagramCanvas` (first view, minimap) and `DbmlViewer` (padding of its
 * chrome, height on phones) apply, shared with pictures drawn without a canvas (the Docusaurus
 * plugin's build-time SVG), so both open on the same window.
 */
import type { Box, DiagramGeometry, DiagramModel } from '@relvista/core';
import {
  fitViewport,
  initialViewportDetail,
  type InitialViewportDetail,
  type Padding,
} from '../viewer/initialView.js';
import { placedBox } from './useCanvasGeometry.js';

/** Room for the title and toolbar overlays at the top, a small margin elsewhere. */
export const PAD = { top: 64, right: 28, bottom: 28, left: 28 } as const;
/** Minimap size (px) and its distance from the canvas's bottom-right corner. */
export const MINIMAP = { width: 120, height: 80, margin: 12 } as const;
/** The smaller minimap of narrow canvases (phones, a pane narrowed by a splitter). */
export const MINIMAP_NARROW = { width: 84, height: 56, margin: 10 } as const;
/** Below this width the canvas counts as narrow (phones): small minimap, more overview. */
export const NARROW = 600;
/**
 * The 'auto' minimap is always on for diagrams of this many tables in wide canvases; otherwise it
 * appears whenever part of the diagram is off-screen (the cue that there is more to see).
 */
export const MINIMAP_MIN_TABLES = 8;
/**
 * The first view never zooms out further than this (column text at 12.5 × 0.85 ≈ 10.6px); bigger
 * diagrams open readable on their densest corner and pan. Phones get a little more overview.
 */
export const MIN_INITIAL_ZOOM = 0.85;
export const MIN_INITIAL_ZOOM_NARROW = 0.75;
/**
 * The first view still fits (or fills one axis) down to this zoom rather than hide tables at the
 * readable one: small diagrams open whole, as most editors open them.
 */
export const FIT_FLOOR = 0.55;
/** Fit floor of diagrams of at most `SMALL_DIAGRAM_TABLES` tables. */
export const FIT_FLOOR_SMALL = 0.45;
/** Fit floor of narrow canvases (phones). */
export const FIT_FLOOR_NARROW = 0.5;
export const SMALL_DIAGRAM_TABLES = 12;
/** Largest zoom of the first view and Fit: a small diagram opens a little above 1:1, centred. */
export const MAX_FIT_ZOOM = 1.15;
/** Width (px) of the viewer's border on each side: the canvas is this much smaller. */
export const VIEWER_BORDER = 1;
/** Bottom edge of the viewer's chips row (diff legend, focus chip) under the toolbar. */
export const CHIPS_BOTTOM = 54 + 32;
/** Room the narrow viewer keeps under the diagram for its title chip. */
export const NARROW_TITLE = 36;

export interface CanvasFirstViewInput {
  geometry: DiagramGeometry;
  /** The model drawn (its table count and first table matter). */
  model: DiagramModel | null;
  /** Canvas size, px. */
  width: number;
  height: number;
  /** The canvas's padding (`PAD` and the host's `padding` prop). */
  padding: Padding;
  minimap: boolean | 'auto';
}

export interface CanvasFirstView {
  /** Null when the canvas has no size or the diagram none: the canvas fits instead. */
  detail: InitialViewportDetail | null;
  /** Whether the minimap waits (it would cover a table of the first view). */
  minimapHeld: boolean;
}

/** Whether a canvas this wide counts as narrow (`NARROW`). */
export const isNarrow = (width: number): boolean => width < NARROW;

/** Whether the 'auto' minimap is shown whatever the viewport. */
export function minimapAlwaysShown(
  minimap: boolean | 'auto',
  width: number,
  tables: number,
): boolean {
  return (
    minimap === true || (minimap === 'auto' && !isNarrow(width) && tables >= MINIMAP_MIN_TABLES)
  );
}

/**
 * The canvas's first view: the fit, but never below the readable floor; a bigger diagram opens at
 * that zoom on the window showing the most whole tables (see `initialViewport`).
 */
export function canvasFirstView(input: CanvasFirstViewInput): CanvasFirstView {
  const { geometry: g, model, width, height, padding: base, minimap } = input;
  const narrow = isNarrow(width);
  const mini = narrow ? MINIMAP_NARROW : MINIMAP;
  const tables = model?.tables.length ?? 0;
  const minimapAlways = minimapAlwaysShown(minimap, width, tables);
  const minZoom = narrow ? MIN_INITIAL_ZOOM_NARROW : MIN_INITIAL_ZOOM;
  const s = { width, height };
  const withMinimap = { ...base, bottom: base.bottom + mini.height + mini.margin };
  // A first view that cannot show everything gets the 'auto' minimap as the cue.
  const fitBare = fitViewport({ bounds: g.bounds, ...s, padding: base, maxZoom: 1 });
  const overflows = !!fitBare && fitBare.zoom < minZoom;
  const minimapPlanned = minimapAlways || (minimap === 'auto' && overflows);
  // The minimap only takes the bottom-right corner: a first view that cannot show everything
  // uses the full height and keeps tables out from under it.
  const minimapBox: Box = {
    x: width - mini.margin - mini.width,
    y: height - mini.margin - mini.height,
    width: mini.width,
    height: mini.height,
  };
  const first = model?.tables[0];
  const anchor = first ? placedBox(g, first.id) : undefined;
  const cards = [...Object.values(g.nodes), ...Object.values(g.groups).filter((x) => x.collapsed)];
  const detail = initialViewportDetail({
    ...(anchor ? { anchor } : {}),
    bounds: g.bounds,
    nodes: cards,
    groups: Object.values(g.groups),
    ...s,
    fitPadding: minimapAlways ? withMinimap : base,
    padding: base,
    ...(minimapPlanned ? { obstacles: [minimapBox] } : {}),
    maxZoom: MAX_FIT_ZOOM,
    minZoom,
    fitFloor: narrow
      ? FIT_FLOOR_NARROW
      : tables <= SMALL_DIAGRAM_TABLES
        ? FIT_FLOOR_SMALL
        : FIT_FLOOR,
  });
  const vp = detail?.viewport;
  // The minimap never covers a table in the first view: when no window avoids it, it waits.
  const minimapHeld =
    !!vp &&
    minimapPlanned &&
    cards.some((n) => {
      const x = vp.x + n.x * vp.zoom;
      const y = vp.y + n.y * vp.zoom;
      return (
        x < minimapBox.x + minimapBox.width &&
        x + n.width * vp.zoom > minimapBox.x &&
        y < minimapBox.y + minimapBox.height &&
        y + n.height * vp.zoom > minimapBox.y
      );
    });
  return { detail, minimapHeld };
}

/**
 * Padding `DbmlViewer` gives its canvas (besides `PAD`): the title chip at the bottom of a narrow
 * viewer, the chips row (diff legend, focus chip) under the toolbar when there is a title or the
 * viewer is narrow.
 */
export function viewerPadding(o: {
  narrow: boolean;
  title: boolean;
  chips: boolean;
}): Partial<Padding> | undefined {
  const chipsBelowToolbar = o.chips && (o.narrow || o.title);
  if (o.narrow && o.title)
    return {
      bottom: PAD.bottom + NARROW_TITLE,
      ...(chipsBelowToolbar ? { top: CHIPS_BOTTOM + 10 } : {}),
    };
  return chipsBelowToolbar ? { top: CHIPS_BOTTOM + 10 } : undefined;
}

/**
 * Height (px) of a narrow `DbmlViewer` asked for `height` px: what the diagram needs at its
 * initial zoom (a wide diagram would sit in a tall, mostly empty box), at least `floor`, never more
 * than asked. `width` is the viewer's outer width.
 */
export function narrowViewerHeight(o: {
  bounds: Box;
  width: number;
  height: number;
  padding: Padding;
  minimap: boolean | 'auto';
  floor?: number;
}): number {
  const b = o.bounds;
  const aw = o.width - o.padding.left - o.padding.right;
  if (!(b.width > 0 && b.height > 0)) return o.height;
  const z = Math.max(FIT_FLOOR_NARROW, Math.min(aw / b.width, MAX_FIT_ZOOM));
  // A diagram wider than the viewer gets the 'auto' minimap (the off-screen cue): room for it.
  const showMinimap = o.minimap === true || (o.minimap === 'auto' && b.width * z > aw + 1);
  const pad = showMinimap
    ? { ...o.padding, bottom: o.padding.bottom + MINIMAP_NARROW.height + MINIMAP_NARROW.margin }
    : o.padding;
  const need = Math.ceil(b.height * z + pad.top + pad.bottom);
  return Math.min(o.height, Math.max(o.floor ?? 280, need));
}

/** Input of `viewerFirstView`. */
export interface ViewerFirstViewInput {
  /** The diagram's geometry, as the viewer draws it (every node placed). */
  geometry: DiagramGeometry;
  /** The model drawn (view-selected; merged for a diff). */
  model: DiagramModel;
  /** The viewer's outer width, px (border included). */
  width: number;
  /** The viewer's `height` prop, px. */
  height: number;
  /** Whether the viewer has a `title`. */
  title: boolean;
  /** Whether the chips row is shown (a diff legend). */
  chips: boolean;
  /** The viewer's `minimap` prop. */
  minimap: boolean | 'auto';
}

/**
 * How a first view frames the diagram: the viewport (screen offset of the diagram's origin and
 * zoom), how the zoom was chosen ('fit': the whole diagram; 'fill-x' / 'fill-y': that axis exactly
 * filled; 'fixed': the readable zoom) and, per axis, whether the diagram is centred (null) or the
 * window starts at that diagram coordinate.
 */
export interface FirstViewFrame {
  viewport: { x: number; y: number; zoom: number };
  zoom: 'fit' | 'fill-x' | 'fill-y' | 'fixed';
  startX: number | null;
  startY: number | null;
}

/** The first view of a `DbmlViewer` (see `viewerFirstView`). */
export interface ViewerFirstView {
  /** Outer height of the viewer, px (a narrow viewer shrinks to its diagram). */
  height: number;
  /** Size of its canvas, px (inside the border). */
  canvas: { width: number; height: number };
  /** The canvas's padding, px. */
  padding: { top: number; right: number; bottom: number; left: number };
  /** The padding of a first view that fits (room for a minimap shown whatever the viewport). */
  fitPadding: { top: number; right: number; bottom: number; left: number };
  /** How the first view frames the diagram; null when there is nothing to frame. */
  detail: FirstViewFrame | null;
}

/**
 * The view a `DbmlViewer` of this size opens on, without mounting one: what a static picture of
 * the diagram (the Docusaurus plugin's build-time SVG) needs to be framed exactly like the
 * interactive viewer that replaces it.
 */
export function viewerFirstView(input: ViewerFirstViewInput): ViewerFirstView {
  const narrow = isNarrow(input.width);
  const padding: Padding = {
    ...PAD,
    ...viewerPadding({ narrow, title: input.title, chips: input.chips }),
  };
  const height = narrow
    ? narrowViewerHeight({
        bounds: input.geometry.bounds,
        width: input.width,
        height: input.height,
        padding,
        minimap: input.minimap,
      })
    : input.height;
  const canvas = {
    width: input.width - 2 * VIEWER_BORDER,
    height: height - 2 * VIEWER_BORDER,
  };
  const { detail } = canvasFirstView({
    geometry: input.geometry,
    model: input.model,
    ...canvas,
    padding,
    minimap: input.minimap,
  });
  const mini = isNarrow(canvas.width) ? MINIMAP_NARROW : MINIMAP;
  const fitPadding = minimapAlwaysShown(input.minimap, canvas.width, input.model.tables.length)
    ? { ...padding, bottom: padding.bottom + mini.height + mini.margin }
    : padding;
  return { height, canvas, padding, fitPadding, detail };
}
