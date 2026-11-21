/**
 * Compare… (Mod+Alt+D, design phase3 §6.11): pick the other version — a file (picker or drop),
 * pasted text, an https URL (GitHub blob / tree URLs work), or another Git ref of the GitHub file
 * the document came from — and whether it is the older (default) or the newer side.
 */
import { useState, type DragEvent, type ReactElement } from 'react';
import { pickWithInput } from '../files/fallback.js';
import {
  CompareError,
  canCompareGitRef,
  compileOther,
  documentRef,
  resolveCompareSource,
  type CompareRequest,
  type CompareSourceKind,
} from '../state/compare.js';
import { baseName } from '../files/folder.js';
import { store, useEditor } from '../state/store.js';
import { WarningIcon } from './icons.js';
import { Modal } from './Modal.js';
import './navigation.css';

const SOURCES: Array<{ id: CompareSourceKind; label: string }> = [
  { id: 'file', label: 'File' },
  { id: 'paste', label: 'Paste' },
  { id: 'url', label: 'URL' },
  { id: 'git', label: 'Git ref' },
];

export function CompareDialog(props: { onClose(): void }): ReactElement {
  const docUrl = useEditor((s) => s.ws.remoteUrl ?? null);
  const name = useEditor((s) => baseName(s.ws.name));
  const current = useEditor((s) => s.compare);
  const hasModel = useEditor((s) => !!s.compile.model);
  const git = canCompareGitRef(docUrl);
  const [kind, setKind] = useState<CompareSourceKind>(git ? 'git' : 'paste');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [ref, setRef] = useState('');
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array } | null>(null);
  const [swapped, setSwapped] = useState(current?.swapped ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  const request = (): CompareRequest | null => {
    if (kind === 'paste') return { kind, text };
    if (kind === 'url') return url.trim() ? { kind, url: url.trim() } : null;
    if (kind === 'git') return docUrl && ref.trim() ? { kind, docUrl, ref: ref.trim() } : null;
    return file ? { kind: 'file', name: file.name, bytes: file.bytes } : null;
  };
  const req = request();
  const ready = !!req && (req.kind !== 'paste' || text.trim() !== '') && hasModel;

  const takeFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    setFile({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
  };

  const submit = async () => {
    const r = request();
    if (!r) return;
    setBusy(true);
    setError(null);
    try {
      const other = await resolveCompareSource(r);
      const compiled = compileOther(other.text);
      if (!compiled.ok) {
        setError(compiled.message);
        return;
      }
      store.enterCompare(other, compiled.model, swapped);
      props.onClose();
    } catch (e) {
      setError(e instanceof CompareError || e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    void takeFile(e.dataTransfer.files[0]);
  };

  return (
    <Modal
      title="Compare"
      onClose={props.onClose}
      initialFocus='input[name="ed-compare-source"]:checked'
      footer={
        <>
          {current && (
            <button
              type="button"
              className="ed-btn ed-compare__exit"
              onClick={() => {
                store.exitCompare();
                props.onClose();
              }}
            >
              Exit compare
            </button>
          )}
          <button type="button" className="ed-btn" onClick={props.onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="ed-compare-form"
            className="ed-btn ed-btn--primary"
            disabled={busy || !ready}
          >
            {busy ? 'Loading…' : 'Compare'}
          </button>
        </>
      }
    >
      <form
        id="ed-compare-form"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="ed-muted">
          Compare <strong>{name}</strong> with another version of the schema: the diagram shows
          both, with what was added, removed and changed.
        </p>
        <fieldset className="ed-compare__sources">
          <legend className="ed-field__label">Other version</legend>
          {SOURCES.filter((s) => s.id !== 'git' || git).map((s) => (
            <label key={s.id} className="ed-compare__source">
              <input
                type="radio"
                name="ed-compare-source"
                value={s.id}
                checked={kind === s.id}
                onChange={() => {
                  setKind(s.id);
                  setError(null);
                }}
              />
              {s.label}
            </label>
          ))}
        </fieldset>

        {kind === 'file' && (
          <div
            className="ed-compare__drop"
            data-over={over ? 'true' : undefined}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={onDrop}
          >
            <button
              type="button"
              className="ed-btn"
              onClick={async () => {
                const [f] = await pickWithInput({ accept: '.dbml,.txt' });
                await takeFile(f);
              }}
            >
              Choose a .dbml file…
            </button>
            <span className="ed-muted">{file ? file.name : 'or drop it here'}</span>
          </div>
        )}
        {kind === 'paste' && (
          <label className="ed-field">
            <span className="ed-field__label">DBML of the other version</span>
            <textarea
              className="ed-input ed-compare__text"
              spellCheck={false}
              value={text}
              placeholder={'Table users {\n  id integer [pk]\n}'}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
        )}
        {kind === 'url' && (
          <label className="ed-field">
            <span className="ed-field__label">URL of a .dbml file</span>
            <input
              className="ed-input"
              type="url"
              inputMode="url"
              placeholder="https://github.com/owner/repo/blob/main/schema.dbml"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
        )}
        {kind === 'git' && (
          <label className="ed-field">
            <span className="ed-field__label">Branch, tag or commit</span>
            <input
              className="ed-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={documentRef(docUrl) ?? 'main'}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              aria-describedby="ed-compare-git-hint"
            />
            <span id="ed-compare-git-hint" className="ed-muted ed-small">
              The same file of this GitHub repository, at another ref (now: {documentRef(docUrl)}).
            </span>
          </label>
        )}

        <label className="ed-check ed-compare__swap">
          <input type="checkbox" checked={swapped} onChange={(e) => setSwapped(e.target.checked)} />
          The open document is the older version (swap before and after)
        </label>
        {!hasModel && (
          <p className="ed-note">The open document has no diagram yet: fix its errors first.</p>
        )}
        {error && (
          <p className="ed-compare__error" role="alert">
            <WarningIcon /> {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
