import type { ReactElement } from 'react';
import { nodeEntry } from '@relvista/renderer';
import { store } from '../state/store.js';
import { MenuButton, type MenuItem } from './Menu.js';
import { mod } from './shortcutLabel.js';

export function autoLayoutItems(): MenuItem[] {
  const s = store.getState();
  const noDiagram = !s.compile.model;
  const groups = store.viewGroupIds();
  const collapsed = groups.filter(
    (id) => nodeEntry(s.ws.layout, s.ws.view, id)?.collapsed === true,
  ).length;
  const noGroups = groups.length === 0 ? 'No TableGroups in this view' : undefined;
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
    {
      id: 'collapse-all',
      label: 'Collapse all groups',
      separator: true,
      disabled: groups.length === 0 || collapsed === groups.length,
      title: noGroups,
      onSelect: () => store.setAllGroupsCollapsed(true),
    },
    {
      id: 'expand-all',
      label: 'Expand all',
      hint: 'Every collapsed group',
      disabled: collapsed === 0,
      title: noGroups,
      onSelect: () => store.setAllGroupsCollapsed(false),
    },
  ];
}

export function AutoLayoutMenu(): ReactElement {
  return <MenuButton label="Auto-layout" items={autoLayoutItems} />;
}
