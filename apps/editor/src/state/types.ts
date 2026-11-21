import type { DiagramModel, Diagnostic, Layout } from '@relvista/core';

export type Eol = '\n' | '\r\n' | '\r';

/** How a file looked on disk. */
export interface TextEnvelope {
  bom: boolean; // UTF-8 BOM (EF BB BF) present
  eol: Eol; // dominant terminator; '\n' when the file has none
  mixed: boolean; // more than one terminator kind
}

export interface EditorFile {
  /** Project-relative path with '/' (single file: its name, e.g. 'schema.dbml'). Monaco URI file:///<key>. */
  key: string;
  envelope: TextEnvelope;
  /** As opened / last saved: exact bytes and their decoded text (BOM stripped, original EOLs). */
  disk: { bytes: Uint8Array; text: string } | null; // null: untitled, shared, example, SQL import
  handle: FileSystemFileHandle | null;
  /** Monaco alternative version id at open/save (dirty = differs). Runtime only. */
  savedVersionId: number;
}

export type DocumentOrigin = 'untitled' | 'file' | 'folder' | 'url' | 'share' | 'example' | 'sql';

export interface Workspace {
  id: string; // crypto.randomUUID(); canvas resetKey
  origin: DocumentOrigin;
  name: string; // display name (entry file name, or 'Untitled.dbml')
  entry: string; // key of the entry file
  files: EditorFile[]; // entry first, then sorted by key
  dir: FileSystemDirectoryHandle | null;
  layout: Layout | null;
  savedLayoutText: string | null; // sidecar text as on disk / last saved; null = none
  layoutHandle: FileSystemFileHandle | null;
  layoutInvalid: string | null; // parse error of an existing sidecar (never overwrite silently)
  view: string; // '*' or DiagramView name
  /**
   * The https URL the document was fetched from (`?url=`, Open from URL), after the GitHub blob →
   * raw rewrite; null otherwise. Compare… offers a Git ref of the same path (design phase3 §6.11).
   */
  remoteUrl?: string | null;
}

export interface CompileState {
  model: DiagramModel | null; // last good
  diagnostics: Diagnostic[]; // of the latest compile
  stale: boolean; // latest compile had errors (showing last good)
}

/** IndexedDB 'relvista-editor' / store 'sessions' / key 'current' (and 'previous'). */
export interface SessionV1 {
  v: 1;
  savedAt: number;
  workspace: Omit<Workspace, 'files' | 'layout'> & {
    files: Array<Omit<EditorFile, 'savedVersionId'> & { text: string; dirty: boolean }>;
    layoutText: string | null; // serializeLayout(layout)
    layoutDirty: boolean;
  };
  ui: {
    split: number;
    tab: 'code' | 'diagram';
    activeFile: string;
    viewport?: { x: number; y: number; zoom: number };
    /** Focus mode (design phase3 §6.8): session UI state, never in the layout. */
    focus?: { id: string; hops: number } | null;
  };
}

export type SaveState = 'saved' | 'unsaved' | 'autosaved' | 'downloaded';
