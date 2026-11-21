import type { ReactElement } from 'react';
import { EXAMPLES, EXAMPLE_GROUPS } from '../examples.js';
import { store } from '../state/store.js';
import { FileIcon, FolderIcon } from './icons.js';
import { Modal } from './Modal.js';

export function ExamplesDialog(props: { onClose(): void }): ReactElement {
  return (
    <Modal title="Open an example" size="large" onClose={props.onClose} initialFocus=".ed-example">
      <p className="ed-muted">
        The examples are ordinary DBML files that also open in dbdiagram.io. Your current document
        stays available under Open ▸ Restore previous session.
      </p>
      {EXAMPLE_GROUPS.map((g) => (
        <section key={g} className="ed-examples__group" aria-labelledby={`ex-${g}`}>
          <h3 id={`ex-${g}`} className="ed-examples__heading">
            {g}
          </h3>
          <ul className="ed-examples">
            {EXAMPLES.filter((e) => e.group === g).map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="ed-example"
                  onClick={() => {
                    props.onClose();
                    void store.openExample(e.id);
                  }}
                >
                  <span className="ed-example__icon">
                    {e.folder ? <FolderIcon /> : <FileIcon />}
                  </span>
                  <span className="ed-example__text">
                    <span className="ed-example__title">{e.title}</span>
                    <span className="ed-example__desc">{e.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </Modal>
  );
}
