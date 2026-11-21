/** The live diagram: `<DiagramCanvas editable>` plus overlays (zoom, fit, undo/redo, error chip). */
import { DiagramCanvas, type CanvasNodeEvent, type DiagramCanvasHandle } from '@relvista/renderer';
import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url';
import { useCallback, useRef, useState, type KeyboardEvent, type ReactElement } from 'react';
import {
  FitIcon,
  MinusIcon,
  PlusIcon,
  RedoIcon,
  UndoIcon,
  WarningIcon,
} from '../components/icons.js';
import { NodeMenu, type NodeMenuTarget } from '../components/NodeMenu.js';
import { mod } from '../components/shortcutLabel.js';
import { store, useEditor } from '../state/store.js';
import { useTheme } from '../theme.js';
import { onNodeClick, revealSpan, spanOfNode } from './sync.js';

const PADDING = { top: 56, right: 24, bottom: 56, left: 24 };

function nextError(): void {
  const ed = store.editor;
  if (!ed) return;
  store.setTab('code');
  ed.focus();
  void ed.getAction('editor.action.marker.next')?.run();
}

export function DiagramPane(): ReactElement {
  const handle = useRef<DiagramCanvasHandle | null>(null);
  const model = useEditor((s) => s.compile.model);
  const stale = useEditor((s) => s.compile.stale);
  const errors = useEditor(
    (s) => s.compile.diagnostics.filter((d) => d.severity === 'error').length,
  );
  const layout = useEditor((s) => s.ws.layout);
  const view = useEditor((s) => s.ws.view);
  const wsId = useEditor((s) => s.ws.id);
  const highlighted = useEditor((s) => s.highlightedNodeId);
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const layoutStatus = useEditor((s) => s.layoutStatus);
  // A restored session gets its viewport back; otherwise the canvas's first view (readable zoom,
  // see the renderer's initialViewport) is kept: the editor never fits on open.
  const initialViewport = useEditor((s) => s.initialViewport);
  const { mode } = useTheme();
  const [menu, setMenu] = useState<NodeMenuTarget | null>(null);

  const setHandle = useCallback((h: DiagramCanvasHandle | null) => {
    handle.current = h;
    store.canvas = h;
  }, []);

  const openMenu = (
    e:
      | CanvasNodeEvent
      | { id: string; kind: CanvasNodeEvent['kind']; clientX: number; clientY: number },
  ) => {
    const selection = handle.current?.getSelection() ?? [];
    const ids = selection.includes(e.id)
      ? selection.filter((id) => !id.startsWith('group:'))
      : [e.id];
    setMenu({ id: e.id, kind: e.kind, x: e.clientX, y: e.clientY, ids: ids.length ? ids : [e.id] });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const node = (e.target as Element).closest?.('.react-flow__node');
    const id = node?.getAttribute('data-id');
    if (!id) return;
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const span = spanOfNode(id);
      if (span) {
        e.preventDefault();
        revealSpan(span, { focus: true });
      }
    } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) {
      e.preventDefault();
      const r = node!.getBoundingClientRect();
      const kind = id.startsWith('note:') ? 'note' : id.startsWith('group:') ? 'group' : 'table';
      openMenu({ id, kind, clientX: r.left + 16, clientY: r.top + 24 });
    }
  };

  const empty = !model || (model.tables.length === 0 && model.stickyNotes.length === 0);

  return (
    <div className="ed-diagram" onKeyDown={onKeyDown}>
      <DiagramCanvas
        ref={setHandle}
        model={model}
        view={view}
        layout={layout}
        onLayoutChange={store.onLayoutChange}
        editable
        colorMode={mode}
        workerUrl={elkWorkerUrl}
        highlightedNodeId={highlighted}
        onNodeClick={onNodeClick}
        onNodeContextMenu={openMenu}
        onPaneClick={() => store.setHighlight(null)}
        onViewportChange={store.onViewportChange}
        resetKey={wsId}
        initialViewport={initialViewport}
        onLayoutStatus={store.setLayoutStatus}
        padding={PADDING}
        ariaLabel="Entity-relationship diagram"
      >
        <div className="ed-overlay ed-overlay--tr" role="toolbar" aria-label="Diagram">
          <button
            type="button"
            className="ed-iconbtn"
            aria-label="Undo layout change"
            title={`Undo layout change (${mod('Z')})`}
            disabled={!canUndo}
            onClick={() => store.undoLayout()}
          >
            <UndoIcon />
          </button>
          <button
            type="button"
            className="ed-iconbtn"
            aria-label="Redo layout change"
            title={`Redo layout change (${mod('Z', { shift: true })})`}
            disabled={!canRedo}
            onClick={() => store.redoLayout()}
          >
            <RedoIcon />
          </button>
          <span className="ed-overlay__sep" aria-hidden="true" />
          <button
            type="button"
            className="ed-iconbtn"
            aria-label="Zoom in"
            title="Zoom in (+)"
            onClick={() => handle.current?.zoomIn()}
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="ed-iconbtn"
            aria-label="Zoom out"
            title="Zoom out (−)"
            onClick={() => handle.current?.zoomOut()}
          >
            <MinusIcon />
          </button>
          <button
            type="button"
            className="ed-iconbtn"
            aria-label="Fit diagram"
            title="Fit diagram (Shift+1)"
            onClick={() => handle.current?.fitView({ duration: 250 })}
          >
            <FitIcon />
          </button>
        </div>
        {stale && model && errors > 0 && !empty && (
          <button type="button" className="ed-chip ed-chip--error" onClick={nextError}>
            <WarningIcon />
            Showing the last valid diagram · {errors} error{errors === 1 ? '' : 's'}
          </button>
        )}
        {layoutStatus === 'pending' && model && !empty && (
          <div className="ed-chip ed-chip--muted ed-chip--top">Arranging…</div>
        )}
      </DiagramCanvas>
      {empty && (
        <div className="ed-diagram__empty">
          <p>No tables yet</p>
          {errors > 0 && (
            <button type="button" className="ed-btn ed-btn--small" onClick={nextError}>
              Show {errors} error{errors === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}
      {menu && (
        <NodeMenu
          target={menu}
          onClose={() => setMenu(null)}
          onReveal={(id) => {
            const span = spanOfNode(id);
            if (span) revealSpan(span, { focus: true });
          }}
        />
      )}
    </div>
  );
}
