import type { Ref } from '@relvista/core';
import type { Edge, EdgeProps } from '@xyflow/react';
import { memo, type ReactElement } from 'react';
import { RefSvg } from '../svg/RefSvg.js';
import type { RefRoute } from '../svg/routing.js';
import { useViewerState } from './context.js';

export type RefFlowEdge = Edge<{ refModel: Ref; route: RefRoute }, 'rvRef'>;

/**
 * Draws the ref from the shared route (same as the static SVG), not from React Flow's handle
 * coordinates; the per-column handles only anchor the edge for React Flow.
 */
export const RefEdge = memo(function RefEdge({
  id,
  data,
}: EdgeProps<RefFlowEdge>): ReactElement | null {
  const v = useViewerState();
  if (!data) return null;
  const state = v.lit ? (v.lit.refs.has(id) ? 'highlight' : 'dim') : 'normal';
  return <RefSvg refModel={data.refModel} route={data.route} state={state} />;
});

export const edgeTypes = { rvRef: RefEdge };
