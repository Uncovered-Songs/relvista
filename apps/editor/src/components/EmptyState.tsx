import type { ReactElement } from 'react';
import { store } from '../state/store.js';
import { mod } from './shortcutLabel.js';

/** Over the code pane when the document is empty. */
export function EmptyState(): ReactElement {
  return (
    <div className="ed-empty" role="region" aria-label="Get started">
      <div
        className="ed-empty__card"
        onMouseDown={(e) => {
          // Clicking the card (not its buttons) starts typing, like clicking the editor.
          if ((e.target as Element).closest('button, a')) return;
          e.preventDefault();
          store.editor?.focus();
        }}
      >
        <h2 className="ed-empty__title">Start typing DBML, or open an example</h2>
        <p className="ed-empty__text">
          <code>
            Table users {'{'} id int [pk] {'}'}
          </code>{' '}
          is enough to see a diagram.
        </p>
        <div className="ed-empty__actions">
          <button
            type="button"
            className="ed-btn ed-btn--primary"
            onClick={() => store.openDialog({ kind: 'examples' })}
          >
            New from example
          </button>
          <button
            type="button"
            className="ed-btn"
            onClick={() => void store.openFilePicker()}
            title={`Open file (${mod('O')})`}
          >
            Open file
          </button>
          <button type="button" className="ed-btn" onClick={() => void store.openFolderPicker()}>
            Open folder
          </button>
        </div>
        <p className="ed-empty__hint">
          You can also drop .dbml files or a folder anywhere on this page.
        </p>
      </div>
    </div>
  );
}
