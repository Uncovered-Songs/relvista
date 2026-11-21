/**
 * The code pane in compare mode with "Code diff" on: a read-only Monaco diff editor of the other
 * version ↔ the open entry file, with a bar to swap sides or go back to editing.
 */
import { useEffect, useRef, type ReactElement } from 'react';
import { baseName } from '../files/folder.js';
import { createDiffEditor, type CompareDiffEditor } from '../monaco/diffEditor.js';
import * as models from '../monaco/models.js';
import { MONACO_THEME } from '../monaco/themes.js';
import { compareSides } from '../state/compare.js';
import { store, useEditor } from '../state/store.js';
import { useTheme } from '../theme.js';
import { useNarrow } from './useNarrow.js';
import './navigation.css';

export function CompareDiffPane(): ReactElement | null {
  const host = useRef<HTMLDivElement>(null);
  const diff = useRef<CompareDiffEditor | null>(null);
  const compare = useEditor((s) => s.compare);
  const entry = useEditor((s) => s.ws.entry);
  const wsId = useEditor((s) => s.ws.id);
  const name = useEditor((s) => baseName(s.ws.name));
  const { mode } = useTheme();
  const narrow = useNarrow();
  const otherText = compare?.other.text ?? '';
  const swapped = compare?.swapped ?? false;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    diff.current = createDiffEditor(el, { theme: MONACO_THEME[mode], inline: narrow });
    return () => {
      diff.current?.dispose();
      diff.current = null;
    };
    // Created once per mount; theme and width go through the effects below.
  }, []);

  useEffect(() => {
    const model = models.getModel(entry);
    if (model && diff.current) diff.current.setSides(otherText, model, !swapped);
  }, [otherText, swapped, entry, wsId]);

  useEffect(() => diff.current?.setTheme(MONACO_THEME[mode]), [mode]);
  useEffect(() => diff.current?.setInline(narrow), [narrow]);

  if (!compare) return null;
  const sides = compareSides(`${name} (open)`, compare.other.label, compare.swapped);
  return (
    <div className="ed-codediff">
      <div className="ed-codediff__bar" role="toolbar" aria-label="Code diff">
        <span className="ed-codediff__sides">
          <span className="ed-muted">Before</span> {sides.before}
          <span aria-hidden="true"> → </span>
          <span className="ed-muted">After</span> {sides.after}
        </span>
        <button
          type="button"
          className="ed-btn ed-btn--small"
          onClick={() => store.swapCompare()}
          title="Swap before and after"
        >
          Swap
        </button>
        <button
          type="button"
          className="ed-btn ed-btn--small ed-btn--primary"
          onClick={() => {
            store.setCompareCodeDiff(false);
            requestAnimationFrame(() => store.editor?.focus());
          }}
        >
          Edit code
        </button>
      </div>
      <div ref={host} className="ed-codediff__editor" />
    </div>
  );
}
