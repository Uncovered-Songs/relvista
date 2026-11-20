import type { Column, StickyNote, Table } from '../model/types.js';
import { METRICS, estimateTextWidth } from './metrics.js';
import type { DetailLevel } from '../layout/types.js';
import type { TextMeasure } from './types.js';

export function columnTypeLabel(column: Column): string {
  return column.typeArgs ? `${column.type}(${column.typeArgs})` : column.type;
}

/** Columns shown at a detail level. */
export function visibleColumns(table: Table, detailLevel: DetailLevel = 'all'): Column[] {
  if (detailLevel === 'names') return [];
  if (detailLevel === 'keys') return table.columns.filter((c) => c.pk || c.isFk || c.unique);
  return table.columns;
}

export function tableTitle(table: Table): string {
  return table.schema === 'public' ? table.name : `${table.schema}.${table.name}`;
}

export function measureTable(
  table: Table,
  detailLevel: DetailLevel = 'all',
  measure: TextMeasure = estimateTextWidth,
): { width: number; height: number } {
  const cols = visibleColumns(table, detailLevel);
  let width = METRICS.paddingX * 2 + measure(tableTitle(table), 'tableName');
  for (const c of cols) {
    const row =
      METRICS.paddingX * 2 +
      METRICS.keyMarkerWidth +
      measure(c.name, 'columnName') +
      METRICS.nameTypeGap +
      measure(columnTypeLabel(c), 'columnType');
    if (row > width) width = row;
  }
  width = Math.min(METRICS.maxTableWidth, Math.max(METRICS.minTableWidth, Math.ceil(width)));
  const height =
    METRICS.headerHeight +
    cols.length * METRICS.rowHeight +
    (cols.length ? METRICS.tableBottomPadding : 0);
  return { width, height };
}

/** Greedy word wrap of note text into lines that fit the note's inner width. */
export function wrapNoteText(
  content: string,
  measure: TextMeasure = estimateTextWidth,
  innerWidth: number = METRICS.noteWidth - METRICS.notePadding * 2,
): string[] {
  const lines: string[] = [];
  for (const para of content.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const w of words) {
      const candidate = line ? `${line} ${w}` : w;
      if (line && measure(candidate, 'noteText') > innerWidth) {
        lines.push(line);
        line = w;
      } else line = candidate;
    }
    lines.push(line);
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export function measureNote(
  note: StickyNote,
  measure: TextMeasure = estimateTextWidth,
): { width: number; height: number } {
  const lines = wrapNoteText(note.content, measure);
  const height = Math.max(
    METRICS.noteMinHeight,
    METRICS.notePadding * 2 + lines.length * METRICS.noteLineHeight,
  );
  return { width: METRICS.noteWidth, height };
}
