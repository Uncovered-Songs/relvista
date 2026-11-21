/** Shell: TopBar, SplitPane(Code, Diagram) or mobile tabs, StatusBar, dialogs, toasts, drop target. */
import { Suspense, lazy, useEffect, useState, type ReactElement } from 'react';
import { CompareDiffPane } from './components/CompareDiffPane.js';
import { ConfirmDialog } from './components/ConfirmDialog.js';
import { EmptyState } from './components/EmptyState.js';
import { EntryPickerDialog } from './components/EntryPickerDialog.js';
import { ExamplesDialog } from './components/ExamplesDialog.js';
import { FileTabs } from './components/FileTabs.js';
import { HelpDialog } from './components/HelpDialog.js';
import { MobileTabs } from './components/MobileTabs.js';
import { ShareDialog } from './components/ShareDialog.js';
import { SplitPane } from './components/SplitPane.js';
import { SqlImportDialog } from './components/SqlImportDialog.js';
import { StatusBar } from './components/StatusBar.js';
import { Toasts } from './components/Toasts.js';
import { TopBar } from './components/TopBar.js';
import { RemoteErrorDialog, UrlDialog } from './components/UrlDialog.js';
import { useNarrow } from './components/useNarrow.js';
import { DiagramPane } from './diagram/DiagramPane.js';
import { hasFiles, readDrop } from './files/drop.js';
import { detectMac, matchShortcut, zoneOf, type ShortcutAction } from './keyboard.js';
import { MonacoEditor } from './monaco/MonacoEditor.js';
import { store, useEditor } from './state/store.js';

// Rarely opened dialogs load on first use (code-split from the editor's first load).
const CompareDialog = lazy(() =>
  import('./components/CompareDialog.js').then((m) => ({ default: m.CompareDialog })),
);
const PdfExportDialog = lazy(() =>
  import('./components/PdfExportDialog.js').then((m) => ({ default: m.PdfExportDialog })),
);

const MAC = detectMac();
/**
 * Global commands: handled in the capture phase before Monaco or React Flow see the key, so
 * neither can swallow them (Monaco would otherwise open its own bindings, the browser its dialogs).
 */
const GLOBAL = new Set<ShortcutAction>(['save', 'saveAs', 'open', 'autoLayout', 'compare']);

function focusCode(): void {
  store.setTab('code');
  requestAnimationFrame(() => store.editor?.focus());
}

function focusDiagram(): void {
  store.setTab('diagram');
  requestAnimationFrame(() => {
    const el =
      document.querySelector<HTMLElement>('.rv-canvas .react-flow__node.selected') ??
      document.querySelector<HTMLElement>('.rv-canvas .react-flow__node[tabindex]') ??
      document.querySelector<HTMLElement>('.rv-canvas');
    el?.focus();
  });
}

function run(action: ShortcutAction): void {
  switch (action) {
    case 'save':
      return void store.save();
    case 'saveAs':
      return void store.saveAs();
    case 'open':
      return void store.openFilePicker();
    case 'undo':
      return store.undoLayout();
    case 'redo':
      return store.redoLayout();
    case 'autoLayout':
      return void store.autoLayout('unpinned');
    case 'fit':
      return store.canvas?.fitView({ duration: 250 });
    case 'zoomIn':
      return store.canvas?.zoomIn();
    case 'zoomOut':
      return store.canvas?.zoomOut();
    case 'focusCode':
      return focusCode();
    case 'focusDiagram':
      return focusDiagram();
    case 'help':
      return store.openDialog({ kind: 'help' });
    case 'search':
      return openSearch();
    case 'compare':
      return store.openDialog({ kind: 'compare' });
  }
}

/** Mod+K / '/': opens the search panel over the diagram (or moves the focus into it). */
function openSearch(): void {
  if (!store.getState().compile.model) return;
  store.setTab('diagram');
  if (store.getState().search) {
    requestAnimationFrame(() =>
      document.querySelector<HTMLInputElement>('.ed-diagram .rv-nav-search input')?.focus(),
    );
    return;
  }
  store.openSearch();
}

