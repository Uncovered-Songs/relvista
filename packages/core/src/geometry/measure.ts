import type { Column, StickyNote, Table } from '../model/types.js';
import { METRICS, estimateTextWidth } from './metrics.js';
import type { DetailLevel } from '../layout/types.js';
import type { TextMeasure } from './types.js';

/**
 * A column's type as drawn. `Column.type` is normally already written with its arguments
 * (`varchar(255)`), so they are only appended when missing. Layout and renderer both use this.
 */
export function columnTypeLabel(column: Column): string {
  if (!column.typeArgs || column.type.endsWith(')')) return column.type;
  return `${column.type}(${column.typeArgs})`;
}

export interface ColumnBadge {
  kind: 'note' | 'unique' | 'notNull';
  /** Pill text ('' for the note dot). */
  label: string;
  title: string;
  width: number;
}

/** Badges drawn on a column row, in drawing order (right to left, nearest the type first). */
export function columnBadges(c: Column): ColumnBadge[] {
  const b = METRICS.badge;
  const pill = (label: string) => Math.ceil(label.length * b.fontSize * 0.68 + 7);
  const out: ColumnBadge[] = [];
  if (c.note) out.push({ kind: 'note', label: '', title: 'has note', width: b.dotWidth });
  if (c.unique && !c.pk)
    out.push({ kind: 'unique', label: 'U', title: 'unique', width: pill('U') });
  if (c.notNull && !c.pk)
    out.push({ kind: 'notNull', label: 'NN', title: 'not null', width: pill('NN') });
  return out;
}

/** Horizontal room the badges of a column take, margins on both sides included (0 when none). */
export function badgesWidth(badges: readonly ColumnBadge[]): number {
  if (!badges.length) return 0;
  const b = METRICS.badge;
  let w = b.margin * 2 + b.gap * (badges.length - 1);
  for (const x of badges) w += x.width;
  return w;
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
  let width =
    METRICS.paddingX * 2 +
    measure(tableTitle(table), 'tableName') +
    (table.note ? METRICS.headerNoteIconWidth : 0);
  for (const c of cols) {
    const row =
      METRICS.paddingX * 2 +
      METRICS.keyMarkerWidth +
      measure(c.name, 'columnName') +
      Math.max(METRICS.nameTypeGap, badgesWidth(columnBadges(c))) +
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
    for (const word of words) {
      // A word wider than the note (a URL, a long identifier) is broken by character.
      const pieces = breakWord(word, measure, innerWidth);
      for (const w of pieces) {
        const candidate = line ? `${line} ${w}` : w;
        if (line && measure(candidate, 'noteText') > innerWidth) {
          lines.push(line);
          line = w;
        } else line = candidate;
      }
    }
    lines.push(line);
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Splits `word` into pieces that each fit `maxWidth` (the word itself when it fits). */
function breakWord(word: string, measure: TextMeasure, maxWidth: number): string[] {
  if (measure(word, 'noteText') <= maxWidth) return [word];
  const chars = [...word];
  const out: string[] = [];
  let start = 0;
  while (start < chars.length) {
    // Longest prefix of the rest that fits, at least one character.
    let lo = start + 1;
    let hi = chars.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (measure(chars.slice(start, mid).join(''), 'noteText') <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    out.push(chars.slice(start, lo).join(''));
    start = lo;
  }
  return out;
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
