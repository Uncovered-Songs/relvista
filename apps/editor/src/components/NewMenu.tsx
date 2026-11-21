import type { ReactElement } from 'react';
import { EXAMPLES } from '../examples.js';
import { store } from '../state/store.js';
import { MenuButton, type MenuItem } from './Menu.js';

export function newMenuItems(): MenuItem[] {
  let lastGroup = '';
  const examples: MenuItem[] = EXAMPLES.map((e) => {
    const heading = e.group !== lastGroup ? e.group : undefined;
    lastGroup = e.group;
    return {
      id: `ex-${e.id}`,
      label: e.title,
      hint: e.description,
      ...(heading ? { heading } : {}),
      onSelect: () => void store.openExample(e.id),
    };
  });
  examples.push({
    id: 'ex-all',
    label: 'Browse all examples…',
    separator: true,
    onSelect: () => store.openDialog({ kind: 'examples' }),
  });
  return [
    { id: 'new-empty', label: 'Empty', onSelect: () => void store.newEmpty() },
    { id: 'new-example', label: 'From example', submenu: examples },
    { id: 'new-sql', label: 'From SQL…', onSelect: () => store.openDialog({ kind: 'sql-import' }) },
  ];
}

export function NewMenu(): ReactElement {
  return <MenuButton label="New" items={newMenuItems} />;
}
