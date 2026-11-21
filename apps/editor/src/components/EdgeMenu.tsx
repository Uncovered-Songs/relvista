/**
 * Context menu of a ref line (design phase3 §6.5): Reveal in code · Colour ▸ · Mark inactive /
 * Mark active. Refs the edit helpers cannot target (an inline ref has no settings list, a ref from
 * a TablePartial) get the items disabled with "Edit this ref in code".
 */
import type { SourceSpan } from '@relvista/core';
import { useMemo, type ReactElement } from 'react';
import { store, useEditor } from '../state/store.js';
import { ContextMenu, colorItem, refocusNode, type CtxItem } from './NodeMenu.js';

export interface EdgeMenuTarget {
  /** Ref id. */
  id: string;
  span: SourceSpan | null;
  x: number;
  y: number;
  /** Node to give focus back to (the menu was opened from its Refs ▸ submenu). */
  returnTo?: string;
}

export const REF_IN_CODE = 'Edit this ref in code';

export function EdgeMenu(props: {
  target: EdgeMenuTarget;
  onReveal(span: SourceSpan): void;
  onClose(): void;
}): ReactElement {
  const { target } = props;
  const model = useEditor((s) => s.compile.model);
  const ref = model?.refs.find((r) => r.id === target.id) ?? null;
  const items = useMemo((): CtxItem[] => {
    const span = target.span ?? ref?.span ?? null;
    const inactive = ref?.inactive === true;
    const canToggle = !!ref && store.canEditSetting({ kind: 'ref', id: target.id }, 'inactive');
    return [
      {
        id: 'reveal',
        label: 'Reveal in code',
        disabled: !span,
        run: () => {
          if (span) props.onReveal(span);
        },
      },
      colorItem(model, [{ kind: 'ref', id: target.id }], {
        label: 'Colour',
        disabledTitle: REF_IN_CODE,
        separator: true,
      }),
      {
        id: 'inactive',
        label: inactive ? 'Mark active' : 'Mark inactive',
        disabled: !canToggle,
        title: canToggle
          ? inactive
            ? 'Sets inactive off: drawn as a regular ref again'
            : 'Sets inactive: true (drawn dashed)'
          : REF_IN_CODE,
        run: () => store.setRefInactive([target.id], !inactive),
      },
    ];
  }, [model, ref, target.id, target.span]);

  return (
    <ContextMenu
      x={target.x}
      y={target.y}
      label={`Actions for ref ${ref?.name ?? ''}`.trim()}
      items={items}
      onClose={(refocus) => {
        props.onClose();
        if (refocus && target.returnTo) refocusNode(target.returnTo);
      }}
    />
  );
}
