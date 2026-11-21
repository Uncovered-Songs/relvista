/**
 * Search and path panel (docs/design/phase3-v1.md §4.7): find tables, columns, groups, notes, enums
 * and views by name, or the shortest relationship path between two tables. The host draws what
 * the panel reports (`onHits` → 'match' decorations, `onPath` → 'path' decorations) and moves the
 * viewport on `onSelect`; the panel only lists and announces.
 */
import {
  searchModel,
  shortestPath,
  tableTitle,
  type DiagramModel,
  type SearchHit,
  type SearchKind,
} from '@relvista/core';
import { useEffect, useId, useMemo, useRef, useState, type ReactElement, type Ref } from 'react';
import { CloseIcon, RouteIcon, SearchIcon, SwapIcon } from '../viewer/icons.js';
import { Combobox, type ComboOption } from './Combobox.js';
import { pathText, type TablePath } from './path.js';

/** Whether the search panel searches the model or finds a path between two tables. */
export type SearchPanelMode = 'search' | 'path';

/** Props of `SearchPanel`. */
export interface SearchPanelProps {
  /** View-filtered model (what is drawn). */
  model: DiagramModel;
  /** Called with the chosen hit (Enter / click); the host focuses and highlights it. */
  onSelect(hit: SearchHit): void;
  /** Called with the current hits while typing (host decorates them, 'match' tone). */
  onHits?(hits: SearchHit[]): void;
  /** Two-table path mode: the path (null when unconnected) and its ends, or null, null while incomplete. */
  onPath?(path: TablePath | null, ends: [string, string] | null): void;
  /** Called when the panel is closed (Esc or its close button). */
  onClose(): void;
  /** Query the panel opens with (a deep link's `q`). */
  initialQuery?: string;
  /** Opens in path mode with these two table ids (a deep link's `path`). */
  initialPath?: readonly [string, string] | null;
  /** Kinds searched. Default: all. */
  kinds?: SearchKind[];
  /** The query as it is typed (a deep link carries it). */
  onQueryChange?(query: string): void;
  /** Switched between search and path mode. */
  onModeChange?(mode: SearchPanelMode): void;
  /** Move the keyboard focus into the panel when it opens. Default true. */
  autoFocus?: boolean;
  /** Most hits listed. Default 50. */
  limit?: number;
  /** Class of the panel element. */
  className?: string;
}

const KIND_LABEL: Record<SearchKind, string> = {
  table: 'table',
  column: 'column',
  enum: 'enum',
  group: 'group',
  note: 'note',
  view: 'view',
};

function hitKey(h: SearchHit): string {
  return `${h.kind}\u0000${h.id}\u0000${h.column ?? ''}`;
}

interface End {
  text: string;
  id: string | null;
}

function endOf(model: DiagramModel, id: string | undefined): End {
  const t = id ? model.tables.find((x) => x.id === id) : undefined;
  return t ? { text: tableTitle(t), id: t.id } : { text: '', id: null };
}

