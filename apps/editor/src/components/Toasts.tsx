import { useEffect, useRef, useState, type ReactElement } from 'react';
import { store, useEditor, type Toast } from '../state/store.js';
import { CloseIcon } from './icons.js';

function ToastItem({ t }: { t: Toast }): ReactElement {
  const [paused, setPaused] = useState(false);
  const left = useRef(5000);
  useEffect(() => {
    if (paused) return;
    const start = Date.now();
    const timer = setTimeout(() => store.dismissToast(t.id), left.current);
    return () => {
      clearTimeout(timer);
      left.current -= Date.now() - start;
    };
  }, [paused, t.id]);
  return (
    <div
      className={`ed-toast ed-toast--${t.kind}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="ed-toast__msg">{t.message}</span>
      {t.action && (
        <button
          type="button"
          className="ed-btn ed-btn--small"
          onClick={() => {
            t.action!.run();
            store.dismissToast(t.id);
          }}
        >
          {t.action.label}
        </button>
      )}
      <button
        type="button"
        className="ed-iconbtn ed-iconbtn--small"
        aria-label="Dismiss"
        onClick={() => store.dismissToast(t.id)}
      >
        <CloseIcon />
      </button>
    </div>
  );
}

export function Toasts(): ReactElement {
  const toasts = useEditor((s) => s.toasts);
  return (
    <div className="ed-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <ToastItem key={t.id} t={t} />
      ))}
    </div>
  );
}
