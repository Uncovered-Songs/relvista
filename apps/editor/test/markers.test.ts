import type { Diagnostic } from '@relvista/core';
import { describe, expect, it } from 'vitest';
import {
  Severity,
  countDiagnostics,
  diagnosticsToMarkers,
  widenRange,
} from '../src/monaco/markers.js';

const d = (
  file: string,
  severity: 'error' | 'warning',
  l: number,
  c: number,
  el = l,
  ec = c,
): Diagnostic => ({
  file,
  severity,
  message: `${severity} at ${l}:${c}`,
  code: 3001,
  start: { line: l, column: c, offset: 0 },
  end: { line: el, column: ec, offset: 0 },
});

describe('markers', () => {
  const lines = ['Table users {', '  id int', '', '}'];
  const lineText = (n: number) => lines[n - 1];
  it('maps severities and keeps the code as a string', () => {
    const m = diagnosticsToMarkers(
      [d('a.dbml', 'error', 1, 1, 1, 6), d('a.dbml', 'warning', 2, 3, 2, 5)],
      'a.dbml',
      lineText,
    );
    expect(m.map((x) => x.severity)).toEqual([Severity.Error, Severity.Warning]);
    expect(m[0]!.code).toBe('3001');
    expect(m[0]!.source).toBe('dbml');
  });
  it('filters per file', () => {
    const m = diagnosticsToMarkers(
      [d('a.dbml', 'error', 1, 1), d('b.dbml', 'error', 1, 1)],
      'b.dbml',
    );
    expect(m).toHaveLength(1);
  });
  it('widens zero-width ranges to the word', () => {
    const r = widenRange(
      { startLineNumber: 1, startColumn: 8, endLineNumber: 1, endColumn: 8 },
      lineText,
    );
    expect(r).toMatchObject({ startColumn: 7, endColumn: 12 }); // "users"
  });
  it('widens to one character on punctuation, backwards at end of line', () => {
    expect(
      widenRange(
        { startLineNumber: 1, startColumn: 13, endLineNumber: 1, endColumn: 13 },
        lineText,
      ),
    ).toMatchObject({ startColumn: 13, endColumn: 14 });
    expect(
      widenRange({ startLineNumber: 2, startColumn: 9, endLineNumber: 2, endColumn: 9 }, lineText),
    ).toMatchObject({ startColumn: 8, endColumn: 9 });
  });
  it('leaves empty lines and real ranges alone', () => {
    const empty = { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 1 };
    expect(widenRange(empty, lineText)).toEqual(empty);
    const real = { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 6 };
    expect(widenRange(real, lineText)).toBe(real);
  });
  it('counts', () => {
    expect(
      countDiagnostics([d('a', 'error', 1, 1), d('a', 'warning', 1, 1), d('a', 'error', 1, 1)]),
    ).toEqual({ errors: 2, warnings: 1 });
  });
});
