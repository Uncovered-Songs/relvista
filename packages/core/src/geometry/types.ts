/**
 * Phase-1 contract between @relvista/core (layout) and @relvista/renderer (drawing).
 * See docs/design/phase1-contracts.md. Change only with both sides updated.
 */
import type { DetailLevel, ViewLayout } from '../layout/types.js';

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A placed table or sticky note. Coordinates are diagram units (1 unit = 1 CSS px at zoom 1), top-left origin. */
export interface NodeGeometry extends Box {
  id: string;
  kind: 'table' | 'note';
  /**
   * Detail level this table was measured at, when it differs from the layout's `detailLevel`
   * (a saved `collapsed: true` node is laid out at 'names'). Renderers draw the table, and attach
   * its refs, at this level.
   */
  detailLevel?: DetailLevel;
}

/** A TableGroup's enclosing rectangle, computed around its visible tables. */
export interface GroupGeometry extends Box {
  id: string;
}

/**
 * Optional polyline route for a ref (from ELK). Renderers may ignore it and route themselves.
 * `points[0]` lies on the edge of the `ref.from` table, the last point on the `ref.to` table,
 * whatever direction the layout engine used internally.
 */
export interface EdgeGeometry {
  id: string;
  points: Array<{ x: number; y: number }>;
}

export interface DiagramGeometry {
  nodes: Record<string, NodeGeometry>;
  groups: Record<string, GroupGeometry>;
  edges: Record<string, EdgeGeometry>;
  bounds: Box;
}

export type TextRole = 'tableName' | 'columnName' | 'columnType' | 'noteText';

/** Returns the rendered width in px of `text` in the given role's font. */
export type TextMeasure = (text: string, role: TextRole) => number;

export interface LayoutOptions {
  /** 'elk' (default, async, best), 'dagre' (fast, sync), 'grid' (trivial fallback). */
  engine?: 'elk' | 'dagre' | 'grid';
  direction?: 'RIGHT' | 'DOWN';
  detailLevel?: DetailLevel;
  /** Saved positions for this view; nodes with x/y keep them, the rest are placed around them. */
  saved?: Partial<ViewLayout> | null;
  /** Defaults to estimateTextWidth (deterministic, works in Node/SSR). */
  measure?: TextMeasure;
  /**
   * Width / height of the viewport the diagram will be shown in (default 1.6, clamped to
   * 0.25..4). Disconnected parts of the schema and sticky notes are packed to match it.
   */
  aspectRatio?: number;
}
