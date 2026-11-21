import type { NodeLayout, SourceSpan } from '@relvista/core';
import type { ColorMode } from '../theme.js';

export type CanvasNodeKind = 'table' | 'note' | 'group';

/** 'unpinned': re-place every node without `pinned: true`. 'unplaced': place only nodes with no position. */
export type AutoLayoutScope = 'unpinned' | 'unplaced';

export type NodeSettings = Partial<Pick<NodeLayout, 'pinned' | 'collapsed'>>;

export type LayoutChange =
  /** User dragged nodes (tables, notes, or a group = its member tables). One undo step. */
  | { kind: 'move'; view: string; ids: string[] }
  /** Canvas placed nodes that had no saved position (new file, new table). NOT a user edit. */
  | { kind: 'place'; view: string; ids: string[] }
  /** `runAutoLayout` finished. One undo step. */
  | { kind: 'auto-layout'; view: string; scope: AutoLayoutScope; ids: string[] }
  /** `setNodeSettings` through the handle (pin / collapse). One undo step. */
  | { kind: 'settings'; view: string; ids: string[]; settings: NodeSettings };

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

export interface CanvasExportOptions {
  title?: string;
  /** Default: the canvas's colorMode. */
  colorMode?: ColorMode;
}