/** Table picker of the path mode: every table while empty, else the table hits. */
function TablePicker({
  label,
  model,
  value,
  onChange,
  inputRef,
  describedBy,
}: {
  label: string;
  model: DiagramModel;
  value: End;
  onChange(v: End): void;
  inputRef?: Ref<HTMLInputElement>;
  describedBy?: string;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const options = useMemo<ComboOption[]>(() => {
    if (value.id) return [];
    const q = value.text.trim();
    if (!q) return model.tables.slice(0, 50).map((t) => ({ key: t.id, label: tableTitle(t) }));
    return searchModel(model, q, { kinds: ['table'], limit: 50 }).map((h) => ({
      key: h.id,
      label: h.label,
      ranges: h.ranges,
    }));
  }, [model, value.text, value.id]);
  return (
    <Combobox
      label={label}
      placeholder="Table name"
      text={value.text}
      onText={(text) => {
        setOpen(true);
        onChange({ text, id: null });
      }}
      options={options}
      open={open}
      onPick={(i) => {
        const o = options[i];
        if (!o) return;
        setOpen(false);
        const t = model.tables.find((x) => x.id === o.key);
        onChange({ text: t ? tableTitle(t) : o.label, id: o.key });
      }}
      onEscape={() => {
        if (!open || !options.length) return false;
        setOpen(false);
        return true;
      }}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      {...(inputRef ? { inputRef } : {})}
      {...(describedBy ? { describedBy } : {})}
    />
  );
}

/**
 * Search over tables, columns, enums, groups, notes and views (a combobox), with a two-table shortest-path mode.
 *
 * @param props - See {@link SearchPanelProps}.
 */
export function SearchPanel({
  model,
  onSelect,
  onHits,
  onPath,
  onClose,
  initialQuery = '',
  initialPath = null,
  kinds,
  onQueryChange,
  onModeChange,
  autoFocus = true,
  limit = 50,
  className,
}: SearchPanelProps): ReactElement {
  const statusId = useId();
  const [mode, setMode] = useState<SearchPanelMode>(initialPath ? 'path' : 'search');
  const [query, setQuery] = useState(initialQuery);
  const [from, setFrom] = useState<End>(() => endOf(model, initialPath?.[0]));
  const [to, setTo] = useState<End>(() => endOf(model, initialPath?.[1]));
  const searchInput = useRef<HTMLInputElement>(null);
  const fromInput = useRef<HTMLInputElement>(null);
  const toInput = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLElement>(null);

  // Callbacks may change identity on every host render: keep the latest without re-running effects.
  const cb = useRef({ onHits, onPath, onClose, onQueryChange, onModeChange });
  cb.current = { onHits, onPath, onClose, onQueryChange, onModeChange };

  const kindsKey = kinds ? kinds.join() : '';
  const hits = useMemo(
    () =>
      mode === 'search' ? searchModel(model, query, { limit, ...(kinds ? { kinds } : {}) }) : [],
    [model, query, mode, limit, kindsKey],
  );
  useEffect(() => cb.current.onHits?.(hits), [hits]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) return;
    cb.current.onQueryChange?.(query);
  }, [query]);
  useEffect(() => {
    if (first.current) return;
    cb.current.onModeChange?.(mode);
  }, [mode]);
  useEffect(() => {
    first.current = false;
  }, []);

  // A model change (an edit, another view) drops ends that are gone.
  useEffect(() => {
    const known = (e: End) => !e.id || model.tables.some((t) => t.id === e.id);
    if (!known(from)) setFrom({ text: from.text, id: null });
    if (!known(to)) setTo({ text: to.text, id: null });
  }, [model]);

  const path = useMemo(() => {
    if (mode !== 'path' || !from.id || !to.id) return undefined;
    return shortestPath(model, from.id, to.id);
  }, [model, mode, from.id, to.id]);
  const pathKey =
    path === undefined ? '' : JSON.stringify([from.id, to.id, path?.tableIds, path?.refIds]);
  useEffect(() => {
    if (mode !== 'path') return;
    if (path === undefined || !from.id || !to.id) cb.current.onPath?.(null, null);
    else cb.current.onPath?.(path, [from.id, to.id]);
  }, [pathKey, mode]);

  // Focus moves into the panel when it opens and goes back where it was when it closes.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    if (autoFocus) (initialPath ? (from.id ? toInput : fromInput) : searchInput).current?.focus();
    return () => {
      const now = document.activeElement;
      const inside = !now || now === document.body || !!root.current?.contains(now);
      if (inside && before && before !== document.body && before.isConnected) before.focus();
    };
  }, []);

  const switchMode = (m: SearchPanelMode) => {
    if (m === mode) return;
    setMode(m);
    if (m === 'search') cb.current.onPath?.(null, null);
    // Focus follows into the new mode's first field.
    setTimeout(() => (m === 'path' ? fromInput : searchInput).current?.focus(), 0);
  };

  const options = useMemo<ComboOption[]>(
    () =>
      hits.map((h) => ({
        key: hitKey(h),
        label: h.label,
        ranges: h.ranges,
        kind: KIND_LABEL[h.kind],
      })),
    [hits],
  );

  let status: string;
  if (mode === 'search') {
    status = !query.trim()
      ? 'Type to search tables, columns, groups, notes and views'
      : hits.length === 0
        ? 'No matches'
        : `${hits.length >= limit ? `${limit}+` : hits.length} ${hits.length === 1 ? 'result' : 'results'}`;
  } else if (from.id && to.id && path !== undefined) {
    status = pathText(model, path, [from.id, to.id]);
  } else status = 'Choose two tables to see how they are related';

  return (
    <section
      ref={root}
      className={['rv-nav-search', 'rv-nav-layer', 'nodrag', 'nopan', 'nowheel', className ?? '']
        .filter(Boolean)
        .join(' ')}
      aria-label={mode === 'search' ? 'Search the diagram' : 'Path between two tables'}
      data-rv-mode={mode}
      onKeyDown={(e) => {
        if (e.key !== 'Escape' || e.defaultPrevented) return;
        e.preventDefault();
        cb.current.onClose();
      }}
    >
      <div className="rv-nav-search-head">
        <div className="rv-nav-modes" role="group" aria-label="Mode">
          <button
            type="button"
            className="rv-nav-mode"
            aria-pressed={mode === 'search'}
            onClick={() => switchMode('search')}
          >
            <SearchIcon />
            <span>Search</span>
          </button>
          <button
            type="button"
            className="rv-nav-mode"
            aria-pressed={mode === 'path'}
            onClick={() => switchMode('path')}
          >
            <RouteIcon />
            <span>Path</span>
          </button>
        </div>
        <button
          type="button"
          className="rv-nav-icon-button"
          title="Close search (Esc)"
          aria-label="Close search"
          onClick={() => cb.current.onClose()}
        >
          <CloseIcon />
        </button>
      </div>
      {mode === 'search' ? (
        <Combobox
          label="Search"
          hideLabel
          placeholder="Tables, columns, groups…"
          text={query}
          onText={setQuery}
          options={options}
          open={query.trim().length > 0}
          onPick={(i) => {
            const h = hits[i];
            if (h) onSelect(h);
          }}
          inputRef={searchInput}
          describedBy={statusId}
          className="rv-nav-combo--search"
        />
      ) : (
        <div className="rv-nav-path">
          <TablePicker
            label="From"
            model={model}
            value={from}
            onChange={(v) => {
              setFrom(v);
              // Picked the first end: on to the second.
              if (v.id && !to.id) setTimeout(() => toInput.current?.focus(), 0);
            }}
            inputRef={fromInput}
            describedBy={statusId}
          />
          <button
            type="button"
            className="rv-nav-icon-button rv-nav-swap"
            title="Swap the two tables"
            aria-label="Swap the two tables"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            <SwapIcon />
          </button>
          <TablePicker
            label="To"
            model={model}
            value={to}
            onChange={setTo}
            inputRef={toInput}
            describedBy={statusId}
          />
        </div>
      )}
      <p
        id={statusId}
        className="rv-nav-status"
        role="status"
        aria-live="polite"
        data-rv-path={mode === 'path' && path !== undefined ? (path ? 'found' : 'none') : undefined}
      >
        {status}
      </p>
    </section>
  );
}
