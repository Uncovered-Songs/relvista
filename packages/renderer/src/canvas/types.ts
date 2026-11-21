import type { NodeLayout, SourceSpan } from '@relvista/core';
import type { ColorMode } from '../theme.js';

/** The kind of a canvas node. */
export type CanvasNodeKind = 'table' | 'note' | 'group';

/** 'unpinned': re-place every node without `pinned: true`. 'unplaced': place only nodes with no position. */
export type AutoLayoutScope = 'unpinned' | 'unplaced';

/**
 * Settings written through `setNodeSettings`. `collapsed` on a table: header only; on a group
 * (`group:<name>`): one box in place of its tables (docs/design/phase3-v1.md §3.1).
 */
export type NodeSettings = Partial<Pick<NodeLayout, 'pinned' | 'collapsed'>>;

/** What a reported layout change was, passed to `onLayoutChange` with the next layout. */
export type LayoutChange =
  /** User dragged nodes (tables, notes, or a group = its member tables). One undo step. */
  | { kind: 'move'; view: string; ids: string[] }
  /** Canvas placed nodes that had no saved position (new file, new table). NOT a user edit. */
  | { kind: 'place'; view: string; ids: string[] }
  /** `runAutoLayout` finished. One undo step. */
  | { kind: 'auto-layout'; view: string; scope: AutoLayoutScope; ids: string[] }
  /** `setNodeSettings` through the handle (pin / collapse). One undo step. */
  | { kind: 'settings'; view: string; ids: string[]; settings: NodeSettings }
  /** A note (or table) was resized with the handles (editable). One undo step. */
  | { kind: 'resize'; view: string; ids: string[] };

/** Which nodes get resize handles in editable mode. */
export type CanvasResizable = 'notes' | 'all' | false;

/** Focus mode: only the tables within `hops` refs of `ids` are shown (positions unchanged). */
export interface CanvasFocus {
  /** Table ids at the centre of the focus. */
  ids: string[];
  /** 0..5; tables farther away are hidden (not dimmed). */
  hops: number;
}

/** A pointer event on a ref line. */
export interface CanvasEdgeEvent {
  /** Ref id (the first ref of a merged line). */
  id: string;
  /** The ref's declaration in the source, for reveal. */
  span: SourceSpan | null;
  clientX: number;
  clientY: number;
}

/** A pointer event on the empty canvas. */
export interface CanvasPaneEvent {
  clientX: number;
  clientY: number;
  /** Diagram coordinates of the pointer. */
  x: number;
  y: number;
}

/** A pointer or keyboard event on a canvas node. */
export interface CanvasNodeEvent {
  /** "schema.table" | "note:<name>" | "group:<name>" */
  id: string;
  kind: CanvasNodeKind;
  /** Declaration in the source (model span), for reveal. */
  span: SourceSpan | null;
  clientX: number;
  clientY: number;
  /** Modifier state, so the app can ignore Shift/Cmd clicks used for selection. */
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  /**
   * 'keyboard' when Enter on a focused node produced the click (the editor then moves focus to
   * the code). Absent for pointer clicks.
   */
  source?: 'pointer' | 'keyboard';
}

/** Options of the canvas handle's `exportSvg`, `exportPng` and `print`. */
export interface CanvasExportOptions {
  title?: string;
  /** Default: the canvas's colorMode. */
  colorMode?: ColorMode;
}
