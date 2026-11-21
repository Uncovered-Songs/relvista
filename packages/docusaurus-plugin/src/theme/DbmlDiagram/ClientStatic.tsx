import { useMemo, type ReactNode } from 'react';
import {
  layoutDiagramSync,
  needsElk,
  parseLayout,
  type Layout,
  type ViewLayout,
} from '@relvista/core';
import { StaticBox, placedGeometry, positionsOf, prepareStatic } from '../../ssr/build.js';
import type { StaticRequest } from '../../ssr/types.js';

/**
 * The static picture after a client-side navigation (no server HTML): drawn from the sync layout
 * when the viewer would not run ELK either (`needsElk` false), else the placeholder. Loaded with
 * the viewer chunk.
 */
export default function ClientStatic({
  request,
  placeholder,
}: {
  request: StaticRequest;
  placeholder: ReactNode;
}): ReactNode {
  const box = useMemo(() => {
    if (request.value === undefined || typeof request.layout === 'string') return null;
    let layout: Layout | null = null;
    if (request.layout) {
      const parsed = parseLayout(request.layout);
      if (!parsed.ok) return null;
      layout = parsed.layout;
    }
    const prepared = prepareStatic({
      source: request.value,
      layout,
      ...(request.view !== undefined ? { view: request.view } : {}),
      ...(request.detailLevel ? { detailLevel: request.detailLevel } : {}),
      defaultDetailLevel: request.defaultDetailLevel,
    });
    if (!prepared.ok) return null;
    const p = prepared.value;
    const options = { detailLevel: p.detailLevel, saved: p.saved as Partial<ViewLayout> | null };
    if (needsElk(p.model, options)) return null;
    const sync = layoutDiagramSync(p.model, { ...options, engine: 'dagre' });
    return { prepared: p, geometry: placedGeometry(p, positionsOf(sync)) };
  }, [request]);
  if (!box) return placeholder;
  return (
    <StaticBox
      prepared={box.prepared}
      geometry={box.geometry}
      title={request.title}
      height={request.height}
      palette={request.palette}
      minimap={request.minimap}
      idPrefix={`rvs-${request.key}`}
    />
  );
}
