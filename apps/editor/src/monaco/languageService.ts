/**
 * @dbml/parse language services (completion, definition, references, quick fixes, info
 * diagnostics) on one long-lived Compiler over a MemoryProjectLayout kept in sync with the Monaco
 * models. Every provider call is wrapped: a parser exception must never break typing.
 */
import type { DiagramModel } from '@relvista/core';
import { Compiler, Filepath, MemoryProjectLayout } from '@dbml/parse';
import type * as Monaco from 'monaco-editor/editor/editor.api';
import { DBML_LANGUAGE_ID } from './dbmlLanguage.js';
import { registerHover } from './hover.js';

export interface DbmlLanguageService {
  /** Replace all files (open). Keys as EditorFile.key. */
  setFiles(files: Record<string, string>): void;
  /** Called synchronously from onDidChangeContent (cheap: setSource only, compile is lazy). */
  updateFile(key: string, text: string): void;
  removeFile(key: string): void;
  /** Info diagnostics (with quick fixes) for one file, as Monaco markers. Run at 600 ms idle. */
  infoMarkers(key: string): Monaco.editor.IMarkerData[];
  dispose(): void;
}

export const TRIGGER_CHARACTERS = ['.', ',', '[', ':', '~', '>', '<', '-', '"', '/'];

const pathOf = (key: string) => Filepath.from(`/${key.replace(/^\/+/, '')}`);

interface LocationLike {
  uri: unknown;
  range: Monaco.IRange;
}

export function createDbmlLanguageService(
  m: typeof Monaco,
  deps: {
    getModel(): DiagramModel | null;
    openFile(key: string, range?: Monaco.IRange): void;
  },
): DbmlLanguageService {
  const layout = new MemoryProjectLayout();
  const compiler = new Compiler(layout);
  const services = compiler.initMonacoServices({
    autocompletion: { triggerCharacters: TRIGGER_CHARACTERS },
  });
  const known = new Set<string>();
  const disposables: Monaco.IDisposable[] = [];

  const toMonacoUri = (u: unknown) => m.Uri.parse(String(u));
  const keyOf = (u: Monaco.Uri) => u.path.replace(/^\//, '');
  const mapLocations = (locs: unknown): Monaco.languages.Location[] => {
    if (!locs) return [];
    const list = (Array.isArray(locs) ? locs : [locs]) as LocationLike[];
    return list.map((l) => ({ uri: toMonacoUri(l.uri), range: l.range }));
  };

  const definition = async (model: Monaco.editor.ITextModel, position: Monaco.Position) => {
    try {
      const r = await services.definitionProvider.provideDefinition(
        model as never,
        position as never,
      );
      return mapLocations(r);
    } catch {
      return [];
    }
  };

  disposables.push(
    m.languages.registerCompletionItemProvider(DBML_LANGUAGE_ID, {
      triggerCharacters: TRIGGER_CHARACTERS,
      provideCompletionItems(model, position) {
        try {
          return (services.autocompletionProvider.provideCompletionItems(
            model as never,
            position as never,
          ) ?? {
            suggestions: [],
          }) as Monaco.languages.ProviderResult<Monaco.languages.CompletionList>;
        } catch {
          return { suggestions: [] };
        }
      },
    }),
    m.languages.registerDefinitionProvider(DBML_LANGUAGE_ID, {
      provideDefinition: (model, position) => definition(model, position),
    }),
    m.languages.registerReferenceProvider(DBML_LANGUAGE_ID, {
      async provideReferences(model, position) {
        try {
          const r = await services.referenceProvider.provideReferences(
            model as never,
            position as never,
          );
          return mapLocations(r);
        } catch {
          return [];
        }
      },
    }),
    m.languages.registerCodeActionProvider(DBML_LANGUAGE_ID, {
      provideCodeActions(model, range, context, token) {
        try {
          const r = services.codeActionProvider.provideCodeActions(
            model as never,
            range as never,
            context as never,
            token as never,
          ) as Monaco.languages.ProviderResult<Monaco.languages.CodeActionList>;
          return r ?? { actions: [], dispose() {} };
        } catch {
          return { actions: [], dispose() {} };
        }
      },
    }),
    registerHover(m, { getModel: deps.getModel, definition, keyOfUri: keyOf }),
    m.editor.registerEditorOpener({
      openCodeEditor(_source, resource, selectionOrPosition) {
        const key = keyOf(resource);
        if (!known.has(key)) return false;
        let range: Monaco.IRange | undefined;
        if (selectionOrPosition && 'startLineNumber' in selectionOrPosition) {
          range = selectionOrPosition;
        } else if (selectionOrPosition) {
          range = {
            startLineNumber: selectionOrPosition.lineNumber,
            startColumn: selectionOrPosition.column,
            endLineNumber: selectionOrPosition.lineNumber,
            endColumn: selectionOrPosition.column,
          };
        }
        deps.openFile(key, range);
        return true;
      },
    }),
  );

  return {
    setFiles(files) {
      layout.clearSource();
      known.clear();
      for (const [k, text] of Object.entries(files)) {
        layout.setSource(pathOf(k), text);
        known.add(k);
      }
    },
    updateFile(key, text) {
      layout.setSource(pathOf(key), text);
      known.add(key);
    },
    removeFile(key) {
      layout.deleteSource(pathOf(key));
      known.delete(key);
    },
    infoMarkers(key) {
      try {
        if (!known.has(key)) return [];
        return services.diagnosticsProvider
          .provideMarkers(pathOf(key))
          .filter(
            (mk) => mk.severity === m.MarkerSeverity.Info || mk.severity === m.MarkerSeverity.Hint,
          )
          .map((mk) => ({ ...mk, source: 'dbml' })) as Monaco.editor.IMarkerData[];
      } catch {
        return [];
      }
    },
    dispose() {
      for (const d of disposables.splice(0)) d.dispose();
    },
  };
}
