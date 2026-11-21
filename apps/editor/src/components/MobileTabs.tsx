import type { ReactElement } from 'react';
import { store, useEditor } from '../state/store.js';

export function MobileTabs(): ReactElement {
  const tab = useEditor((s) => s.tab);
  const errors = useEditor(
    (s) => s.compile.diagnostics.filter((d) => d.severity === 'error').length,
  );
  const tabs = [
    { id: 'code' as const, label: 'Code' },
    { id: 'diagram' as const, label: 'Diagram' },
  ];
  return (
    <div className="ed-mobiletabs" role="tablist" aria-label="Pane">
      {tabs.map((t) => (
        <button
          key={t.id}
          id={`ed-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          aria-controls={`ed-pane-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          className="ed-mobiletab"
          onClick={() => store.setTab(t.id)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
              e.preventDefault();
              const next = t.id === 'code' ? 'diagram' : 'code';
              store.setTab(next);
              document.getElementById(`ed-tab-${next}`)?.focus();
            }
          }}
        >
          {t.label}
          {t.id === 'code' && errors > 0 && (
            <span className="ed-badge ed-badge--error">{errors}</span>
          )}
        </button>
      ))}
    </div>
  );
}
