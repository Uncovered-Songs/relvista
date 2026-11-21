import { DEFAULT_VIEW, selectView } from '@relvista/core';
import { useMemo, type ReactElement } from 'react';
import { envelopeLabel } from '../files/text.js';
import { countDiagnostics } from '../monaco/markers.js';
import { store, useEditor } from '../state/store.js';
import type { SaveState } from '../state/types.js';
import { ErrorIcon, WarningIcon } from './icons.js';
import { useNarrow } from './useNarrow.js';

const SAVE_LABEL: Record<SaveState, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved',
  autosaved: 'Autosaved locally',
  downloaded: 'Downloaded',
};

function nextMarker(): void {
  const ed = store.editor;
  if (!ed) return;
  store.setTab('code');
  ed.focus();
  void ed.getAction('editor.action.marker.next')?.run();
}

export function StatusBar(): ReactElement {
  const narrow = useNarrow();
  const diagnostics = useEditor((s) => s.compile.diagnostics);
  const model = useEditor((s) => s.compile.model);
  const view = useEditor((s) => s.ws.view);
  const cursor = useEditor((s) => s.cursor);
  const activeFile = useEditor((s) => s.activeFile);
  const envelope = useEditor(
    (s) => s.ws.files.find((f) => f.key === s.activeFile)?.envelope ?? null,
  );
  const dirty = useEditor((s) => store.isDirty(s));
  const saveState = useEditor((s) => s.saveState);
  const sqlBusy = useEditor((s) => s.sqlBusy);
  const inFile = useEditor((s) =>
    s.ws.files.some((f) => f.key === s.ws.entry && (f.handle !== null || f.disk !== null)),
  );
  const { errors, warnings } = countDiagnostics(diagnostics);

  const counts = useMemo(() => {
    if (!model) return null;
    const refs = model.refs.length;
    if (view !== DEFAULT_VIEW) {
      const v = selectView(model, view);
      if (v) return `${v.tables.length} of ${model.tables.length} tables · ${v.refs.length} refs`;
    }
    return `${model.tables.length} table${model.tables.length === 1 ? '' : 's'} · ${refs} ref${refs === 1 ? '' : 's'}`;
  }, [model, view]);

  let state: SaveState =
    !dirty && saveState !== 'downloaded' ? 'saved' : saveState === 'saved' ? 'unsaved' : saveState;
  // A document that was never in a file (example, share link, new) lives in the autosave only.
  if (state === 'saved' && !inFile) state = 'autosaved';

  return (
    <footer className="ed-status" aria-label="Status">
      <button
        type="button"
        className={`ed-status__diag${errors ? ' ed-status__diag--error' : ''}`}
        onClick={nextMarker}
        title="Go to the next problem (F8)"
      >
        <span role="status" aria-live="polite" className="ed-status__counts">
          <span className="ed-status__count">
            <ErrorIcon /> {errors}
            <span className="ed-visually-hidden"> error{errors === 1 ? '' : 's'},</span>
          </span>
          <span className="ed-status__count">
            <WarningIcon /> {warnings}
            <span className="ed-visually-hidden"> warning{warnings === 1 ? '' : 's'}</span>
          </span>
        </span>
      </button>
      {!narrow && counts && <span className="ed-status__item">{counts}</span>}
      {!narrow && (
        <span className="ed-status__item">
          Ln {cursor.line}, Col {cursor.column}
        </span>
      )}
      {!narrow && envelope && (
        <span
          className="ed-status__item"
          title={`Encoding and line endings of ${activeFile}, kept when saving`}
        >
          {envelopeLabel(envelope)}
        </span>
      )}
      <span className="ed-status__spacer" />
      {sqlBusy && <span className="ed-status__item ed-status__busy">{sqlBusy}</span>}
      <span className={`ed-status__item ed-status__save ed-status__save--${state}`}>
        {SAVE_LABEL[state]}
      </span>
    </footer>
  );
}
