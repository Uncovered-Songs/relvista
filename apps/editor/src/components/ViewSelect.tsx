/**
 * The DiagramView switcher and manager (design phase3 §6.7): "View: All tables ▾" opens the views
 * (current one checked; a filter field once there are more than 7), then New view from selection,
 * Edit view…, Delete view…. Unlimited views; the label truncates with a tooltip.
 */
import { DEFAULT_VIEW } from '@relvista/core';
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import {
  EMPTY_DEFINITION,
  VIEW_FILTER_MIN,
  definitionFromSelection,
  filterViews,
  nextViewName,
} from '../diagram/views.js';
import { store, useEditor } from '../state/store.js';
import { CheckIcon, ChevronDown } from './icons.js';
import type { MenuItem } from './Menu.js';
import './editing.css';

const ALL = 'All tables';

/** New view (from the canvas selection when there is one). */
export function newView(): void {
  const model = store.getState().compile.model;
  if (!model) return;
  const selection = store.canvas?.getSelection() ?? [];
  store.openViewEditor({
    mode: 'create',
    name: nextViewName(model.views),
    initial: selection.length ? definitionFromSelection(model, selection) : { ...EMPTY_DEFINITION },
  });
}

/** Edit view… of the open named view. */
export function editView(name = store.getState().ws.view): void {
  const d = store.viewDefinitionOf(name);
  if (d) store.openViewEditor({ mode: 'edit', name, initial: d });
}

function manageItems(): MenuItem[] {
  const s = store.getState();
  const model = s.compile.model;
  const view = s.ws.view;
  const named = view !== DEFAULT_VIEW && !!model?.views.some((v) => v.name === view);
  const selected = (store.canvas?.getSelection() ?? []).length;
  return [
    {
      id: 'v-new',
      label: selected ? 'New view from selection' : 'New view…',
      hint: selected ? `${selected} selected` : undefined,
      separator: true,
      disabled: !model,
      onSelect: newView,
    },
    {
      id: 'v-edit',
      label: 'Edit view…',
      disabled: !named,
      title: named ? undefined : 'Open a named view to edit it',
      onSelect: () => editView(view),
    },
    {
      id: 'v-delete',
      label: 'Delete view…',
      disabled: !named,
      title: named ? undefined : 'Open a named view to delete it',
      onSelect: () => void store.requestDeleteView(view),
    },
  ];
}

/** Items of the View submenu of the ⋯ menu: the views, then the manager items. */
export function viewItems(): MenuItem[] {
  const s = store.getState();
  const model = s.compile.model;
  if (!model) return [];
  const views = model.views;
  const view = s.ws.view;
  const items: MenuItem[] = [
    {
      id: 'v-*',
      label: ALL,
      checked: view === DEFAULT_VIEW,
      onSelect: () => store.setView(DEFAULT_VIEW),
    },
    ...views.map((v) => ({
      id: `v-${v.name}`,
      label: v.name,
      checked: view === v.name,
      onSelect: () => store.setView(v.name),
    })),
  ];
  if (view !== DEFAULT_VIEW && !views.some((v) => v.name === view)) {
    items.push({ id: 'v-missing', label: `${view} (not found)`, checked: true, disabled: true });
  }
  return [...items, ...manageItems()];
}

