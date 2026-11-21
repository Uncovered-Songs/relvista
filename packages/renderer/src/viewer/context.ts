import type { DetailLevel } from '@relvista/core';
import { createContext, useContext } from 'react';
import type { HighlightSets, HSide } from '../svg/routing.js';

export interface ViewerState {
  detailLevel: DetailLevel;
  lit: HighlightSets | null;
  /** Whether what `lit` leaves out is dimmed (hover), or only `lit` is emphasised (highlight). */
  dim: boolean;
  hoveredId: string | null;
  /** Table whose details card is open. */
  selectedId: string | null;
  /** `highlightedNodeId` of the canvas (ring + lit refs). */
  highlightedId: string | null;
  /** Nodes selected in the editable canvas. */
  selection: ReadonlySet<string>;
  /** Groups get a header band that can be clicked (and, editable, dragged). */
  groupHandles: boolean;
  /** Table id → handle ids its refs attach to (only those handles are rendered). */
  handles: ReadonlyMap<string, ReadonlySet<string>>;
}

export const ViewerContext = createContext<ViewerState>({
  detailLevel: 'all',
  lit: null,
  dim: true,
  hoveredId: null,
  selectedId: null,
  highlightedId: null,
  selection: new Set(),
  groupHandles: false,
  handles: new Map(),
});

export function useViewerState(): ViewerState {
  return useContext(ViewerContext);
}

/** Handle id for a row (-1 = header) on a side, as source or target. */
export function handleId(row: number, side: HSide, type: 'source' | 'target'): string {
  return `${row < 0 ? 'h' : `c${row}`}-${side[0]}-${type[0]}`;
}

export function parseHandleId(
  id: string,
): { row: number; side: HSide; type: 'source' | 'target' } | null {
  const m = /^(h|c(\d+))-([lr])-([st])$/.exec(id);
  if (!m) return null;
  return {
    row: m[1] === 'h' ? -1 : Number(m[2]),
    side: m[3] === 'l' ? 'left' : 'right',
    type: m[4] === 's' ? 'source' : 'target',
  };
}
