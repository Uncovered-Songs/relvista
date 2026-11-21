/** Context menu of a diagram node: Reveal in code · Pin / Unpin · Collapse / Expand. */
import { nodeEntry } from '@relvista/renderer';
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { store, useEditor } from '../state/store.js';

export interface NodeMenuTarget {
  id: string;
  kind: 'table' | 'note' | 'group';
  x: number;
  y: number;
  /** Ids the settings apply to (the selection when the node is part of it). */
  ids: string[];
}

/** Focuses the diagram node `id` again (after the menu closes without moving focus elsewhere). */
function refocusNode(id: string): void {
  requestAnimationFrame(() => {
    const sel = `.rv-canvas .react-flow__node[data-id="${CSS.escape(id)}"]`;
    document.querySelector<HTMLElement>(sel)?.focus();
  });
}

export function NodeMenu(props: {
  target: NodeMenuTarget;
  onReveal(id: string): void;
  onClose(): void;
}): ReactElement {
  const { target } = props;
  const layout = useEditor((s) => s.ws.layout);
  const view = useEditor((s) => s.ws.view);
  const entry = nodeEntry(layout, view, target.id);
  const pinned = entry?.pinned === true;
  const collapsed = entry?.collapsed === true;
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: target.x, top: target.y });
  const many = target.ids.length > 1;
  /** Closes; `refocus`: focus goes back to the node (Esc, Pin, Collapse), not to <body>. */
  const close = (refocus: boolean) => {
    props.onClose();
    if (refocus) refocusNode(target.id);
  };

  const items = [
    {
      id: 'reveal',
      label: 'Reveal in code',
      refocus: false, // focus moves to the code
      run: () => props.onReveal(target.id),
    },
    ...(target.kind !== 'group'
      ? [
          {
            id: 'pin',
            label: `${pinned ? 'Unpin' : 'Pin'} position${many ? ` (${target.ids.length})` : ''}`,
            refocus: true,
            run: () => store.canvas?.setNodeSettings(target.ids, { pinned: !pinned }),
          },
        ]
      : []),
    ...(target.kind === 'table'
      ? [
          {
            id: 'collapse',
            label: `${collapsed ? 'Expand' : 'Collapse'}${many ? ` (${target.ids.length})` : ''}`,
            refocus: true,
            run: () => store.canvas?.setNodeSettings(target.ids, { collapsed: !collapsed }),
          },
        ]
      : []),
  ];

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(target.x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(target.y, window.innerHeight - r.height - 8)),
    });
    el.querySelector<HTMLButtonElement>('button')?.focus();
  }, [target.x, target.y]);

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) props.onClose();
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [props]);

  return (
    <div
      ref={ref}
      className="ed-menu ed-nodemenu"
      role="menu"
      aria-label={`Actions for ${target.id}`}
      style={{ position: 'fixed', left: pos.left, top: pos.top }}
      onKeyDown={(e) => {
        const buttons = [...(ref.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const n = (i + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[n]?.focus();
        } else if (e.key === 'Escape' || e.key === 'Tab') {
          e.preventDefault();
          close(true);
        }
      }}
    >
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="menuitem"
          className="ed-menu__item"
          onClick={() => {
            close(it.refocus);
            it.run();
          }}
        >
          <span className="ed-menu__check" aria-hidden="true" />
          <span className="ed-menu__label">{it.label}</span>
        </button>
      ))}
    </div>
  );
}