function useGlobalHandlers(): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Capture phase: React Flow's document handlers preventDefault Meta/Ctrl combinations (its
      // multi-select key), so a bubbling handler would never see Mod+S on the page body.
      if (e.isComposing) return;
      if (store.getState().dialog && !(e.metaKey || e.ctrlKey)) return;
      const zone = zoneOf(document.activeElement);
      const action = matchShortcut(e, zone, MAC);
      if (!action) return;
      if (store.getState().dialog && action !== 'save' && action !== 'saveAs') return;
      e.preventDefault();
      if (GLOBAL.has(action)) e.stopPropagation();
      run(action);
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      void store.autosaveNow();
      if (store.hasUnsavedWork()) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void store.autosaveNow();
    };
    let depth = 0;
    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      depth++;
      setDragging(true);
    };
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      depth = 0;
      setDragging(false);
      // A modal is open (a confirm, the entry picker): it has to be answered first.
      if (store.getState().dialog) return;
      const pending = readDrop(e.dataTransfer!);
      void (async () => {
        try {
          const r = await pending;
          if (r.kind === 'directory') await store.openDirectory(r.handle);
          else if (r.kind === 'handles') await store.openFileHandles(r.handles);
          else if (r.kind === 'folder-files') await store.openWalked(r.files, 'folder');
          else if (r.kind === 'files') await store.openWalked(r.files, 'file');
          else
            store.toast('warning', 'Drop .dbml files (and their .dbml.layout.json) or a folder.');
        } catch (err) {
          store.toast(
            'error',
            `Could not open the dropped files: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      })();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, []);
  return dragging;
}

function CodePane(): ReactElement {
  const empty = useEditor((s) => s.entryEmpty && s.ready);
  // Compare mode's "Code diff": the read-only diff editor covers the editor, which stays mounted
  // (the diagram's reveal-in-code and the store keep using it).
  const codeDiff = useEditor((s) => s.compare?.codeDiff === true);
  return (
    // `nokey`: React Flow's document key handlers skip it. Monaco 0.57 types into an EditContext
    // <div>, not a textarea, so without it React Flow would swallow Space (its pan key).
    <section className="ed-code nokey" aria-label="Code">
      <FileTabs />
      <div className={`ed-code__editor${codeDiff ? ' ed-code__editor--hidden' : ''}`}>
        <MonacoEditor />
        {empty && !codeDiff && <EmptyState />}
        {codeDiff && <CompareDiffPane />}
      </div>
    </section>
  );
}

function Dialogs(): ReactElement | null {
  const dialog = useEditor((s) => s.dialog);
  if (!dialog) return null;
  const close = () => store.closeDialog();
  switch (dialog.kind) {
    case 'share':
      return <ShareDialog onClose={close} />;
    case 'examples':
      return <ExamplesDialog onClose={close} />;
    case 'sql-import':
      return <SqlImportDialog onClose={close} />;
    case 'help':
      return <HelpDialog onClose={close} />;
    case 'compare':
      return (
        <Suspense fallback={null}>
          <CompareDialog onClose={close} />
        </Suspense>
      );
    case 'pdf':
      return (
        <Suspense fallback={null}>
          <PdfExportDialog onClose={close} />
        </Suspense>
      );
    case 'url':
      return <UrlDialog initial={dialog.initial} onClose={close} />;
    case 'remote-error':
      return <RemoteErrorDialog url={dialog.url} message={dialog.message} onClose={close} />;
    case 'entry':
      return <EntryPickerDialog paths={dialog.paths} onResult={dialog.resolve} />;
    case 'confirm':
      return (
        <ConfirmDialog
          title={dialog.title}
          message={dialog.message}
          confirmLabel={dialog.confirmLabel}
          danger={dialog.danger}
          onResult={dialog.resolve}
        />
      );
  }
}

export function App(): ReactElement {
  const narrow = useNarrow();
  const split = useEditor((s) => s.split);
  const tab = useEditor((s) => s.tab);
  const paused = useEditor((s) => s.autosavePaused);
  const ready = useEditor((s) => s.ready);
  const dragging = useGlobalHandlers();

  return (
    <div className="ed-app" data-ready={ready ? 'true' : 'false'}>
      <TopBar />
      {paused && (
        <div className="ed-banner" role="status">
          The editor is open in another tab — autosave is paused here.
        </div>
      )}
      <main className="ed-main">
        {narrow ? (
          <>
            <MobileTabs />
            <div className="ed-mobile">
              <div
                id="ed-pane-code"
                role="tabpanel"
                aria-labelledby="ed-tab-code"
                className="ed-mobile__pane"
                hidden={tab !== 'code'}
              >
                <CodePane />
              </div>
              <div
                id="ed-pane-diagram"
                role="tabpanel"
                aria-labelledby="ed-tab-diagram"
                className="ed-mobile__pane"
                hidden={tab !== 'diagram'}
              >
                <DiagramPane />
              </div>
            </div>
          </>
        ) : (
          <SplitPane
            split={split}
            onSplit={(v) => store.setSplit(v)}
            first={<CodePane />}
            second={<DiagramPane />}
          />
        )}
      </main>
      <StatusBar />
      <Dialogs />
      <Toasts />
      {dragging && (
        <div className="ed-dropzone" aria-hidden="true">
          <div className="ed-dropzone__card">Drop .dbml files or a folder to open them</div>
        </div>
      )}
    </div>
  );
}
