/**
 * Context menus of the diagram: a node's (Reveal in code · Edit text · Pin · Collapse · Colour ▸ ·
 * Add to view ▸ · Remove from view · Delete note) and the shared `ContextMenu` the edge and pane
 * menus use too: fixed at the pointer, arrows / Home / End, ArrowRight opens a submenu,
 * ArrowLeft / Esc goes back, Esc / Tab closes.
 */
import { DEFAULT_VIEW, type DiagramModel } from '@relvista/core';
import { nodeEntry } from '@relvista/renderer';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { colorSettingOf, type ElementTarget } from '../edits/dbmlEdits.js';
import { definitionFromSelection, nextViewName } from '../diagram/views.js';
import { store, useEditor } from '../state/store.js';
import { ColorMenu } from './ColorMenu.js';
import { CheckIcon, ChevronRight } from './icons.js';
import './editing.css';

export interface NodeMenuTarget {
  id: string;
  kind: 'table' | 'note' | 'group';
  x: number;
  y: number;
  /** Ids the settings apply to (the selection when the node is part of it). */
  ids: string[];
}

export interface CtxItem {
  id: string;
  label: string;
  /** Right-aligned key hint. */
  shortcut?: string;
  disabled?: boolean;
  /** Tooltip (why an item is disabled). */
  title?: string;
  checked?: boolean;
  separator?: boolean;
  /** Focus goes back to the node after the action (pin, collapse), not to <body>. */
  refocus?: boolean;
  run?: () => void;
  /** A submenu of plain items. */
  submenu?: CtxItem[];
  /** A custom submenu (the colour palette); `autoFocus` when opened from the keyboard. */
  panel?: (api: { close(refocus: boolean): void; back(): void; autoFocus: boolean }) => ReactNode;
}

/** Focuses the diagram node `id` again (after the menu closes without moving focus elsewhere). */
export function refocusNode(id: string): void {
  requestAnimationFrame(() => {
    const sel = `.rv-canvas .react-flow__node[data-id="${CSS.escape(id)}"]`;
    document.querySelector<HTMLElement>(sel)?.focus();
  });
}

const buttonsOf = (el: HTMLElement | null) =>
  [...(el?.querySelectorAll<HTMLButtonElement>(':scope > .ed-menu__row > button') ?? [])].filter(
    Boolean,
  );

function ItemButton(props: {
  it: CtxItem;
  open: boolean;
  onActivate(): void;
  onHover(): void;
}): ReactElement {
  const { it } = props;
  const sub = !!(it.submenu || it.panel);
  return (
    <button
      type="button"
      role={it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
      aria-checked={it.checked}
      aria-disabled={it.disabled || undefined}
      aria-haspopup={sub ? 'menu' : undefined}
      aria-expanded={sub ? props.open : undefined}
      className="ed-menu__item"
      title={it.title}
      tabIndex={-1}
      onClick={props.onActivate}
      onMouseEnter={props.onHover}
    >
      <span className="ed-menu__check" aria-hidden="true">
        {it.checked ? <CheckIcon /> : null}
      </span>
      <span className="ed-menu__label">{it.label}</span>
      {it.shortcut && <kbd className="ed-menu__kbd">{it.shortcut}</kbd>}
      {sub && <ChevronRight className="ed-menu__chev" />}
    </button>
  );
}

/** A submenu of plain items (Add to view ▸). */
function SubList(props: {
  items: CtxItem[];
  label: string;
  autoFocus: boolean;
  onBack(): void;
  onRun(it: CtxItem): void;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (props.autoFocus) buttonsOf(ref.current)[0]?.focus();
  }, [props.autoFocus]);
  return (
    <div
      ref={ref}
      className="ed-menu ed-menu--sub"
      role="menu"
      aria-label={props.label}
      onKeyDown={(e) => {
        const buttons = buttonsOf(ref.current);
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const n = (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[n]?.focus();
        } else if (e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          buttons[e.key === 'Home' ? 0 : buttons.length - 1]?.focus();
        } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
          e.preventDefault();
          props.onBack();
        } else return;
        e.stopPropagation();
      }}
    >
      {props.items.map((it) => (
        <div key={it.id} className="ed-menu__row" role="none">
          {it.separator && <div className="ed-menu__sep" role="separator" />}
          <ItemButton
            it={it}
            open={false}
            onActivate={() => {
              if (!it.disabled) props.onRun(it);
            }}
            onHover={() => undefined}
          />
        </div>
      ))}
    </div>
  );
}

