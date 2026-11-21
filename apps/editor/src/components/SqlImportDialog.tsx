import { useState, type ReactElement } from 'react';
import { pickWithInput } from '../files/fallback.js';
import { IMPORT_FORMATS, type ImportFormat } from '../sql/sql.js';
import { store, useEditor } from '../state/store.js';
import { Modal } from './Modal.js';

/** New ▸ From SQL… — converts DDL to DBML in a new untitled document. */
export function SqlImportDialog(props: { onClose(): void }): ReactElement {
  const [format, setFormat] = useState<ImportFormat>('postgres');
  const [sql, setSql] = useState('');
  const busy = useEditor((s) => s.sqlBusy);
  const convert = async () => {
    if (!sql.trim()) return;
    if (await store.importSql(sql, format)) props.onClose();
  };
  return (
    <Modal
      title="New from SQL"
      size="large"
      onClose={props.onClose}
      initialFocus="textarea"
      footer={
        <>
          <span className="ed-dialog__status" role="status">
            {busy}
          </span>
          <button type="button" className="ed-btn" onClick={props.onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="ed-btn ed-btn--primary"
            disabled={!sql.trim() || busy !== null}
            onClick={() => void convert()}
          >
            Convert to DBML
          </button>
        </>
      }
    >
      <div className="ed-sql__bar">
        <label className="ed-field ed-field--inline">
          <span className="ed-field__label">Dialect</span>
          <select
            className="ed-select"
            value={format}
            onChange={(e) => setFormat(e.target.value as ImportFormat)}
          >
            {IMPORT_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="ed-btn"
          onClick={async () => {
            const [file] = await pickWithInput({ accept: '.sql,.ddl,.txt' });
            if (file) setSql(await file.text());
          }}
        >
          Load .sql file…
        </button>
      </div>
      <label className="ed-field">
        <span className="ed-field__label">CREATE TABLE statements</span>
        <textarea
          className="ed-input ed-sql__text"
          spellCheck={false}
          value={sql}
          placeholder={
            'CREATE TABLE users (\n  id serial PRIMARY KEY,\n  email text NOT NULL UNIQUE\n);'
          }
          onChange={(e) => setSql(e.target.value)}
        />
      </label>
      <p className="ed-muted ed-small">
        Opens a new document; the current one is kept under Open ▸ Restore previous session. SQL
        support (2.6 MB) loads on first use.
      </p>
    </Modal>
  );
}
