import { useState, type ReactElement } from 'react';
import { store } from '../state/store.js';
import { Modal } from './Modal.js';

/** "Open from URL…" */
export function UrlDialog(props: { initial?: string; onClose(): void }): ReactElement {
  const [url, setUrl] = useState(props.initial ?? '');
  const [withLayout, setWithLayout] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!url.trim()) return;
    setBusy(true);
    props.onClose();
    await store.openUrl(url.trim(), { kind: withLayout ? 'auto' : 'none' });
    setBusy(false);
  };
  return (
    <Modal
      title="Open from URL"
      size="small"
      onClose={props.onClose}
      initialFocus="input"
      footer={
        <>
          <button type="button" className="ed-btn" onClick={props.onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="ed-url-form"
            className="ed-btn ed-btn--primary"
            disabled={busy || !url.trim()}
          >
            Open
          </button>
        </>
      }
    >
      <form
        id="ed-url-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <label className="ed-field">
          <span className="ed-field__label">URL of a .dbml file</span>
          <input
            className="ed-input"
            type="url"
            inputMode="url"
            placeholder="https://github.com/owner/repo/blob/main/schema.dbml"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </label>
        <label className="ed-check">
          <input
            type="checkbox"
            checked={withLayout}
            onChange={(e) => setWithLayout(e.target.checked)}
          />
          Also load its layout file (<code>&lt;name&gt;.dbml.layout.json</code> next to it)
        </label>
        <p className="ed-muted ed-small">
          GitHub file links work as they are. The server must allow cross-origin requests (CORS).
          Links to the editor open the same way: <code>?url=&lt;file&gt;</code>, plus{' '}
          <code>&amp;layout</code> for the layout file next to it or{' '}
          <code>&amp;layout=&lt;url&gt;</code> for one elsewhere.
        </p>
      </form>
    </Modal>
  );
}

export function RemoteErrorDialog(props: {
  url: string;
  message: string;
  onClose(): void;
}): ReactElement {
  return (
    <Modal
      title="Could not open the URL"
      size="small"
      onClose={props.onClose}
      footer={
        <>
          <button
            type="button"
            className="ed-btn"
            onClick={() => store.openDialog({ kind: 'url', initial: props.url })}
          >
            Try another URL
          </button>
          <button type="button" className="ed-btn ed-btn--primary" onClick={props.onClose}>
            OK
          </button>
        </>
      }
    >
      <p>{props.message}</p>
      <p className="ed-url-display">
        <code>{props.url}</code>
      </p>
    </Modal>
  );
}
