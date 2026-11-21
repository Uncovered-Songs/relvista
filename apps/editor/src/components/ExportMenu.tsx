import type { ReactElement } from 'react';
import { EXPORT_FORMATS } from '../sql/sql.js';
import { store } from '../state/store.js';
import { MenuButton, type MenuItem } from './Menu.js';

export function exportMenuItems(): MenuItem[] {
  const s = store.getState();
  const noDiagram = !s.compile.model;
  // In compare mode SVG, PNG, PDF and print show the decorated picture (the canvas draws it).
  // Several files export too: the SQL is generated from the whole model (design phase3 §6.3).
  const sqlBlocked = !s.compile.model
    ? 'There is no schema to export yet'
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
      id: 'pdf',
      label: 'PDF…',
      hint: s.compare ? 'With the compare colours' : 'Tiled pages or one page per view',
      disabled: noDiagram,
      onSelect: () => store.openDialog({ kind: 'pdf' }),
    },
    {
      id: 'print',
      label: 'Print…',
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
