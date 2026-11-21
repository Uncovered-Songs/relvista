import type { ReactElement } from 'react';
import { hasFsa } from '../files/fsAccess.js';
import { store, useEditor } from '../state/store.js';
import { MenuButton, type MenuItem } from './Menu.js';
import { mod } from './shortcutLabel.js';

export function openMenuItems(): MenuItem[] {
  const s = store.getState();
  const items: MenuItem[] = [
    {
      id: 'open-file',
      label: 'Open file…',
      shortcut: mod('O'),
      onSelect: () => void store.openFilePicker(),
    },
    {
      id: 'open-folder',
      label: 'Open folder…',
      hint: 'Best: reads and saves the layout file too',
      onSelect: () => void store.openFolderPicker(),
    },
    { id: 'open-url', label: 'Open from URL…', onSelect: () => store.openDialog({ kind: 'url' }) },
  ];
  if (hasFsa() && s.recent.length > 0) {
    items.push({
      id: 'recent',
      label: 'Recent',
      submenu: s.recent.map((r, i) => ({
        id: `recent-${i}`,
        label: r.name,
        hint: r.kind === 'directory' ? 'Folder' : 'File',
        onSelect: () => void store.openRecent(r),
      })),
    });
  }
  items.push({
    id: 'compare',
    label: s.compare ? 'Compare with another version…' : 'Compare…',
    shortcut: mod('D', { alt: true }),
    separator: true,
    disabled: !s.compile.model,
    title: s.compile.model ? undefined : 'There is no schema to compare yet',
    onSelect: () => store.openDialog({ kind: 'compare' }),
  });
  items.push({
    id: 'restore',
    label: 'Restore previous session',
    separator: true,
    disabled: !s.hasPrevious,
    title: s.hasPrevious ? undefined : 'Nothing to restore yet',
    onSelect: () => void store.restorePrevious(),
  });
  return items;
}

export function FileMenu(): ReactElement {
  useEditor((s) => s.recent.length + (s.hasPrevious ? 1 : 0) + (s.compile.model ? 2 : 0));
  return <MenuButton label="Open" items={openMenuItems} />;
}
