/**
 * Geometry of the canvas: the synchronous (dagre) layout at once, then the ELK result when some
 * visible node has no saved position. Saved positions always win. Stability in the editable canvas
 * comes from the caller reporting ELK's placements as saved positions ('place' changes), after
 * which this hook has nothing left to lay out.
 */
import type {
  DetailLevel,
  DiagramGeometry,
  DiagramModel,
  LayoutOptions,
  ViewLayout,
  ViewLayoutOverride,
} from '@relvista/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { layoutAsync, layoutSync } from '../geometry.js';

/** ELK runs after the first one wait this long, so superseded runs never start (ms). */
export const RELAYOUT_DEBOUNCE_MS = 150;

function hasSavedPosition(saved: ViewLayoutOverride | null, id: string): boolean {
  if (!saved || !Object.hasOwn(saved.nodes, id)) return false;
  const n = saved.nodes[id]!;
  return Number.isFinite(n.x) && Number.isFinite(n.y);
}

/** Visible tables and sticky notes without a saved position (model order: notes, then tables). */
export function unplacedIds(model: DiagramModel, saved: ViewLayoutOverride | null): string[] {
  const out: string[] = [];
  for (const n of model.stickyNotes) if (!hasSavedPosition(saved, n.id)) out.push(n.id);
  for (const t of model.tables) if (!hasSavedPosition(saved, t.id)) out.push(t.id);
  return out;
}

export function hasAllPositions(model: DiagramModel, saved: ViewLayoutOverride | null): boolean {
  if (!saved) return false;
  return (
    model.tables.every((t) => hasSavedPosition(saved, t.id)) &&
    model.stickyNotes.every((n) => hasSavedPosition(saved, n.id))
  );
}

/** Sync (dagre) geometry first, then the async (ELK) result when it arrives. */
export function useCanvasGeometry(
  model: DiagramModel | null,
  saved: ViewLayoutOverride | null,
  detailLevel: DetailLevel,
  aspectRatio: number | undefined,
  workerUrl?: string | URL,
): { geometry: DiagramGeometry | null; final: boolean } {
  const options = useMemo<LayoutOptions>(
    () => ({
      detailLevel,
      saved: saved as Partial<ViewLayout> | null,
      ...(aspectRatio ? { aspectRatio } : {}),
    }),
    [detailLevel, saved, aspectRatio],
  );
  const runs = useRef(0);
  const sync = useMemo(() => (model ? layoutSync(model, options) : null), [model, options]);
  const [late, setLate] = useState<{
    for: DiagramGeometry;
    geometry: DiagramGeometry | null;
  } | null>(null);
  const complete = !!model && hasAllPositions(model, saved);
  useEffect(() => {
    if (!model || !sync || complete) return;
    let alive = true;
    const run = () => {
      let p: Promise<DiagramGeometry> | null = null;
      try {
        p = layoutAsync(model, { ...options, engine: 'elk', ...(workerUrl ? { workerUrl } : {}) });
      } catch {
        p = null;
      }
      p?.then(
        (geometry) => {
          if (alive) setLate({ for: sync, geometry });
        },
        () => {
          // keep the sync layout
          if (alive) setLate({ for: sync, geometry: null });
        },
      );
      if (!p) setLate({ for: sync, geometry: null });
    };
    // The first layout starts at once; later ones (typing in an editor, switching views quickly)
    // wait a moment so superseded ELK runs are never started.
    const t = runs.current++ === 0 ? null : setTimeout(run, RELAYOUT_DEBOUNCE_MS);
    if (!t) run();
    return () => {
      alive = false;
      if (t) clearTimeout(t);
    };
  }, [model, sync, complete, options, workerUrl]);
  const done = !!late && late.for === sync;
  const final = !sync || !model || complete || done;
  return { geometry: (done ? late.geometry : null) ?? sync, final };
}
