/**
 * Applies canvas text edits (dbmlEdits.ts) to the Monaco models: offsets into the LF text become
 * Monaco ranges, and each file gets ONE undo stop (`pushEditOperations` between two stack
 * elements), so Mod+Z in the code pane undoes the whole canvas action. Monaco writes inserted
 * line breaks with the model's EOL; saving keeps the file's BOM and line endings (phase 2 §4.4).
 */
import type * as Monaco from 'monaco-editor/editor/editor.api';
import type { FileEdit } from './dbmlEdits.js';

export interface LinePosition {
  lineNumber: number;
  column: number;
}

/** Line starts of an LF text (offset of each line's first character). */
export function lineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return starts;
}

/** UTF-16 offset in an LF text → 1-based Monaco position (columns are UTF-16 units too). */
export function positionAt(starts: number[], offset: number): LinePosition {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] ?? 0) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { lineNumber: lo + 1, column: offset - (starts[lo] ?? 0) + 1 };
}

/** The Monaco ranges of `edits` over `textLf` (edits of one file). */
export function toRanges(
  textLf: string,
  edits: FileEdit[],
): Array<{ range: Monaco.IRange; text: string }> {
  const starts = lineStarts(textLf);
  return edits.map((e) => {
    const a = positionAt(starts, Math.max(0, Math.min(e.start, textLf.length)));
    const b = positionAt(starts, Math.max(0, Math.min(e.end, textLf.length)));
    return {
      range: {
        startLineNumber: a.lineNumber,
        startColumn: a.column,
        endLineNumber: b.lineNumber,
        endColumn: b.column,
      },
      text: e.newText,
    };
  });
}

/**
 * Applies `edits` as one undo stop per file. Files without a Monaco model are skipped. Returns the
 * keys of the files that changed.
 */
export function applyFileEdits(monaco: typeof Monaco, edits: FileEdit[]): string[] {
  const byFile = new Map<string, FileEdit[]>();
  for (const e of edits) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e]);
  const changed: string[] = [];
  for (const [file, list] of byFile) {
    const model = monaco.editor.getModel(monaco.Uri.from({ scheme: 'file', path: `/${file}` }));
    if (!model) continue;
    const textLf = model.getValue(monaco.editor.EndOfLinePreference.LF, false);
    const ops = toRanges(textLf, list).map((o) => ({ ...o, forceMoveMarkers: true }));
    model.pushStackElement();
    model.pushEditOperations([], ops, () => null);
    model.pushStackElement();
    changed.push(file);
  }
  return changed;
}
