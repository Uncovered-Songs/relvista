/** SourceSpan ↔ Monaco ranges, and "which diagram node is the cursor in". Pure. */
import type { DiagramModel, SourceSpan } from '@relvista/core';

/** Structural copy of Monaco's IRange / IPosition (no runtime import). */
export interface Range {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}
export interface Position {
  lineNumber: number;
  column: number;
}

export function spanToRange(span: Pick<SourceSpan, 'start' | 'end'>): Range {
  return {
    startLineNumber: span.start.line,
    startColumn: span.start.column,
    endLineNumber: span.end.line,
    endColumn: span.end.column,
  };
}

/** Inverse of spanToRange (offsets unknown: 0). */
export function rangeToSpan(file: string, r: Range): SourceSpan {
  return {
    file,
    start: { line: r.startLineNumber, column: r.startColumn, offset: 0 },
    end: { line: r.endLineNumber, column: r.endColumn, offset: 0 },
  };
}

function before(a: { line: number; column: number }, l: number, c: number): boolean {
  return a.line < l || (a.line === l && a.column <= c);
}

export function spanContains(span: SourceSpan, file: string, p: Position): boolean {
  if (span.file !== file) return false;
  return (
    before(span.start, p.lineNumber, p.column) &&
    (span.end.line > p.lineNumber ||
      (span.end.line === p.lineNumber && span.end.column >= p.column))
  );
}

function size(span: SourceSpan): number {
  return (span.end.line - span.start.line) * 1e6 + (span.end.column - span.start.column);
}

/**
 * Innermost table, sticky note or group whose declaration contains the position. Tables win over
 * groups; among several candidates of one kind the smallest span wins.
 */
export function nodeAtPosition(
  model: DiagramModel | null,
  fileKey: string,
  position: Position,
): string | null {
  if (!model) return null;
  const pick = (items: Array<{ id: string; span: SourceSpan }>): string | null => {
    let best: { id: string; span: SourceSpan } | null = null;
    for (const it of items) {
      if (!spanContains(it.span, fileKey, position)) continue;
      if (!best || size(it.span) < size(best.span)) best = it;
    }
    return best?.id ?? null;
  };
  return pick(model.tables) ?? pick(model.stickyNotes) ?? pick(model.groups);
}

/** Model element (table, note, group, enum) whose span starts exactly at `range` start. */
export function elementStartingAt(
  model: DiagramModel,
  fileKey: string,
  line: number,
  column: number,
): { kind: 'table' | 'note' | 'group' | 'enum'; id: string } | null {
  const at = (s: SourceSpan) =>
    s.file === fileKey && s.start.line === line && s.start.column <= column;
  for (const t of model.tables) if (at(t.span)) return { kind: 'table', id: t.id };
  for (const e of model.enums) if (at(e.span)) return { kind: 'enum', id: e.id };
  for (const n of model.stickyNotes) if (at(n.span)) return { kind: 'note', id: n.id };
  for (const g of model.groups) if (at(g.span)) return { kind: 'group', id: g.id };
  return null;
}
