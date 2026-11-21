import { tableTitle, type DiagramModel, type Table } from '@relvista/core';
import { typeLabel } from '../svg/TableSvg.js';
import { createContext, useContext, useEffect, useRef, type ReactElement } from 'react';
import { CloseIcon, RouteIcon } from './icons.js';

/**
 * Actions the side card offers on top of the details, provided by the host around the canvas
 * (DbmlViewer: "Show related" → focus mode, docs/design/phase3-v1.md §4.7). The canvas renders
 * the card, so the host reaches it through context.
 */
export interface SideCardActions {
  /** Shows the table with its related tables only (focus mode, 1 hop). */
  onShowRelated?(tableId: string): void;
}

export const SideCardActionsContext = createContext<SideCardActions | null>(null);

function flags(c: Table['columns'][number]): string[] {
  const f: string[] = [];
  if (c.pk) f.push('PK');
  if (c.isFk) f.push('FK');
  if (c.unique && !c.pk) f.push('unique');
  if (c.notNull && !c.pk) f.push('not null');
  if (c.increment) f.push('increment');
  return f;
}

/** Details of a clicked table: note, columns with their settings and notes, indexes, refs. */
export function SideCard({
  table,
  model,
  onClose,
}: {
  table: Table;
  model: DiagramModel;
  onClose(): void;
}): ReactElement {
  const actions = useContext(SideCardActionsContext);
  const refs = model.refs.filter((r) => r.from.tableId === table.id || r.to.tableId === table.id);
  const root = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Focus moves into the card when it opens (or shows another table) and returns on close;
  // Esc closes it (capture phase + preventDefault, so a fullscreen overlay stays open).
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    root.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // Esc inside another layer (search panel, dialog) is that layer's.
      const t = e.target as Element | null;
      if (t && typeof t.closest === 'function' && t.closest('.rv-nav-layer')) return;
      e.preventDefault();
      close.current();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      if (before && before !== document.body && before.isConnected) before.focus();
    };
  }, [table.id]);
  const group = table.groupId ? model.groups.find((g) => g.id === table.groupId) : undefined;
  return (
    <aside
      ref={root}
      tabIndex={-1}
      className="rv-sidecard nodrag nopan nowheel"
      aria-label={`Table ${tableTitle(table)}`}
    >
      <header className="rv-sidecard-head">
        <div>
          <h3>{tableTitle(table)}</h3>
          {table.alias || group ? (
            <p className="rv-sidecard-sub">
              {table.alias ? `alias ${table.alias}` : null}
              {table.alias && group ? ' · ' : null}
              {group ? `group ${group.name}` : null}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="rv-tb-button"
          title="Close"
          aria-label="Close"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </header>
      <div className="rv-sidecard-body">
        {actions?.onShowRelated ? (
          <div className="rv-sidecard-actions">
            <button
              type="button"
              className="rv-sidecard-action"
              onClick={() => actions.onShowRelated?.(table.id)}
            >
              <RouteIcon />
              <span>Show related</span>
            </button>
          </div>
        ) : null}
        {table.note ? <p className="rv-sidecard-note">{table.note}</p> : null}
        <ul className="rv-sidecard-cols">
          {table.columns.map((c) => (
            <li key={c.name}>
              <div className="rv-sidecard-col">
                <span className="rv-sidecard-name">{c.name}</span>
                <span className="rv-sidecard-type">{typeLabel(c)}</span>
              </div>
              {flags(c).length || c.default ? (
                <div className="rv-sidecard-flags">
                  {flags(c).map((f) => (
                    <span key={f} className="rv-chip">
                      {f}
                    </span>
                  ))}
                  {c.default ? (
                    <span className="rv-chip">default {String(c.default.value)}</span>
                  ) : null}
                </div>
              ) : null}
              {c.note ? <p className="rv-sidecard-colnote">{c.note}</p> : null}
            </li>
          ))}
        </ul>
        {table.indexes.length ? (
          <>
            <h4>Indexes</h4>
            <ul className="rv-sidecard-list">
              {table.indexes.map((ix, i) => (
                <li key={i}>
                  <code>({ix.columns.map((c) => c.value).join(', ')})</code>
                  {ix.pk ? ' pk' : ix.unique ? ' unique' : ''}
                  {ix.name ? ` · ${ix.name}` : ''}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {refs.length ? (
          <>
            <h4>References</h4>
            <ul className="rv-sidecard-list">
              {refs.map((r) => (
                <li key={r.id}>
                  <code>
                    {r.from.tableId}.{r.from.columns.join(',')} {r.relation} {r.to.tableId}.
                    {r.to.columns.join(',')}
                  </code>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </aside>
  );
}
