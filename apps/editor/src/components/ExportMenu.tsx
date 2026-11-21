import type { ReactElement } from 'react';
import { EXPORT_FORMATS } from '../sql/sql.js';
import { store } from '../state/store.js';
import { MenuButton, type MenuItem } from './Menu.js';

export function exportMenuItems(): MenuItem[] {
  const s = store.getState();
  const noDiagram = !s.compile.model;
  const multi = s.ws.files.length > 1;
  const sqlBlocked = multi
    ? 'SQL export works on single-file documents'
    : s.compile.stale
      ? 'Fix the errors first'
      : undefined;
  return [
    {
      id: 'svg',
      label: 'SVG image',
      disabled: noDiagram,
      onSelect: () => void store.exportAs('svg'),
    },
    {
      id: 'png',
      label: 'PNG image',
      disabled: noDiagram,
      onSelect: () => void store.exportAs('png'),
    },
    {
      id: 'print',
      label: 'Print / PDF…',
      disabled: noDiagram,
      onSelect: () => void store.exportAs('print'),
    },
    {
      id: 'dbml',
      label: 'DBML file',
      separator: true,
      onSelect: () => void store.exportAs('dbml'),
    },
    {
      id: 'layout',
      label: 'Layout JSON',
      disabled: !s.ws.layout,
      onSelect: () => void store.exportAs('layout'),
    },
    {
      id: 'sql',
      label: 'SQL',
      separator: true,
      disabled: sqlBlocked !== undefined,
      title: sqlBlocked,
      submenu: EXPORT_FORMATS.map((f) => ({
        id: `sql-${f.id}`,
        label: f.label,
        onSelect: () => void store.exportSql(f.id, f.label),
      })),
    },
  ];
}

export function ExportMenu(): ReactElement {
  return <MenuButton label="Export" items={exportMenuItems} />;
}
