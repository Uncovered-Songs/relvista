/**
 * One Monaco model per workspace file (URI `file:///<key>`), plus per-file view state. Text flows
 * from Monaco to the app; models are only (re)created when a document is opened.
 */
import { monaco } from './setup.js';
import { DBML_LANGUAGE_ID } from './dbmlLanguage.js';
import type { Eol } from '../state/types.js';

export type TextModel = monaco.editor.ITextModel;

const models = new Map<string, TextModel>();
const viewStates = new Map<string, monaco.editor.ICodeEditorViewState | null>();
const listeners = new Set<(key: string, e: monaco.editor.IModelContentChangedEvent) => void>();
const subscriptions: monaco.IDisposable[] = [];

export function uriOf(key: string): monaco.Uri {
  return monaco.Uri.from({ scheme: 'file', path: `/${key}` });
}

/** `file:///common/users.dbml` → `common/users.dbml`. */
export function keyOfUri(uri: monaco.Uri | string): string {
  const u = typeof uri === 'string' ? monaco.Uri.parse(uri) : uri;
  return u.path.replace(/^\//, '');
}

/** Disposes the previous models and creates one per file. */
export function openModels(files: Array<{ key: string; text: string; eol: Eol }>): void {
  disposeModels();
  for (const f of files) {
    // A stale model for the URI can exist if an earlier open failed half-way.
    monaco.editor.getModel(uriOf(f.key))?.dispose();
    const model = monaco.editor.createModel(f.text, DBML_LANGUAGE_ID, uriOf(f.key));
    model.setEOL(
      f.eol === '\r\n' ? monaco.editor.EndOfLineSequence.CRLF : monaco.editor.EndOfLineSequence.LF,
    );
    model.updateOptions({ tabSize: 2, insertSpaces: true });
    models.set(f.key, model);
    subscriptions.push(
      model.onDidChangeContent((e) => {
        for (const l of listeners) l(f.key, e);
      }),
    );
  }
}

export function disposeModels(): void {
  for (const s of subscriptions.splice(0)) s.dispose();
  for (const m of models.values()) m.dispose();
  models.clear();
  viewStates.clear();
}

export function getModel(key: string): TextModel | null {
  return models.get(key) ?? null;
}

export function modelKeys(): string[] {
  return [...models.keys()];
}

/** Current text with '\n' terminators (what compile, share and save use). */
export function textOf(key: string): string {
  return models.get(key)?.getValue(monaco.editor.EndOfLinePreference.LF, false) ?? '';
}

/**
 * Text with the model's own line terminators: what the @dbml/parse language services see, so the
 * offsets they get from `model.getOffsetAt` match their source (CRLF files count 2 per break).
 */
export function modelTextOf(key: string): string {
  return models.get(key)?.getValue(monaco.editor.EndOfLinePreference.TextDefined, false) ?? '';
}

export function allModelTexts(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of models.keys()) out[k] = modelTextOf(k);
  return out;
}

export function allTexts(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of models.keys()) out[k] = textOf(k);
  return out;
}

export function versionOf(key: string): number {
  return models.get(key)?.getAlternativeVersionId() ?? -1;
}

export function onModelContentChange(
  fn: (key: string, e: monaco.editor.IModelContentChangedEvent) => void,
): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function saveViewState(key: string, state: monaco.editor.ICodeEditorViewState | null): void {
  viewStates.set(key, state);
}

export function viewStateOf(key: string): monaco.editor.ICodeEditorViewState | null {
  return viewStates.get(key) ?? null;
}
