/** The DiagramView picker: a menu button like the others ("View: All tables ▾"). */
import { DEFAULT_VIEW } from '@relvista/core';
import type { ReactElement } from 'react';
import { store, useEditor } from '../state/store.js';
import { MenuButton, type MenuItem } from './Menu.js';

const ALL = 'All tables';

/** Items of the View menu (also the View submenu of the ⋯ menu); empty without views. */
export function viewItems(): MenuItem[] {
  const s = store.getState();
  const views = s.compile.model?.views ?? [];
  const view = s.ws.view;
  if (views.length === 0 && view === DEFAULT_VIEW) return [];
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
  return items;
}

export function ViewSelect(): ReactElement | null {
  const views = useEditor((s) => s.compile.model?.views ?? null);
  const view = useEditor((s) => s.ws.view);
  if (!views || (views.length === 0 && view === DEFAULT_VIEW)) return null;
  const current = view === DEFAULT_VIEW ? ALL : view;
  return (
    <MenuButton
      label={
        <span className="ed-view">
          <span className="ed-view__label">View:</span>
          <span className="ed-view__name">{current}</span>
        </span>
      }
      ariaLabel={`View: ${current}`}
      title="DiagramView shown in the diagram"
      align="right"
      items={viewItems}
    />
  );
}
