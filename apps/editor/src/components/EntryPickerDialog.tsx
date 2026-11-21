import { useState, type ReactElement } from 'react';
import { Modal } from './Modal.js';

/** A folder without `main.dbml` (or with several root files): which file is the entry? */
export function EntryPickerDialog(props: {
  paths: string[];
  onResult(path: string | null): void;
}): ReactElement {
  const [choice, setChoice] = useState(props.paths[0] ?? '');
  return (
    <Modal
      title="Choose the entry file"
      size="small"
      onClose={() => props.onResult(null)}
      footer={
        <>
          <button type="button" className="ed-btn" onClick={() => props.onResult(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="ed-btn ed-btn--primary"
            disabled={!choice}
            onClick={() => props.onResult(choice)}
          >
            Open
          </button>
        </>
      }
    >
      <p className="ed-muted">
        This folder has several DBML files and no <code>main.dbml</code>. The entry file is the one
        the diagram starts from; it reaches the others through <code>use</code>.
      </p>
      <fieldset className="ed-radiolist">
        <legend className="ed-visually-hidden">Entry file</legend>
        {props.paths.map((p) => (
          <label key={p} className="ed-radiolist__item">
            <input
              type="radio"
              name="entry"
              value={p}
              checked={choice === p}
              onChange={() => setChoice(p)}
            />
            <code>{p}</code>
          </label>
        ))}
      </fieldset>
    </Modal>
  );
}
