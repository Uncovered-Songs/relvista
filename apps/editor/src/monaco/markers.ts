/** Compile diagnostics → Monaco markers. Pure (severity numbers are Monaco's). */
import type { Diagnostic } from '@relvista/core';

export const MARKER_OWNER = 'relvista';
export const INFO_OWNER = 'dbml-info';

/** Monaco MarkerSeverity values. */
export const Severity = { Hint: 1, Info: 2, Warning: 4, Error: 8 } as const;

/** Structural copy of Monaco's IMarkerData. */
export interface MarkerData {
  severity: number;
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  code?: string;
  source?: string;
}

const WORD = /[\p{L}\p{N}_$]/u;

/**
 * Widens an empty range to the word at it, else one character (backwards at the end of a line).
 * `lineText` returns the text of a 1-based line, or undefined beyond the end.
 */
export function widenRange(
  r: Pick<MarkerData, 'startLineNumber' | 'startColumn' | 'endLineNumber' | 'endColumn'>,
  lineText: (line: number) => string | undefined,
): Pick<MarkerData, 'startLineNumber' | 'startColumn' | 'endLineNumber' | 'endColumn'> {
  if (r.startLineNumber !== r.endLineNumber || r.startColumn !== r.endColumn) return r;
  const text = lineText(r.startLineNumber) ?? '';
  const i = r.startColumn - 1; // 0-based index of the character at the column
  if (text.length === 0) return r;
  const isWord = (k: number) => k >= 0 && k < text.length && WORD.test(text[k]!);
  if (isWord(i)) {
    let a = i;
    let b = i;
    while (isWord(a - 1)) a--;
    while (isWord(b + 1)) b++;
    return { ...r, startColumn: a + 1, endColumn: b + 2 };
  }
  if (i < text.length) return { ...r, endColumn: r.startColumn + 1 };
  return { ...r, startColumn: Math.max(1, text.length), endColumn: text.length + 1 };
}

/** Markers of one file from compile diagnostics. */
export function diagnosticsToMarkers(
  diagnostics: readonly Diagnostic[],
  fileKey: string,
  lineText: (line: number) => string | undefined = () => undefined,
): MarkerData[] {
  return diagnostics
    .filter((d) => d.file === fileKey)
    .map((d) => {
      const range = widenRange(
        {
          startLineNumber: d.start.line,
          startColumn: d.start.column,
          endLineNumber: d.end.line,
          endColumn: d.end.column,
        },
        lineText,
      );
      const m: MarkerData = {
        severity: d.severity === 'error' ? Severity.Error : Severity.Warning,
        message: d.message,
        ...range,
        source: 'dbml',
      };
      if (d.code !== undefined) m.code = String(d.code);
      return m;
    });
}

export function countDiagnostics(diagnostics: readonly Diagnostic[]): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const d of diagnostics) {
    if (d.severity === 'error') errors++;
    else warnings++;
  }
  return { errors, warnings };
}
