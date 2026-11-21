/**
 * Compare mode's Changes panel (design phase3 §6.11): the diff grouped (tables, refs, enums,
 * groups, notes, views) with Added / Removed / Changed filters, click → focus the node; Swap,
 * Copy summary (Markdown), the code diff toggle and Exit compare.
 */
import { useId, useMemo, useState, type ReactElement } from 'react';
import {
  changeRows,
  compareSides,
  summaryLine,
  type ChangeKindGroup,
  type ChangeRow,
  type CompareResult,
} from '../state/compare.js';
import { store, useEditor, type CompareState } from '../state/store.js';
import { baseName } from '../files/folder.js';
import { CloseIcon, CopyIcon } from './icons.js';
import './navigation.css';

const GROUPS: Array<{ id: ChangeKindGroup; label: string }> = [
  { id: 'tables', label: 'Tables' },
  { id: 'refs', label: 'Refs' },
  { id: 'enums', label: 'Enums' },
  { id: 'groups', label: 'Groups' },
  { id: 'notes', label: 'Notes' },
  { id: 'views', label: 'Views' },
];

const STATUSES = [
  { id: 'added', label: 'Added', sign: '+' },
  { id: 'removed', label: 'Removed', sign: '−' },
  { id: 'changed', label: 'Changed', sign: '~' },
] as const;

type Status = (typeof STATUSES)[number]['id'];

const SIGN: Record<Status, string> = { added: '+', removed: '−', changed: '~' };

function SwapIcon(): ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 5h9.5M10 2.5 12.5 5 10 7.5M13 11H3.5M6 8.5 3.5 11 6 13.5" />
    </svg>
  );
}

function Row({ row, onSelect }: { row: ChangeRow; onSelect(id: string): void }): ReactElement {
  const content = (
    <>
      <span className="ed-changes__sign" data-rv-tone={row.status} aria-hidden="true">
        {SIGN[row.status]}
      </span>
      <span className="ed-changes__label">
        <span className="ed-visually-hidden">{row.status} </span>
        {row.label}
        {row.detail && <span className="ed-changes__detail">{row.detail}</span>}
      </span>
    </>
  );
  // Refs, enums and views have no node of their own to focus.
  const focusable =
    row.target && (row.group === 'tables' || row.group === 'groups' || row.group === 'notes');
  return (
    <li className="ed-changes__row" data-status={row.status}>
      {focusable ? (
        <button
          type="button"
          className="ed-changes__item"
          onClick={() => onSelect(row.target!)}
          title="Show in the diagram"
        >
          {content}
        </button>
      ) : (
        <span className="ed-changes__item ed-changes__item--static">{content}</span>
      )}
    </li>
  );
}

export function ChangesPanel(props: {
  compare: CompareState;
  result: CompareResult;
  onSelect(id: string): void;
  /** After Hide / Show, once the panel is drawn at its new size. */
  onToggle?(open: boolean): void;
}): ReactElement {
  const { compare, result } = props;
  const id = useId();
  const name = useEditor((s) => baseName(s.ws.name));
  /** The one category shown, or null for all of them (single-select filter). */
  const [only, setOnly] = useState<Status | null>(null);
  const [open, setOpen] = useState(true);
  const rows = useMemo(() => changeRows(result.diff), [result.diff]);
  const counts = result.diff.summary;
  const sides = compareSides(`${name} (open)`, compare.other.label, compare.swapped);
  const shown = only ? rows.filter((r) => r.status === only) : rows;
  /** Picks a category; picking the one already shown goes back to all. */
  const pick = (s: Status | null) => setOnly((cur) => (s === cur ? null : s));

  return (
    <aside
      className="ed-changes"
      aria-labelledby={`${id}-title`}
      data-open={open ? 'true' : 'false'}
    >
      <div className="ed-changes__head">
        <h2 id={`${id}-title`} className="ed-changes__title">
          Changes
        </h2>
        <button
          type="button"
          className="ed-btn ed-btn--small"
          aria-expanded={open}
          aria-controls={`${id}-body`}
          onClick={() => {
            const next = !open;
            setOpen(next);
            requestAnimationFrame(() => props.onToggle?.(next));
          }}
        >
          {open ? 'Hide' : 'Show'}
        </button>
        <button
          type="button"
          className="ed-iconbtn"
          aria-label="Exit compare"
          title="Exit compare (Esc)"
          onClick={() => store.exitCompare()}
        >
          <CloseIcon />
        </button>
      </div>
      <p
        className="ed-changes__summary"
        role="status"
        data-added={counts.added}
        data-removed={counts.removed}
        data-changed={counts.changed}
      >
        {summaryLine(result.diff)}
      </p>
      <div id={`${id}-body`} className="ed-changes__body" hidden={!open}>
        <div className="ed-changes__sides">
          <span className="ed-changes__side" title={sides.before}>
            <span className="ed-muted">Before</span> {sides.before}
          </span>
          <button
            type="button"
            className="ed-iconbtn"
            aria-label="Swap before and after"
            title="Swap before and after"
            onClick={() => store.swapCompare()}
          >
            <SwapIcon />
          </button>
          <span className="ed-changes__side" title={sides.after}>
            <span className="ed-muted">After</span> {sides.after}
          </span>
        </div>
        <div className="ed-changes__filters" role="group" aria-label="Show">
          <button
            type="button"
            className="ed-changes__filter"
            aria-pressed={only === null}
            onClick={() => setOnly(null)}
          >
            All {counts.added + counts.removed + counts.changed}
          </button>
          {STATUSES.map((s) => (
            <button
              key={s.id}
              type="button"
              className="ed-changes__filter"
              data-rv-tone={s.id}
              aria-pressed={only === s.id}
              title={only === s.id ? 'Show all changes' : `Show only ${s.label.toLowerCase()}`}
              onClick={() => pick(s.id)}
            >
              <span aria-hidden="true">{s.sign}</span> {s.label} {counts[s.id]}
            </button>
          ))}
        </div>
        {result.diff.empty ? (
          <p className="ed-muted ed-changes__empty">The two versions are the same.</p>
        ) : (
          <div className="ed-changes__groups">
            {GROUPS.map((g) => {
              const list = shown.filter((r) => r.group === g.id);
              if (!list.length) return null;
              return (
                <section key={g.id} className="ed-changes__group" aria-label={g.label}>
                  <h3 className="ed-changes__h">
                    {g.label} <span className="ed-muted">{list.length}</span>
                  </h3>
                  <ul className="ed-changes__list">
                    {list.map((r, i) => (
                      <Row
                        key={`${r.status}:${r.target ?? r.label}:${i}`}
                        row={r}
                        onSelect={props.onSelect}
                      />
                    ))}
                  </ul>
                </section>
              );
            })}
            {shown.length === 0 && <p className="ed-muted ed-changes__empty">Nothing to show.</p>}
          </div>
        )}
        <div className="ed-changes__actions">
          <button
            type="button"
            className="ed-btn ed-btn--small"
            onClick={() => void store.copyCompareSummary()}
          >
            <CopyIcon /> Copy summary
          </button>
          <button
            type="button"
            className="ed-btn ed-btn--small"
            aria-pressed={compare.codeDiff}
            onClick={() => {
              store.setCompareCodeDiff(!compare.codeDiff);
              if (!compare.codeDiff) store.setTab('code');
            }}
          >
            {compare.codeDiff ? 'Edit code' : 'Code diff'}
          </button>
          <button
            type="button"
            className="ed-btn ed-btn--small"
            onClick={() => store.openDialog({ kind: 'compare' })}
          >
            Compare with…
          </button>
        </div>
      </div>
    </aside>
  );
}