export function ContextMenu(props: {
  x: number;
  y: number;
  label: string;
  items: CtxItem[];
  /** `refocus`: give focus back to where the menu was opened from. */
  onClose(refocus: boolean): void;
}): ReactElement {
  const { items } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: props.x, top: props.y });
  const [sub, setSub] = useState<{ index: number; keyboard: boolean } | null>(null);
  const [flip, setFlip] = useState(false);
  const closeRef = useRef(props.onClose);
  closeRef.current = props.onClose;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(props.x, window.innerWidth - r.width - 8));
    setPos({ left, top: Math.max(8, Math.min(props.y, window.innerHeight - r.height - 8)) });
    // Submenus open to the left when there is no room on the right (240 px palette / list).
    setFlip(left + r.width + 250 > window.innerWidth);
    buttonsOf(el)[0]?.focus();
  }, [props.x, props.y]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) closeRef.current(false);
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, []);

  const close = (refocus: boolean) => closeRef.current(refocus);
  const run = (it: CtxItem) => {
    close(it.refocus === true);
    it.run?.();
  };
  const activate = (i: number, keyboard: boolean) => {
    const it = items[i];
    if (!it || it.disabled) return;
    if (it.submenu || it.panel) setSub({ index: i, keyboard });
    else run(it);
  };
  const back = () => {
    const i = sub?.index;
    setSub(null);
    if (i !== undefined) buttonsOf(ref.current)[i]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const buttons = buttonsOf(ref.current);
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (i < 0 && sub) return; // the submenu handles its keys
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        const n = (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[n]?.focus();
        setSub(null);
        break;
      }
      case 'Home':
      case 'End':
        e.preventDefault();
        buttons[e.key === 'Home' ? 0 : buttons.length - 1]?.focus();
        break;
      case 'ArrowRight':
        if (i >= 0 && (items[i]?.submenu || items[i]?.panel)) {
          e.preventDefault();
          activate(i, true);
        }
        break;
      case 'Enter':
      case ' ':
        if (i >= 0) {
          e.preventDefault();
          activate(i, true);
        }
        break;
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
    }
    e.stopPropagation();
  };

  return (
    <div
      ref={ref}
      className={`ed-menu ed-nodemenu${flip ? ' ed-nodemenu--flip' : ''}`}
      role="menu"
      aria-label={props.label}
      style={{ position: 'fixed', left: pos.left, top: pos.top }}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((it, i) => (
        <div key={it.id} className="ed-menu__row" role="none">
          {it.separator && <div className="ed-menu__sep" role="separator" />}
          <ItemButton
            it={it}
            open={sub?.index === i}
            onActivate={() => activate(i, false)}
            onHover={() => {
              if (sub?.index === i) return;
              setSub(
                !it.disabled && (it.submenu || it.panel) ? { index: i, keyboard: false } : null,
              );
            }}
          />
          {sub?.index === i && it.panel?.({ close, back, autoFocus: sub.keyboard })}
          {sub?.index === i && it.submenu && (
            <SubList
              items={it.submenu}
              label={it.label}
              autoFocus={sub.keyboard}
              onBack={back}
              onRun={run}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

const kindOf = (id: string): NodeMenuTarget['kind'] =>
  id.startsWith('note:') ? 'note' : id.startsWith('group:') ? 'group' : 'table';

function colorOf(model: DiagramModel, t: ElementTarget): string | null {
  const c =
    t.kind === 'table'
      ? model.tables.find((x) => x.id === t.id)?.headerColor
      : t.kind === 'group'
        ? model.groups.find((x) => x.id === t.id)?.color
        : t.kind === 'note'
          ? model.stickyNotes.find((x) => x.id === t.id)?.color
          : model.refs.find((x) => x.id === t.id)?.color;
  return c ? c.toLowerCase() : null;
}

/** Colour ▸ for elements of one kind (a disabled item with a reason when none can be edited). */
export function colorItem(
  model: DiagramModel | null,
  targets: ElementTarget[],
  options: { label?: string; disabledTitle: string; separator?: boolean } = {
    disabledTitle: 'Edit this in code',
  },
): CtxItem {
  const kind = targets[0]?.kind ?? 'table';
  const editable = targets.filter((t) => store.canEditSetting(t, colorSettingOf(kind)));
  const colors = model ? targets.map((t) => colorOf(model, t)) : [];
  const shared = colors.length && colors.every((c) => c === colors[0]) ? colors[0]! : null;
  const label = options.label ?? (kind === 'table' ? 'Header colour' : 'Colour');
  return {
    id: 'colour',
    label,
    separator: options.separator,
    disabled: editable.length === 0,
    title: editable.length === 0 ? options.disabledTitle : undefined,
    panel: ({ close, back, autoFocus }) => (
      <ColorMenu
        current={shared}
        hasColor={colors.some((c) => c !== null)}
        label={label}
        autoFocus={autoFocus}
        onBack={back}
        onPick={(color) => {
          close(true);
          store.setColor(editable, color);
        }}
      />
    ),
  };
}

/** Add to view ▸ (every named view) and Remove from view (the open named view). */
function viewItems(model: DiagramModel | null, view: string, ids: string[]): CtxItem[] {
  const views = model?.views ?? [];
  const n = ids.length > 1 ? ` (${ids.length})` : '';
  const shownIn = (name: string) => {
    const v = views.find((x) => x.name === name);
    return !!v && ids.every((id) => [...v.tableIds, ...v.noteIds, ...v.groupIds].includes(id));
  };
  const items: CtxItem[] = [
    {
      id: 'add-view',
      label: `Add to view${n}`,
      separator: true,
      submenu: [
        ...views
          .filter((v) => v.name !== view)
          .map((v) => ({
            id: `add-${v.name}`,
            label: v.name,
            disabled: shownIn(v.name),
            title: shownIn(v.name) ? `Already shown in ${v.name}` : undefined,
            run: () => store.addToView(v.name, ids),
          })),
        {
          id: 'add-new',
          label: 'New view from selection…',
          separator: views.some((v) => v.name !== view),
          run: () => {
            if (!model) return;
            store.openViewEditor({
              mode: 'create',
              name: nextViewName(views),
              initial: definitionFromSelection(model, ids),
            });
          },
        },
      ],
    },
  ];
  if (view !== DEFAULT_VIEW && views.some((v) => v.name === view)) {
    items.push({
      id: 'remove-view',
      label: `Remove from view${n}`,
      title: `Hide from ${view} (changes its DiagramView block)`,
      run: () => store.removeFromView(ids),
    });
  }
  return items;
}

export function NodeMenu(props: {
  target: NodeMenuTarget;
  onReveal(id: string): void;
  /** Opens the edge menu of a ref (Refs ▸: the keyboard path to ref colours and inactive). */
  onRef?(refId: string): void;
  /** Items after the view items (DiagramPane: Show related ▸ 1 / 2 / 3 hops). */
  extraItems?: CtxItem[];
  onClose(): void;
}): ReactElement {
  const { target } = props;
  const layout = useEditor((s) => s.ws.layout);
  const view = useEditor((s) => s.ws.view);
  const model = useEditor((s) => s.compile.model);
  const entry = nodeEntry(layout, view, target.id);
  const pinned = entry?.pinned === true;
  const collapsed = entry?.collapsed === true;
  const many = target.ids.length > 1;
  const count = many ? ` (${target.ids.length})` : '';
  /** Selected elements of the target's kind: what colour and delete apply to. */
  const sameKind = target.ids.filter((id) => kindOf(id) === target.kind);
  const ofKind = sameKind.length ? sameKind : [target.id];

  const items = useMemo((): CtxItem[] => {
    const out: CtxItem[] = [];
    if (target.kind === 'note')
      out.push({
        id: 'edit',
        label: 'Edit text',
        shortcut: 'Enter',
        run: () => store.startNoteEdit(target.id),
      });
    out.push({ id: 'reveal', label: 'Reveal in code', run: () => props.onReveal(target.id) });
    if (target.kind !== 'group' || collapsed)
      out.push({
        id: 'pin',
        label: `${pinned ? 'Unpin' : 'Pin'} position${count}`,
        refocus: true,
        run: () => store.canvas?.setNodeSettings(target.ids, { pinned: !pinned }),
      });
    if (target.kind === 'table')
      out.push({
        id: 'collapse',
        label: `${collapsed ? 'Expand' : 'Collapse'}${count}`,
        refocus: true,
        run: () => store.canvas?.setNodeSettings(target.ids, { collapsed: !collapsed }),
      });
    if (target.kind === 'group')
      out.push({
        id: 'collapse-group',
        label: collapsed ? 'Expand group' : 'Collapse group',
        refocus: true,
        run: () => store.canvas?.setNodeSettings([target.id], { collapsed: !collapsed }),
      });
    out.push(
      colorItem(
        model,
        ofKind.map((id) => ({ kind: target.kind, id })),
        { disabledTitle: 'Edit this in code', separator: true },
      ),
    );
    const refs =
      target.kind === 'table' && model && props.onRef
        ? model.refs.filter((r) => r.from.tableId === target.id || r.to.tableId === target.id)
        : [];
    if (refs.length)
      out.push({
        id: 'refs',
        label: 'Refs',
        submenu: refs.map((r) => {
          const mine = r.from.tableId === target.id ? r.from : r.to;
          const other = mine === r.from ? r.to : r.from;
          const name = model!.tables.find((t) => t.id === other.tableId)?.name ?? other.tableId;
          return {
            id: `ref-${r.id}`,
            label: `${mine.columns.join(', ')} → ${name}.${other.columns.join(', ')}${r.inactive ? ' (inactive)' : ''}`,
            run: () => props.onRef?.(r.id),
          };
        }),
      });
    out.push(...viewItems(model, view, target.ids));
    out.push(...(props.extraItems ?? []));
    if (target.kind === 'note')
      out.push({
        id: 'delete',
        label: ofKind.length > 1 ? `Delete ${ofKind.length} notes` : 'Delete note',
        shortcut: 'Del',
        separator: true,
        run: () => void store.requestDeleteNotes(ofKind),
      });
    return out;
    // `model` and the layout entry decide every label; the selection is fixed while open.
  }, [model, view, pinned, collapsed, target.id, target.kind, props.extraItems]);

  return (
    <ContextMenu
      x={target.x}
      y={target.y}
      label={`Actions for ${target.id}`}
      items={items}
      onClose={(refocus) => {
        props.onClose();
        if (refocus) refocusNode(target.id);
      }}
    />
  );
}
