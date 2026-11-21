import { useState, type ReactElement } from 'react';
import { pickWithInput } from '../files/fallback.js';
import { guessDialect } from '../sql/dialect.js';
import { IMPORT_FORMATS, type ImportFormat } from '../sql/sql.js';
import { store, useEditor } from '../state/store.js';
import { Modal } from './Modal.js';

const labelOf = (f: ImportFormat) => IMPORT_FORMATS.find((x) => x.id === f)?.label ?? f;

/**
 * New ▸ From SQL… — converts DDL to DBML in a new untitled document. Opening or dropping a .sql
 * file opens it prefilled, with the dialect guessed from the text (the user can change it).
 */
export function SqlImportDialog(props: { onClose(): void }): ReactElement {
  const initial = useEditor((s) =>
    s.dialog?.kind === 'sql-import' ? s.dialog.initial : undefined,
  );
  const [format, setFormat] = useState<ImportFormat>(initial?.format ?? 'postgres');
  const [sql, setSql] = useState(initial?.text ?? '');
  const [name, setName] = useState(initial?.name ?? 'imported.sql');
  const [guessed, setGuessed] = useState<ImportFormat | null>(initial?.format ?? null);
  const busy = useEditor((s) => s.sqlBusy);
  const convert = async () => {
    if (!sql.trim()) return;
    if (await store.importSql(sql, format, name)) props.onClose();
  };
  return (
    <Modal
      title="New from SQL"
      size="large"
      onClose={props.onClose}
      initialFocus={initial ? 'select' : 'textarea'}
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
            aria-describedby={guessed ? 'ed-sql-guess' : undefined}
            onChange={(e) => {
              setFormat(e.target.value as ImportFormat);
              setGuessed(null);
            }}
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
            if (!file) return;
            const text = await file.text();
            const g = guessDialect(text);
            setSql(text);
            setName(file.name);
            setFormat(g);
            setGuessed(g);
          }}
        >
          Load .sql file…
        </button>
      </div>
      {guessed && (
        <p id="ed-sql-guess" className="ed-muted ed-small">
          Dialect guessed from the SQL: {labelOf(guessed)}. Change it if that is wrong.
        </p>
      )}
      <label className="ed-field">
        <span className="ed-field__label">
          CREATE TABLE statements{initial || name !== 'imported.sql' ? ` (${name})` : ''}
        </span>
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
