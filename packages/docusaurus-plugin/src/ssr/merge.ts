// Browser-safe and dependency-free (it is part of every page's bundle): the build-time positions
// merged into the layout the interactive viewer gets.
import type { Layout, NodeLayout, ViewLayout } from '@relvista/core';
import type { SsrPayload } from './types.js';

const DEFAULT_VIEW = '*';

/**
 * `layout` with the payload's positions written into the view they belong to, so
 * `mergeViewDefaults(result, view)` gives every node a position: the viewer then runs no layout
 * engine (no ELK in the browser) and draws what the static SVG shows. Sizes, flags, viewports and
 * settings of `layout` are kept.
 */
export function layoutWithPositions(layout: Layout | null, payload: SsrPayload): Layout {
  const base: Layout = layout ?? { version: 1, views: {} };
  const views: Layout['views'] = { ...base.views };
  const key = payload.view || DEFAULT_VIEW;
  const current = Object.prototype.hasOwnProperty.call(views, key) ? views[key] : undefined;
  const nodes: Record<string, Partial<NodeLayout>> = { ...(current?.nodes ?? {}) };
  for (const id of Object.keys(payload.positions)) {
    const p = payload.positions[id]!;
    nodes[id] = { ...nodes[id], x: p.x, y: p.y };
  }
  views[key] = { ...(current ?? {}), nodes } as ViewLayout;
  if (key !== DEFAULT_VIEW && !views[DEFAULT_VIEW]) views[DEFAULT_VIEW] = { nodes: {} };
  return { ...base, views };
}
