import type { ReactElement } from 'react';
import { store } from '../state/store.js';
import { MenuButton, type MenuItem } from './Menu.js';
import { mod } from './shortcutLabel.js';

export function autoLayoutItems(): MenuItem[] {
  const noDiagram = !store.getState().compile.model;
  return [
    {
      id: 'arrange',
      label: 'Arrange',
      hint: 'Keeps pinned tables in place',
      shortcut: mod('L', { alt: true }),
      disabled: noDiagram,
      onSelect: () => void store.autoLayout('unpinned'),
    },
    {
      id: 'unplaced',
      label: 'Place new tables only',
      disabled: noDiagram,
      onSelect: () => void store.autoLayout('unplaced'),
    },
  ];
}

export function AutoLayoutMenu(): ReactElement {
  return <MenuButton label="Auto-layout" items={autoLayoutItems} />;
}
