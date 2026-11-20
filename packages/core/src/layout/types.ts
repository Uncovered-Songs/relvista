/** Types for the relvista layout sidecar file (schema.dbml.layout.json), matching schemas/layout.schema.json. */

export const LAYOUT_SCHEMA_ID = 'https://uncovered-songs.github.io/relvista/schemas/layout-1.json';
export const LAYOUT_VERSION = 1;
/** View key for the default view. Named views inherit node placements from it. */
export const DEFAULT_VIEW = '*';
export const DEFAULT_SCHEMA = 'public';

/**
 * Stable node id: "schema.table", "note:<name>" or "group:<name>". Table-id segments that need it are
 * double-quoted (`a."b.c"`), see `tableIdOf`.
 */
export type NodeId = string;
/** Edge id as produced by the diagram model. */
export type RefId = string;

export interface Point {
  x: number;
  y: number;
}

export interface NodeLayout {
  x: number;
  y: number;
  /** Width override; omitted means use the measured width. */
  w?: number;
  /** Height override; omitted means use the measured height. */
  h?: number;
  collapsed?: boolean;
  /** Auto-layout must not move this node. */
  pinned?: boolean;
}

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export type Side = 'top' | 'right' | 'bottom' | 'left';

export interface EdgeLayout {
  waypoints?: Point[];
  sourceSide?: Side;
  targetSide?: Side;
}

/** Node entry of a named view: only the fields that differ from the default view. */
export type NodeOverride = Partial<NodeLayout>;

/** A named view. Its entries merge field by field over the default view (`mergeViewDefaults`). */
export interface ViewLayoutOverride {
  nodes: Record<NodeId, NodeOverride>;
  viewport?: Viewport;
  edges?: Record<RefId, EdgeLayout>;
}

/** The default view ("*"): every node entry has a position. */
export interface ViewLayout extends ViewLayoutOverride {
  nodes: Record<NodeId, NodeLayout>;
}

/** Views by name: the default view ("*") holds full positions, named views hold overrides. */
export type LayoutViews = Record<string, ViewLayoutOverride> & { [DEFAULT_VIEW]?: ViewLayout };

export type DetailLevel = 'all' | 'keys' | 'names';

export interface ThemeHints {
  colorScheme?: 'light' | 'dark' | 'auto';
  showGrid?: boolean;
  edgeStyle?: 'orthogonal' | 'curved' | 'straight';
}

export interface LayoutSettings {
  detailLevel?: DetailLevel;
  theme?: ThemeHints;
  /** Extension keys ("x-…") for third-party tools. */
  [extension: `x-${string}`]: unknown;
}

export interface Layout {
  $schema?: string;
  version: 1;
  views: LayoutViews;
  settings?: LayoutSettings;
  /** Extension keys ("x-…") for third-party tools. */
  [extension: `x-${string}`]: unknown;
}

export interface LayoutError {
  /** JSON Pointer to the offending value ("" for the root). */
  path: string;
  message: string;
}

export type ParseLayoutResult = { ok: true; layout: Layout } | { ok: false; errors: LayoutError[] };
