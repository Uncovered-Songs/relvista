import { useRef, type KeyboardEvent, type ReactElement } from 'react';
import { baseName } from '../files/folder.js';
import { store, useEditor } from '../state/store.js';

/** Files of a multi-file workspace: those the entry reaches first, then the others dimmed. */
export function FileTabs(): ReactElement | null {
  const files = useEditor((s) => s.ws.files);
  const entry = useEditor((s) => s.ws.entry);
  const active = useEditor((s) => s.activeFile);
  const dirty = useEditor((s) => s.dirty);
  const reached = useEditor((s) => s.compile.model?.files ?? null);
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  if (files.length <= 1) return null;

  const reachedSet = new Set(reached ?? files.map((f) => f.key));
  const used = files.filter((f) => reachedSet.has(f.key));
  const unused = files.filter((f) => !reachedSet.has(f.key));
  const order = [
    ...used.sort((a, b) => (reached ? reached.indexOf(a.key) - reached.indexOf(b.key) : 0)),
    ...unused,
  ];

  const onKey = (e: KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === 'ArrowRight') next = (i + 1) % order.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + order.length) % order.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = order.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const key = order[next]!.key;
    store.setActiveFile(key);
    refs.current[key]?.focus();
  };

  return (
    <div className="ed-filetabs" role="tablist" aria-label="Files">
      {order.map((f, i) => {
        const isUnused = !reachedSet.has(f.key);
        const selected = f.key === active;
        return (
          <button
            key={f.key}
            ref={(el) => {
              refs.current[f.key] = el;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            className={`ed-filetab${isUnused ? ' ed-filetab--unused' : ''}${f.key === entry ? ' ed-filetab--entry' : ''}`}
            title={isUnused ? `${f.key} — not used by ${baseName(entry)}` : f.key}
            onClick={() => store.setActiveFile(f.key)}
            onKeyDown={(e) => onKey(e, i)}
          >
            <span className="ed-filetab__dir">
              {f.key.includes('/') ? f.key.slice(0, f.key.lastIndexOf('/') + 1) : ''}
            </span>
            {baseName(f.key)}
            {dirty[f.key] && (
              <span className="ed-filetab__dot" aria-label="unsaved">
                ●
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
