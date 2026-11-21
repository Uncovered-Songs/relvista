/** React wrapper: one editor instance, one model per file, view state per file. */
import { useEffect, useRef, type ReactElement } from 'react';
import { onCursorMoved, showFile } from '../diagram/sync.js';
import { store, useEditor } from '../state/store.js';
import { useTheme } from '../theme.js';
import * as models from './models.js';
import { monaco } from './setup.js';
import { MONACO_THEME } from './themes.js';

const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, monospace";

export function MonacoEditor(): ReactElement {
  const host = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const wsId = useEditor((s) => s.ws.id);
  const activeFile = useEditor((s) => s.activeFile);
  const { mode } = useTheme();

  useEffect(() => {
    const ed = monaco.editor.create(host.current!, {
      model: null,
      theme: MONACO_THEME[mode],
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: MONO,
      fontSize: 13,
      lineHeight: 20,
      tabSize: 2,
      insertSpaces: true,
      detectIndentation: true,
      unusualLineTerminators: 'off',
      formatOnPaste: false,
      formatOnType: false,
      wordBasedSuggestions: 'off',
      // Enter after a fully typed name (`users.id⏎`) starts a new line; Tab still accepts.
      acceptSuggestionOnEnter: 'smart',
      suggest: { showIcons: false, showStatusBar: false },
      suggestFontSize: 12.5,
      suggestLineHeight: 22,
      stickyScroll: { enabled: true },
      bracketPairColorization: { enabled: true },
      scrollBeyondLastLine: false,
      fixedOverflowWidgets: true,
      padding: { top: 8 },
      renderWhitespace: 'selection',
      ariaLabel: 'DBML source',
      'semanticHighlighting.enabled': false,
    });
    editorRef.current = ed;
    store.editor = ed;

    // Save / Save as / Open / Auto-layout are caught by the App's capture-phase key handler.

    const subs = [
      ed.onDidChangeCursorPosition((e) => {
        store.setCursor(e.position.lineNumber, e.position.column);
        const m = ed.getModel();
        if (m) onCursorMoved(models.keyOfUri(m.uri), e.position);
      }),
    ];
    return () => {
      for (const s of subs) s.dispose();
      store.editor = null;
      ed.dispose();
    };
    // The editor is created once; theme changes go through setTheme below.
  }, []);

  useEffect(() => {
    monaco.editor.setTheme(MONACO_THEME[mode]);
  }, [mode]);

  // New document (models were recreated) or another file tab.
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const model = models.getModel(activeFile);
    if (!model) return;
    if (ed.getModel() !== model) {
      if (ed.getModel()?.isDisposed() === false) showFile(activeFile);
      else {
        ed.setModel(model);
        const vs = models.viewStateOf(activeFile);
        if (vs) ed.restoreViewState(vs);
      }
    }
    const pos = ed.getPosition();
    if (pos) store.setCursor(pos.lineNumber, pos.column);
    store.refreshInfoMarkers();
  }, [wsId, activeFile]);

  return <div className="ed-monaco" ref={host} id="ed-code-editor" />;
}