function ViewMenu(props: {
  labelledBy: string;
  initialFocus: 'first' | 'last';
  onClose(returnFocus: boolean): void;
}): ReactElement {
  const model = useEditor((s) => s.compile.model);
  const view = useEditor((s) => s.ws.view);
  const views = model?.views ?? [];
  const [query, setQuery] = useState('');
  const filter = views.length >= VIEW_FILTER_MIN;
  const shown = filterViews(views, query);
  const ref = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const manage = manageItems();
  const missing = view !== DEFAULT_VIEW && !views.some((v) => v.name === view);

  const buttons = () => [
    ...(ref.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? []),
  ];

  useLayoutEffect(() => {
    if (filter && props.initialFocus === 'first') {
      input.current?.focus();
      return;
    }
    const list = buttons();
    const checked = list.find((b) => b.getAttribute('aria-checked') === 'true');
    (props.initialFocus === 'last' ? list[list.length - 1] : (checked ?? list[0]))?.focus();
  }, []);

  const choose = (name: string) => {
    props.onClose(true);
    store.setView(name);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = buttons();
    const i = list.indexOf(document.activeElement as HTMLButtonElement);
    const inInput = document.activeElement === input.current;
    const focus = (n: number) => {
      e.preventDefault();
      if (filter && n < 0) input.current?.focus();
      else list[(n + list.length) % list.length]?.focus();
    };
    switch (e.key) {
      case 'ArrowDown':
        focus(inInput ? 0 : i + 1);
        break;
      case 'ArrowUp':
        if (inInput) e.preventDefault();
        else focus(i === 0 && filter ? -1 : i - 1);
        break;
      case 'Home':
        if (!inInput) focus(0);
        break;
      case 'End':
        if (!inInput) focus(list.length - 1);
        break;
      case 'Enter':
        if (inInput) {
          e.preventDefault();
          const first = query.trim() ? shown[0] : undefined;
          if (first) choose(first.name);
        }
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation();
        if (inInput && query) setQuery('');
        else props.onClose(true);
        break;
      case 'Tab':
        props.onClose(false);
        break;
    }
  };

  const item = (
    key: string,
    label: string,
    checked: boolean | undefined,
    onSelect: () => void,
    extra: { disabled?: boolean; title?: string; hint?: string } = {},
  ) => (
    <button
      key={key}
      type="button"
      role={checked === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={checked}
      aria-disabled={extra.disabled || undefined}
      title={extra.title ?? (label.length > 28 ? label : undefined)}
      className="ed-menu__item"
      tabIndex={-1}
      onClick={() => {
        if (!extra.disabled) onSelect();
      }}
    >
      <span className="ed-menu__check" aria-hidden="true">
        {checked ? <CheckIcon /> : null}
      </span>
      <span className="ed-menu__label">
        <span className="ed-viewmenu__name">{label}</span>
        {extra.hint && <span className="ed-menu__hint">{extra.hint}</span>}
      </span>
    </button>
  );

  return (
    <div ref={ref} className="ed-menu ed-viewmenu" onKeyDown={onKeyDown}>
      {filter && (
        <div className="ed-viewmenu__filter">
          <input
            ref={input}
            type="search"
            className="ed-input"
            placeholder={`Filter ${views.length} views`}
            aria-label="Filter views"
            aria-controls={listId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}
      <div id={listId} role="menu" aria-labelledby={props.labelledBy} className="ed-viewmenu__list">
        {!query.trim() && item('v-*', ALL, view === DEFAULT_VIEW, () => choose(DEFAULT_VIEW))}
        {shown.map((v) => item(`v-${v.name}`, v.name, view === v.name, () => choose(v.name)))}
        {missing &&
          item('v-missing', `${view} (not found)`, true, () => undefined, { disabled: true })}
        {query.trim() && shown.length === 0 && (
          <div className="ed-viewmenu__empty" role="presentation">
            No view matches “{query.trim()}”
          </div>
        )}
      </div>
      <div className="ed-menu__sep" role="separator" />
      <div role="menu" aria-label="Manage views">
        {manage.map((m) =>
          item(
            m.id,
            m.label,
            undefined,
            () => {
              props.onClose(false);
              m.onSelect?.();
            },
            { disabled: m.disabled, title: m.title, hint: m.hint },
          ),
        )}
      </div>
    </div>
  );
}

export function ViewSelect(): ReactElement | null {
  const hasModel = useEditor((s) => s.compile.model !== null);
  const view = useEditor((s) => s.ws.view);
  const [open, setOpen] = useState<'first' | 'last' | null>(null);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  if (!hasModel) return null;
  const current = view === DEFAULT_VIEW ? ALL : view;
  return (
    <div className="ed-menubutton ed-menubutton--right" ref={root}>
      <button
        ref={button}
        id={id}
        type="button"
        className="ed-btn"
        aria-haspopup="menu"
        aria-expanded={open !== null}
        aria-label={`View: ${current}`}
        title={`DiagramView shown in the diagram: ${current}`}
        onClick={() => setOpen(open ? null : 'first')}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(e.key === 'ArrowDown' ? 'first' : 'last');
          }
        }}
      >
        <span className="ed-view">
          <span className="ed-view__label">View:</span>
          <span className="ed-view__name">{current}</span>
        </span>
        <ChevronDown className="ed-btn__chev" />
      </button>
      {open && (
        <ViewMenu
          labelledBy={id}
          initialFocus={open}
          onClose={(returnFocus) => {
            setOpen(null);
            if (returnFocus) button.current?.focus();
          }}
        />
      )}
    </div>
  );
}
