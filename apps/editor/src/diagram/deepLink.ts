/**
 * Deep links in the editor (design phase3 §6.10): a target from the URL (after a share link,
 * `?url=` or a restored session) is applied once the canvas reports 'done'; while working, the URL
 * hash mirrors view, table, hops and viewport (`replaceState`, debounced; never `dbml=`).
 */
import { DEFAULT_VIEW, selectView, type DiagramModel } from '@relvista/core';
import type { DiagramCanvasHandle } from '@relvista/renderer';
import { useEffect, type RefObject } from 'react';
import {
  MIRROR_MS,
  QUIET_MS,
  applyDiagramTarget,
  mirrorTarget,
  mirroredUrl,
  targetView,
  type TargetActions,
} from '../state/navigation.js';
import { store, useEditor } from '../state/store.js';
import { clearPadding } from './clearPadding.js';

/** After the canvas's own first view of a view (applied in a timeout too). */
const APPLY_DELAY_MS = 80;
/** Viewport moves wait for the canvas's focus fit (250 ms) and the first-view timeouts. */
const VIEWPORT_DELAY_MS = 360;

/** The model the canvas draws for the open view (merged in compare mode). */
export function drawnModel(): DiagramModel | null {
  const s = store.getState();
  const base = s.compare?.result?.merged ?? s.compile.model;
  if (!base) return null;
  return s.ws.view === DEFAULT_VIEW ? base : (selectView(base, s.ws.view) ?? base);
}

/** Overlays a framed node must not end up under: the toolbar, the chips, the Changes panel. */
const COVERING = '.ed-overlay--tr, .ed-nav-chips, .ed-changes';

/** clearPadding of the editor's diagram pane as drawn now; undefined before it is. */
function measuredPadding(): ReturnType<typeof clearPadding> | undefined {
  const canvas = document.querySelector<HTMLElement>('.ed-diagram .rv-canvas');
  const root = canvas?.closest<HTMLElement>('.ed-diagram');
  if (!canvas || !root) return undefined;
  const rects = Array.from(root.querySelectorAll<HTMLElement>(COVERING))
    .filter((el) => el.offsetParent !== null)
    .map((el) => el.getBoundingClientRect());
  return clearPadding(canvas.getBoundingClientRect(), rects);
}

/**
 * Frames ids (zoom capped at 1) after the canvas's own fit of a focus change, clear of the
 * overlays (on a phone: below the toolbar and the legend, above the Changes sheet).
 */
export function frameNodes(
  handle: RefObject<DiagramCanvasHandle | null>,
  ids: string[],
  focusFirst = false,
): void {
  // The app's move, not the user's: the URL keeps no viewport for it.
  store.quietViewport();
  setTimeout(() => {
    const padding = measuredPadding();
    handle.current?.focusNodes(ids, { maxZoom: 1, duration: 250, ...(padding ? { padding } : {}) });
    if (focusFirst && ids[0]) {
      const sel = `.rv-canvas .react-flow__node[data-id="${CSS.escape(ids[0])}"]`;
      document.querySelector<HTMLElement>(sel)?.focus({ preventScroll: true });
    }
  }, 50);
}

export function useDeepLinks(handle: RefObject<DiagramCanvasHandle | null>): void {
  const pending = useEditor((s) => s.pendingTarget);
  const status = useEditor((s) => s.layoutStatus);
  const view = useEditor((s) => s.ws.view);
  const model = useEditor((s) => s.compile.model);
  const ready = useEditor((s) => s.ready);

  // --- apply ---------------------------------------------------------------------------------
  useEffect(() => {
    const t = pending;
    if (!t || !ready || status !== 'done' || !model) return;
    let unknown: string | null = null;
    const v = targetView(t, model, view, (name) => (unknown = name));
    if (unknown) {
      store.toast('warning', `No view “${unknown}” in this schema`);
      const { view: _drop, ...rest } = t;
      store.setPendingTarget(rest);
      return;
    }
    if (v !== null) {
      store.setView(v);
      return;
    }
    const timer = setTimeout(() => {
      const s = store.getState();
      if (s.pendingTarget !== t || s.layoutStatus !== 'done') return;
      const drawn = drawnModel();
      if (!drawn) return;
      store.setPendingTarget(null);
      store.quietViewport(VIEWPORT_DELAY_MS + QUIET_MS);
      const actions: TargetActions = {
        setDetailOverride: (d) => store.setDetailOverride(d),
        setFocus: (f) => store.setFocus(f),
        setPick: (p) => store.setPick(p),
        openSearch: (init) => store.openSearch(init),
        closeSearch: () => store.closeSearch(),
        frame: (ids) => frameNodes(handle, ids),
        setViewport: (vp) => {
          setTimeout(() => handle.current?.setViewport(vp), VIEWPORT_DELAY_MS);
          // Mirrored as given (the user's link), not as the canvas rounds it.
          setTimeout(() => store.onViewportChange(vp), VIEWPORT_DELAY_MS + QUIET_MS + 10);
        },
        toast: (m) => store.toast('warning', m),
      };
      applyDiagramTarget(t, drawn, actions);
    }, APPLY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [pending, ready, status, view, model, handle]);

  // --- mirror --------------------------------------------------------------------------------
  const navTable = useEditor((s) => s.navTable);
  const focus = useEditor((s) => s.focus);
  const viewport = useEditor((s) => s.viewport);
  useEffect(() => {
    if (!ready || pending) return;
    const timer = setTimeout(() => {
      const s = store.getState();
      const target = mirrorTarget(
        { view: s.ws.view, table: s.navTable, focus: s.focus, viewport: s.viewport },
        s.compile.model,
      );
      const url = mirroredUrl(location, target);
      if (url !== null) window.history.replaceState(window.history.state, '', url);
    }, MIRROR_MS);
    return () => clearTimeout(timer);
  }, [ready, pending, view, navTable, focus, viewport, model]);
}
