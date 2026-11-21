import { DEFAULT_VIEW } from '@relvista/core';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { buildShareLink, multiFileNote, shareSize, type ShareSize } from '../share/shareLink.js';
import { positionSuffix } from '../state/navigation.js';
import { store, useEditor } from '../state/store.js';
import { CopyIcon, WarningIcon } from './icons.js';
import { Modal } from './Modal.js';

export function ShareDialog(props: { onClose(): void }): ReactElement {
  const ws = useEditor((s) => s.ws);
  // Defaults follow the document until the user changes them (the layout can arrive later).
  const [layoutPref, setIncludeLayout] = useState<boolean | null>(null);
  const [viewPref, setIncludeView] = useState<boolean | null>(null);
  const includeLayout = layoutPref ?? ws.layout !== null;
  const includeView = viewPref ?? ws.view !== DEFAULT_VIEW;
  const [includePosition, setIncludePosition] = useState(false);
  // "Include position": the table and viewport of the moment the dialog opened (design phase3
  // §6.10); the view travels in the payload's own `view=` key.
  const [position] = useState(() => {
    const s = store.getState();
    return positionSuffix(
      {
        table: s.navTable,
        focus: s.focus,
        viewport: store.canvas?.getViewport() ?? s.viewport,
      },
      s.compile.model,
    );
  });
  const [link, setLink] = useState<string | null>(null);
  const [size, setSize] = useState<ShareSize | null>(null);
  const [copied, setCopied] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLink(null);
    void buildShareLink({
      dbml: store.entryText(),
      layout: ws.layout,
      view: ws.view,
      includeLayout,
      includeView,
    }).then((built) => {
      if (cancelled) return;
      const l = includePosition ? built + position : built;
      setLink(l);
      setSize(shareSize(l));
    });
    return () => {
      cancelled = true;
    };
  }, [ws.layout, ws.view, includeLayout, includeView, includePosition, position]);

  const tooLarge = size?.level === 'too-large';
  const copy = async () => {
    if (!link || tooLarge) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      field.current?.focus();
      field.current?.select();
      store.toast('info', 'Press Ctrl+C (⌘C) to copy the selected link.');
    }
  };
  const note = multiFileNote(ws.files.length, ws.entry);

  return (
    <Modal
      title="Share a link"
      onClose={props.onClose}
      initialFocus=".ed-share__copy"
      footer={
        <button type="button" className="ed-btn" onClick={props.onClose}>
          Done
        </button>
      }
    >
      <p className="ed-muted">
        The link contains the DBML itself (compressed in the part after <code>#</code>), so it never
        reaches a server. Anyone with the link sees this version; later edits are not included.
      </p>
      <div className="ed-checks">
        <label className="ed-check">
          <input
            type="checkbox"
            checked={includeLayout}
            disabled={!ws.layout}
            onChange={(e) => setIncludeLayout(e.target.checked)}
          />
          Include layout (table positions)
        </label>
        <label className="ed-check">
          <input
            type="checkbox"
            checked={includeView}
            disabled={ws.view === DEFAULT_VIEW}
            onChange={(e) => setIncludeView(e.target.checked)}
          />
          Open in the current view{ws.view !== DEFAULT_VIEW ? ` (${ws.view})` : ''}
        </label>
        <label className="ed-check">
          <input
            type="checkbox"
            checked={includePosition}
            disabled={!position}
            onChange={(e) => setIncludePosition(e.target.checked)}
          />
          Include position (selected table and zoom)
        </label>
      </div>
      <div className="ed-share__row">
        <label className="ed-visually-hidden" htmlFor="ed-share-link">
          Share link
        </label>
        <input
          id="ed-share-link"
          ref={field}
          className="ed-input ed-share__field"
          readOnly
          value={tooLarge ? '' : (link ?? 'Building link…')}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          className="ed-btn ed-btn--primary ed-share__copy"
          onClick={() => void copy()}
          disabled={!link || tooLarge}
        >
          <CopyIcon />
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <p className="ed-share__meta" aria-live="polite">
        {size && <span>{size.label}</span>}
        {size && size.level !== 'ok' && (
          <span className={`ed-share__warn${tooLarge ? ' ed-share__warn--error' : ''}`}>
            <WarningIcon /> {size.message}
          </span>
        )}
      </p>
      {note && <p className="ed-note">{note}</p>}
    </Modal>
  );
}
