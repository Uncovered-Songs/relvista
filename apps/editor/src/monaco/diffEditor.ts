/**
 * Read-only Monaco diff editor of compare mode (design phase3 §6.11): before ↔ after entry text,
 * from the bundled editor API (no extra chunk). The open document's side shows its live Monaco
 * model, so editing (after "Edit code") updates the diff; the other version gets a model of its
 * own under a `relvista-compare:` URI that no file, marker or language service knows.
 */
import { DBML_LANGUAGE_ID } from './dbmlLanguage.js';
import { monaco } from './setup.js';

export interface CompareDiffEditor {
  /** Sets the two sides: the other version's text, the open document's model, which one is before. */
  setSides(otherText: string, current: monaco.editor.ITextModel, otherIsBefore: boolean): void;
  setTheme(theme: string): void;
  /** Side by side (wide) or inline (phones). */
  setInline(inline: boolean): void;
  dispose(): void;
}

let counter = 0;

export function createDiffEditor(
  host: HTMLElement,
  options: { theme: string; inline?: boolean; ariaLabel?: string },
): CompareDiffEditor {
  const editor = monaco.editor.createDiffEditor(host, {
    theme: options.theme,
    readOnly: true,
    originalEditable: false,
    automaticLayout: true,
    renderSideBySide: !options.inline,
    useInlineViewWhenSpaceIsLimited: true,
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    fontFamily: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
    fontSize: 13,
    lineHeight: 20,
    renderOverviewRuler: false,
    ignoreTrimWhitespace: false,
    ariaLabel: options.ariaLabel ?? 'Differences between the two versions',
    originalAriaLabel: 'Before',
    modifiedAriaLabel: 'After',
  });
  let otherModel: monaco.editor.ITextModel | null = null;
  return {
    setSides(otherText, current, otherIsBefore) {
      if (!otherModel || otherModel.isDisposed()) {
        otherModel = monaco.editor.createModel(
          otherText,
          DBML_LANGUAGE_ID,
          monaco.Uri.from({ scheme: 'relvista-compare', path: `/other-${++counter}.dbml` }),
        );
      } else if (otherModel.getValue() !== otherText) otherModel.setValue(otherText);
      editor.setModel(
        otherIsBefore
          ? { original: otherModel, modified: current }
          : { original: current, modified: otherModel },
      );
    },
    setTheme(theme) {
      monaco.editor.setTheme(theme);
    },
    setInline(inline) {
      editor.updateOptions({ renderSideBySide: !inline });
    },
    dispose() {
      // The open document's model belongs to the workspace: only the diff editor and our model go.
      editor.setModel(null);
      editor.dispose();
      otherModel?.dispose();
      otherModel = null;
    },
  };
}
