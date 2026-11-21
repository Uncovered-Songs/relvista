/**
 * Editor ↔ diagram sync (design §4.7): node click → reveal its code, cursor in a block →
 * highlight its node. The diagram never steals focus from Monaco and vice versa, so the two
 * directions cannot loop.
 */
import type { SourceSpan } from '@relvista/core';
import type { CanvasNodeEvent } from '@relvista/renderer';
import * as models from '../monaco/models.js';
import { nodeAtPosition, spanToRange, type Range } from '../monaco/positions.js';
import { monaco } from '../monaco/setup.js';
import { store } from '../state/store.js';

/** Shows a file in the editor (keeping each file's scroll and cursor). */
export function showFile(key: string): void {
  const ed = store.editor;
  const model = models.getModel(key);
  if (ed && model && ed.getModel() !== model) {
    const current = ed.getModel();
    if (current) models.saveViewState(models.keyOfUri(current.uri), ed.saveViewState());
    ed.setModel(model);
    const vs = models.viewStateOf(key);
    if (vs) ed.restoreViewState(vs);
  }
  store.setActiveFile(key);
}

let flash: monaco.editor.IEditorDecorationsCollection | null = null;
let flashTimer: ReturnType<typeof setTimeout> | null = null;

/** Opens the file, puts the cursor at `range` start, reveals it and flashes the lines. */
export function revealRange(
  key: string,
  range: Range,
  options: { focus?: boolean; flash?: boolean } = {},
): void {
  showFile(key);
  const ed = store.editor;
  if (!ed) return;
  store.setTab('code');
  ed.setPosition({ lineNumber: range.startLineNumber, column: range.startColumn });
  ed.revealRangeInCenterIfOutsideViewport(range, monaco.editor.ScrollType.Smooth);
  if (options.flash !== false) {
    flash?.clear();
    if (flashTimer !== null) clearTimeout(flashTimer);
    flash = ed.createDecorationsCollection([
      {
        range: new monaco.Range(range.startLineNumber, 1, range.endLineNumber, 1),
        options: { isWholeLine: true, className: 'rv-flash' },
      },
    ]);
    flashTimer = setTimeout(() => flash?.clear(), 800);
  }
  if (options.focus) ed.focus();
}

export function revealSpan(span: SourceSpan, options: { focus?: boolean } = {}): void {
  revealRange(span.file, spanToRange(span), { focus: options.focus === true, flash: true });
}

/** Span of a node id in the current model. */
export function spanOfNode(id: string): SourceSpan | null {
  const m = store.getState().compile.model;
  if (!m) return null;
  return (
    m.tables.find((t) => t.id === id)?.span ??
    m.stickyNotes.find((n) => n.id === id)?.span ??
    m.groups.find((g) => g.id === id)?.span ??
    null
  );
}

export function onNodeClick(e: CanvasNodeEvent): void {
  if (e.shiftKey || e.metaKey || e.ctrlKey) return;
  const span = e.span ?? spanOfNode(e.id);
  // Keep focus on the canvas (Delete / arrows keep acting there); on mobile the code tab stays hidden.
  if (span) {
    const tab = store.getState().tab;
    revealSpan(span);
    if (tab === 'diagram') store.setTab('diagram');
  }
}

let cursorTimer: ReturnType<typeof setTimeout> | null = null;

/** Cursor moved in Monaco: highlight the node of the block, debounced 100 ms. */
export function onCursorMoved(key: string, position: { lineNumber: number; column: number }): void {
  if (cursorTimer !== null) clearTimeout(cursorTimer);
  cursorTimer = setTimeout(() => {
    const ed = store.editor;
    if (!ed?.hasTextFocus()) return;
    // One "current table" at a time: the cursor's. A node selected by an earlier click no longer
    // is.
    if (store.canvas?.getSelection().length) store.canvas.setSelection([]);
    const id = nodeAtPosition(store.getState().compile.model, key, position);
    if (id === store.getState().highlightedNodeId) return;
    store.setHighlight(id);
    if (id) store.canvas?.focusNode(id, { onlyIfHidden: true, duration: 250 });
  }, 100);
}
