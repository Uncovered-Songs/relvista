import type { DetailLevel } from '@relvista/core';
import { createContext, useContext } from 'react';
import type { HighlightSets, HSide } from '../svg/routing.js';

export interface ViewerState {
  detailLevel: DetailLevel;
  lit: HighlightSets | null;
  hoveredId: string | null;
  selectedId: string | null;
  /** Table id → handle ids its refs attach to (only those handles are rendered). */
  handles: ReadonlyMap<string, ReadonlySet<string>>;
}

export const ViewerContext = createContext<ViewerState>({
  detailLevel: 'all',
  lit: null,
  hoveredId: null,
  selectedId: null,
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
