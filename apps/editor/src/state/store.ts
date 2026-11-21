/**
 * The editor store: one plain object snapshot behind `useSyncExternalStore`, plus the actions that
 * change it (open, edit, layout, save, autosave). No state library.
 *
 * Text lives in the Monaco models (monaco/models.ts) and flows from Monaco to the store; the store
 * never writes text back except when a document is opened.
 */
import {
  DEFAULT_VIEW,
  compileDbml,
  pruneLayout,
  renameNode,
  serializeLayout,
  type DiagramModel,
  type Layout,
  type Viewport,
} from '@relvista/core';
import {
  effectivePositions,
  setNodePositions,
  type DiagramCanvasHandle,
  type LayoutChange,
} from '@relvista/renderer';
import { useSyncExternalStore } from 'react';
import {
  baseName,
  chooseEntry,
  walkDirectoryHandle,
  walkFileList,
  type WalkedFile,
} from '../files/folder.js';
import { downloadBytes, pickWithInput } from '../files/fallback.js';
import {
  ensureReadable,
  ensureWritable,
  fileInDirectory,
  hasDirectoryPicker,
  hasFsa,
  isAbort,
  pickDirectory,
  pickOpenFiles,
  pickSaveFile,
  writeHandle,
} from '../files/fsAccess.js';
import { changedOnDisk, readIfGranted, readNow, refreshFromDisk } from '../files/diskCheck.js';
import { LIMITS, LimitError, formatBytes } from '../files/limits.js';
import {
  RemoteError,
  fetchBytes,
  normalizeRemoteUrl,
  remoteFileName,
  remoteLayoutUrl,
  type RemoteLayout,
} from '../files/remote.js';
import {
  isDbmlName,
  isSidecarName,
  pairSidecars,
  parseSidecar,
  sidecarKey,
} from '../files/sidecar.js';
import {
  NEW_FILE_ENVELOPE,
  NotUtf8Error,
  decodeDbml,
  editorText,
  saveBytes,
} from '../files/text.js';
import { diagnosticsToMarkers, INFO_OWNER, MARKER_OWNER } from '../monaco/markers.js';
import { CompileScheduler, type CompileOutcome } from './compile.js';
import { LayoutHistory } from './history.js';
import { detectRenames } from './renames.js';
import { SessionStore, type RecentEntry } from './session.js';
import type {
  CompileState,
  DocumentOrigin,
  EditorFile,
  SaveState,
  SessionV1,
  TextEnvelope,
  Workspace,
} from './types.js';

import * as models from '../monaco/models.js';
import { monaco } from '../monaco/setup.js';
import type { DbmlLanguageService } from '../monaco/languageService.js';
// Small (the converter itself loads in a worker on first use), and the menus import it anyway.
import * as sql from '../sql/sql.js';
import type { ExportFormat, ImportFormat } from '../sql/sql.js';

// ---------------------------------------------------------------------------------------------
// State

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
  action?: { label: string; run(): void };
}

export type Dialog =
  | { kind: 'share' }
  | { kind: 'examples' }
  | { kind: 'sql-import' }
  | { kind: 'help' }
  | { kind: 'url'; initial?: string }
  | { kind: 'remote-error'; url: string; message: string }
  | { kind: 'entry'; paths: string[]; resolve(path: string | null): void }
  | {
      kind: 'confirm';
      title: string;
      message: string;
      confirmLabel: string;
      danger?: boolean;
      resolve(ok: boolean): void;
    };

export interface EditorState {
  ready: boolean;
  ws: Workspace;
  compile: CompileState;
  /** Per file key: text differs from disk (or, without disk, edited since load). */
  dirty: Record<string, boolean>;
  layoutDirty: boolean;
  userTouched: boolean;
  activeFile: string;
  split: number; // code pane share, 0..1
  tab: 'code' | 'diagram';
  saveState: SaveState;
  saving: boolean;
  highlightedNodeId: string | null;
  cursor: { line: number; column: number };
  canUndo: boolean;
  canRedo: boolean;
  toasts: Toast[];
  dialog: Dialog | null;
  autosavePaused: boolean;
  hasPrevious: boolean;
  recent: RecentEntry[];
  layoutStatus: 'pending' | 'done';
  /** Viewport to restore for this document (a restored session); null: the canvas's first view. */
  initialViewport: Viewport | null;
  sqlBusy: string | null;
  compileMs: number;
  /** Single-file document with no text: the code pane shows the empty state. */
  entryEmpty: boolean;
}

const DEFAULT_SPLIT = 0.4;
const UNTITLED_KEY = 'schema.dbml';

function untitledWorkspace(): Workspace {
  return {
    id: crypto.randomUUID(),
    origin: 'untitled',
    name: 'Untitled.dbml',
    entry: UNTITLED_KEY,
    files: [
      {
        key: UNTITLED_KEY,
        envelope: NEW_FILE_ENVELOPE,
        disk: null,
        handle: null,
        savedVersionId: 1,
      },
    ],
    dir: null,
    layout: null,
    savedLayoutText: null,
    layoutHandle: null,
    layoutInvalid: null,
    view: DEFAULT_VIEW,
  };
}

function initialState(): EditorState {
  return {
    ready: false,
    ws: untitledWorkspace(),
    compile: { model: null, diagnostics: [], stale: false },
    dirty: {},
    layoutDirty: false,
    userTouched: false,
    activeFile: UNTITLED_KEY,
    split: DEFAULT_SPLIT,
    tab: 'code',
    saveState: 'saved',
    saving: false,
    highlightedNodeId: null,
    cursor: { line: 1, column: 1 },
    canUndo: false,
    canRedo: false,
    toasts: [],
    dialog: null,
    autosavePaused: false,
    hasPrevious: false,
    recent: [],
    layoutStatus: 'done',
    initialViewport: null,
    sqlBusy: null,
    compileMs: 0,
    entryEmpty: true,
  };
}

// ---------------------------------------------------------------------------------------------
// Open specs

export interface OpenFileSpec {
  key: string;
  /** Bytes from disk / network (decoded here). */
  bytes?: Uint8Array;
  /** Text without disk bytes (examples, share links, SQL import). */
  text?: string;
  handle?: FileSystemFileHandle | null;
}

export interface OpenSpec {
  origin: DocumentOrigin;
  name: string;
  entry: string;
  files: OpenFileSpec[];
  dir?: FileSystemDirectoryHandle | null;
  layoutText?: string | null;
  layoutHandle?: FileSystemFileHandle | null;
  /** Already parsed layout (share links). */
  layout?: Layout | null;
  view?: string;
}

function hasNode(layout: Layout | null, id: string): boolean {
  if (!layout) return false;
  return Object.values(layout.views).some((v) => Object.hasOwn(v.nodes, id));
}

function modelIds(model: DiagramModel): string[] {
  return [
    ...model.tables.map((t) => t.id),
    ...model.stickyNotes.map((n) => n.id),
    ...model.groups.map((g) => g.id),
  ];
}

function sortFiles<T extends { key: string }>(files: T[], entry: string): T[] {
  return [...files].sort((a, b) =>
    a.key === entry ? -1 : b.key === entry ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  );
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Thrown to stop an open the user cancelled (guardOpen ignores it like a dismissed picker). */
function cancelled(): DOMException {
  return new DOMException('The user cancelled the open.', 'AbortError');
}

function utf8Length(text: string): number {
  // Cheap bound first: a UTF-16 code unit is at most 3 UTF-8 bytes.
  return text.length * 3 <= LIMITS.maxFileBytes
    ? text.length
    : new TextEncoder().encode(text).length;
}

/** Name of the Web Lock held by the one tab that autosaves (see startAutosaveLease). */
const AUTOSAVE_LOCK = 'relvista-editor:autosave';
/** Never settles: a lock callback returning it holds the lock until the page goes away. */
const HOLD = new Promise<void>(() => undefined);

// ---------------------------------------------------------------------------------------------

export class EditorStore {
  private state: EditorState = initialState();
  private readonly listeners = new Set<() => void>();
  private readonly history = new LayoutHistory();
  private readonly sessions = new SessionStore();
  private readonly compiler = new CompileScheduler((o) => this.onCompiled(o));
  private diskLf = new Map<string, string>();
  private toastId = 1;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private infoTimer: ReturnType<typeof setTimeout> | null = null;
  private channel: BroadcastChannel | null = null;
  private ls: DbmlLanguageService | null = null;
  private infoMarkersEnabled = false;
  /** An autosave was skipped while paused: the tab saves once it takes over. */
  private missedAutosave = false;
  /**
   * Set when this tab takes over autosave from another: before its first write, a stored session
   * of a different document is moved to 'previous' instead of being overwritten.
   */
  private checkStoredBeforeWrite = false;
  /** The layout the document opened with counts as clean (not a restored or shared arrangement). */
  private baseLayoutClean = true;

  editor: monaco.editor.IStandaloneCodeEditor | null = null;
  canvas: DiagramCanvasHandle | null = null;

  constructor() {
    models.onModelContentChange((key) => this.onTextChanged(key));
    try {
      // Off by default: @dbml/parse flags every nullable `ref: >` column, noisy on real files.
      this.infoMarkersEnabled = localStorage.getItem('relvista-editor:info-markers') === 'on';
    } catch {
      // default on
    }
  }

  // --- store plumbing ------------------------------------------------------------------------

  getState = (): EditorState => this.state;

  subscribe = (l: () => void): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<EditorState>, autosave = false): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
    if (autosave) this.scheduleAutosave();
  }

  private setWs(
    patch: Partial<Workspace>,
    extra: Partial<EditorState> = {},
    autosave = true,
  ): void {
    this.set({ ...extra, ws: { ...this.state.ws, ...patch } }, autosave);
  }

  attachLanguageService(ls: DbmlLanguageService): void {
    this.ls = ls;
    ls.setFiles(models.allModelTexts());
  }

  // --- toasts and dialogs --------------------------------------------------------------------

  toast(kind: Toast['kind'], message: string, action?: Toast['action']): void {
    const t: Toast = { id: this.toastId++, kind, message, ...(action ? { action } : {}) };
    this.set({ toasts: [...this.state.toasts, t].slice(-4) });
  }

  dismissToast(id: number): void {
    this.set({ toasts: this.state.toasts.filter((t) => t.id !== id) });
  }

  /** Every dialog change: a promise-backed dialog that is replaced settles as cancelled. */
  private replaceDialog(next: Dialog | null): void {
    const prev = this.state.dialog;
    this.set({ dialog: next });
    if (!prev || prev === next) return;
    if (prev.kind === 'confirm') prev.resolve(false);
    if (prev.kind === 'entry') prev.resolve(null);
  }

  openDialog(dialog: Dialog): void {
    this.replaceDialog(dialog);
  }

  closeDialog(): void {
    this.replaceDialog(null);
  }

  confirm(title: string, message: string, confirmLabel: string, danger = false): Promise<boolean> {
    return new Promise((resolve) => {
      const dialog: Dialog = {
        kind: 'confirm',
        title,
        message,
        confirmLabel,
        danger,
        resolve: (ok) => {
          if (this.state.dialog === dialog) this.set({ dialog: null });
          resolve(ok);
        },
      };
      this.replaceDialog(dialog);
    });
  }

  private pickEntry(paths: string[]): Promise<string | null> {
    return new Promise((resolve) => {
      const dialog: Dialog = {
        kind: 'entry',
        paths,
        resolve: (p) => {
          if (this.state.dialog === dialog) this.set({ dialog: null });
          resolve(p);
        },
      };
      this.replaceDialog(dialog);
    });
  }

  // --- derived -------------------------------------------------------------------------------

  isDirty(s: EditorState = this.state): boolean {
    return s.layoutDirty || Object.values(s.dirty).some(Boolean);
  }

  /** Dirty relative to disk for the unload guard (untitled with content counts). */
  hasUnsavedWork(): boolean {
    const s = this.state;
    if (this.isDirty(s)) return true;
    if (s.ws.origin !== 'untitled' && s.ws.origin !== 'sql') return false;
    return s.ws.files.some(
      (f) => f.disk === null && f.handle === null && models.textOf(f.key).trim() !== '',
    );
  }

  entryText(): string {
    return models.textOf(this.state.ws.entry);
  }

  // --- opening -------------------------------------------------------------------------------

  /** Every open path ends here. Throws NotUtf8Error / LimitError before changing anything. */
  async openWorkspace(
    spec: OpenSpec,
    options: { rotate?: boolean; restore?: SessionV1 } = {},
  ): Promise<void> {
    const files: EditorFile[] = [];
    const texts: Array<{ key: string; text: string; eol: TextEnvelope['eol'] }> = [];
    for (const f of sortFiles(spec.files, spec.entry)) {
      if (f.bytes) {
        if (f.bytes.length > LIMITS.maxFileBytes) {
          throw new LimitError(`${f.key} is larger than ${formatBytes(LIMITS.maxFileBytes)}.`);
        }
        const { text, envelope } = decodeDbml(f.bytes);
        files.push({
          key: f.key,
          envelope,
          disk: { bytes: f.bytes, text },
          handle: f.handle ?? null,
          savedVersionId: 1,
        });
        texts.push({ key: f.key, text, eol: envelope.eol });
      } else {
        const text = f.text ?? '';
        if (utf8Length(text) > LIMITS.maxFileBytes) {
          throw new LimitError(`${f.key} is larger than ${formatBytes(LIMITS.maxFileBytes)}.`);
        }
        files.push({
          key: f.key,
          envelope: NEW_FILE_ENVELOPE,
          disk: null,
          handle: f.handle ?? null,
          savedVersionId: 1,
        });
        texts.push({ key: f.key, text, eol: '\n' });
      }
    }
    if (!files.some((f) => f.key === spec.entry))
      throw new Error(`Entry file ${spec.entry} is missing.`);

    let layout: Layout | null = spec.layout ?? null;
    let layoutInvalid: string | null = null;
    const savedLayoutText = spec.layoutText ?? null;
    if (spec.layoutText != null && spec.layout === undefined) {
      const r = parseSidecar(spec.layoutText);
      if (r.ok) layout = r.layout;
      else {
        layoutInvalid = r.error;
        this.toast(
          'warning',
          `The layout file is invalid (${r.error}); the diagram was laid out automatically.`,
        );
      }
    }

    if (options.rotate && !options.restore) {
      if (this.state.saving) {
        this.toast('info', 'Wait until saving has finished.');
        throw cancelled();
      }
      if (!(await this.confirmReplace(spec.origin === 'untitled' ? null : spec.name)))
        throw cancelled();
      await this.rotateSession();
    }

    // Restored sessions: the saved texts replace the decoded ones.
    const restore = options.restore;
    const restoredText = new Map(restore?.workspace.files.map((f) => [f.key, f]) ?? []);
    if (restore) {
      for (const t of texts) {
        const r = restoredText.get(t.key);
        if (r) t.text = r.text;
      }
    }

    models.openModels(texts);
    this.diskLf = new Map(
      files.filter((f) => f.disk).map((f) => [f.key, editorText(f.disk!.text)]),
    );
    for (const f of files) {
      const dirtyRestored = restoredText.get(f.key)?.dirty === true && !f.disk;
      f.savedVersionId = dirtyRestored ? -1 : models.versionOf(f.key);
    }
    this.ls?.setFiles(models.allModelTexts());

    const ws: Workspace = {
      id: crypto.randomUUID(),
      origin: spec.origin,
      name: spec.name,
      entry: spec.entry,
      files,
      dir: spec.dir ?? null,
      layout,
      savedLayoutText,
      layoutHandle: spec.layoutHandle ?? null,
      layoutInvalid,
      view: spec.view ?? DEFAULT_VIEW,
    };
    if (restore) {
      ws.id = restore.workspace.id || ws.id;
      ws.view = restore.workspace.view;
    }
    this.history.clear(layout);
    // A layout that arrived in a share link is someone's arrangement: saving keeps it.
    const userTouched = restore
      ? restore.workspace.layoutDirty
      : spec.origin === 'share' && !!layout;
    this.baseLayoutClean = !userTouched;
    const activeFile =
      restore && files.some((f) => f.key === restore.ui.activeFile)
        ? restore.ui.activeFile
        : spec.entry;
    this.state = {
      ...this.state,
      ws,
      compile: { model: null, diagnostics: [], stale: false },
      dirty: {},
      userTouched,
      layoutDirty: false,
      activeFile,
      highlightedNodeId: null,
      canUndo: false,
      canRedo: false,
      saveState: 'saved',
      layoutStatus: 'pending',
      initialViewport: restore?.ui.viewport ?? null,
      entryEmpty: files.length === 1 && models.textOf(spec.entry) === '',
      ...(restore ? { split: restore.ui.split, tab: restore.ui.tab } : {}),
    };
    this.recomputeDirty();
    this.state = { ...this.state, layoutDirty: this.computeLayoutDirty() };
    this.set({});
    this.compiler.schedule(() => ({ files: models.allTexts(), entry: this.state.ws.entry }), 0);
    this.updateTitle();
    this.scheduleAutosave();
  }

  /**
   * Before a document replaces one with unsaved work: asks. The replaced document stays available
   * as the previous session (Open → Restore previous session) unless autosave is paused here.
   */
  private async confirmReplace(nextName: string | null): Promise<boolean> {
    if (!this.state.ready || !this.hasUnsavedWork()) return true;
    const name = baseName(this.state.ws.name);
    const next = nextName === null ? 'a new document' : baseName(nextName);
    const recover = this.state.autosavePaused
      ? 'Its unsaved changes will be lost (autosave is paused in this tab).'
      : 'You can get it back with Open → Restore previous session.';
    return this.confirm(
      'Replace the open document?',
      `${name} has unsaved changes. Opening ${next} replaces it. ${recover}`,
      'Open anyway',
      true,
    );
  }

  /**
   * Keeps the open document as 'previous' before another replaces it: the pending autosave is
   * flushed first, and an empty or unedited untitled/example/share document never overwrites a
   * previous session worth keeping. A paused tab (another tab autosaves) writes nothing.
   */
  private async rotateSession(): Promise<void> {
    if (this.state.autosavePaused) return;
    if (!this.state.ready) {
      // Startup (share link, ?url=): the open document is the stored session, if any.
      await this.rotateStoredSession();
      return;
    }
    const ws = this.state.ws;
    const keep =
      this.hasUnsavedWork() ||
      ws.origin === 'file' ||
      ws.origin === 'folder' ||
      ws.origin === 'url';
    if (!keep) return;
    try {
      await this.autosaveNow();
      await this.sessions.rotate();
      if (!this.state.hasPrevious) this.set({ hasPrevious: true });
    } catch {
      // Storage blocked: nothing to restore later, the open goes ahead.
    }
  }

  /**
   * Moves the stored 'current' session to 'previous' when it holds work worth keeping. With
   * `unlessOwn`, a stored copy of this tab's own document (same entry and texts) stays.
   */
  private async rotateStoredSession(unlessOwn = false): Promise<boolean> {
    try {
      const stored = await this.sessions.load('current');
      if (!stored || !sessionWorthKeeping(stored)) return false;
      if (unlessOwn && this.isOwnSession(stored)) return false;
      await this.sessions.rotate();
      this.set({ hasPrevious: true });
      this.toast('info', 'Your previous document is in Open → Restore previous session.');
      return true;
    } catch {
      return false; // storage blocked
    }
  }

  private isOwnSession(stored: SessionV1): boolean {
    const w = stored.workspace;
    if (w.id !== this.state.ws.id && w.entry !== this.state.ws.entry) return false;
    const keys = models.modelKeys();
    return (
      w.files.length === keys.length &&
      w.files.every((f) => keys.includes(f.key) && models.textOf(f.key) === f.text)
    );
  }

  /** Wraps an open for UI entry points: errors become toasts. */
  private async guardOpen(fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (e) {
      if (isAbort(e)) return;
      if (e instanceof NotUtf8Error) this.toast('error', 'relvista only opens UTF-8 files.');
      else if (e instanceof LimitError) this.toast('error', e.message);
      else this.toast('error', `Could not open: ${errorMessage(e)}`);
    }
  }

  newEmpty(): Promise<void> {
    return this.guardOpen(() =>
      this.openWorkspace(
        {
          origin: 'untitled',
          name: 'Untitled.dbml',
          entry: UNTITLED_KEY,
          files: [{ key: UNTITLED_KEY, text: '' }],
        },
        { rotate: true },
      ),
    );
  }

  async openExample(id: string): Promise<void> {
    const { loadExample } = await import('../examples.js');
    await this.guardOpen(async () => {
      const ex = await loadExample(id);
      await this.openWorkspace(
        {
          origin: 'example',
          name: ex.info.folder ? `${ex.info.id}/${ex.entry}` : ex.entry,
          entry: ex.entry,
          files: Object.entries(ex.files).map(([key, text]) => ({ key, text })),
        },
        { rotate: true },
      );
    });
  }

  openText(
    text: string,
    name: string,
    origin: DocumentOrigin,
    extra: Partial<OpenSpec> = {},
  ): Promise<void> {
    const key = name.endsWith('.dbml') ? baseName(name) : `${baseName(name)}.dbml`;
    return this.guardOpen(() =>
      this.openWorkspace(
        { origin, name: key, entry: key, files: [{ key, text }], ...extra },
        { rotate: true },
      ),
    );
  }

  /** Open file… (Mod+O). */
  async openFilePicker(): Promise<void> {
    if (hasFsa()) {
      await this.guardOpen(async () => {
        const handles = await pickOpenFiles();
        if (handles) await this.openFileHandles(handles);
      });
      return;
    }
    const files = await pickWithInput({ multiple: true, accept: '.dbml,.json' });
    if (files.length) {
      await this.guardOpen(() =>
        this.openWalked(
          files.map((f) => ({
            path: f.name,
            size: f.size,
            read: async () => new Uint8Array(await f.arrayBuffer()),
            handle: null,
          })),
          'file',
        ),
      );
    }
  }

  async openFolderPicker(): Promise<void> {
    if (hasDirectoryPicker()) {
      await this.guardOpen(async () => {
        const dir = await pickDirectory();
        if (dir) await this.openDirectory(dir);
      });
      return;
    }
    const files = await pickWithInput({ directory: true });
    if (files.length) await this.guardOpen(() => this.openWalked(walkFileList(files), 'folder'));
  }

  async openFileHandles(handles: FileSystemFileHandle[]): Promise<void> {
    const walked: WalkedFile[] = [];
    for (const h of handles) {
      const file = await h.getFile();
      walked.push({
        path: h.name,
        size: file.size,
        read: async () => new Uint8Array(await file.arrayBuffer()),
        handle: h,
      });
    }
    await this.openWalked(walked, 'file');
    const entry = handles.find((h) => h.name === this.state.ws.entry);
    if (entry) void this.rememberRecent(entry);
  }

  async openDirectory(dir: FileSystemDirectoryHandle): Promise<void> {
    const walked = await walkDirectoryHandle(
      dir as unknown as Parameters<typeof walkDirectoryHandle>[0],
    );
    await this.openWalked(walked, 'folder', dir);
    void this.rememberRecent(dir);
  }

  /** Files from a picker, a folder walk or a drop. */
  async openWalked(
    walked: WalkedFile[],
    origin: 'file' | 'folder',
    dir: FileSystemDirectoryHandle | null = null,
  ): Promise<void> {
    const paths = walked.map((w) => w.path);
    const { dbml, sidecarOf } = pairSidecars(paths);
    if (dbml.length === 0) {
      this.toast(
        'warning',
        walked.some((w) => isSidecarName(w.path))
          ? 'Pick the .dbml file together with its layout file.'
          : 'No .dbml files found.',
      );
      return;
    }
    let entry = chooseEntry(dbml);
    if (entry === null) {
      entry = await this.pickEntry(dbml);
      if (entry === null) return;
    }
    const byPath = new Map(walked.map((w) => [w.path, w]));
    const files: OpenFileSpec[] = [];
    for (const p of dbml) {
      const w = byPath.get(p)!;
      if (w.size > LIMITS.maxFileBytes)
        throw new LimitError(`${p} is larger than ${formatBytes(LIMITS.maxFileBytes)}.`);
      files.push({ key: p, bytes: await w.read(), handle: w.handle });
    }
    const sidecarPath = sidecarOf.get(entry);
    const sidecar = sidecarPath ? byPath.get(sidecarPath) : undefined;
    let layoutText: string | null = null;
    if (sidecar) {
      try {
        layoutText = new TextDecoder('utf-8', { fatal: true }).decode(await sidecar.read());
      } catch {
        layoutText = '\u0000';
      }
    }
    const multi = files.length > 1;
    await this.openWorkspace(
      {
        origin: multi && origin === 'file' ? 'file' : origin,
        name: origin === 'folder' && dir ? `${dir.name}/${entry}` : baseName(entry),
        entry,
        files,
        dir,
        layoutText,
        layoutHandle: sidecar?.handle ?? null,
      },
      { rotate: true },
    );
  }

  async openRecent(entry: RecentEntry): Promise<void> {
    await this.guardOpen(async () => {
      if (!(await ensureReadable(entry.handle))) {
        this.toast('warning', `Permission to read ${entry.name} was not given.`);
        return;
      }
      if (entry.kind === 'directory')
        await this.openDirectory(entry.handle as FileSystemDirectoryHandle);
      else await this.openFileHandles([entry.handle as FileSystemFileHandle]);
    });
  }

  private async rememberRecent(handle: FileSystemHandle): Promise<void> {
    try {
      await this.sessions.addRecent(
        {
          name: handle.name,
          kind: handle.kind,
          handle,
          openedAt: Date.now(),
        },
        LIMITS.maxRecent,
      );
      this.set({ recent: await this.sessions.recent() });
    } catch {
      // recent list is a convenience
    }
  }

  /**
   * `?url=` and "Open from URL…". The layout file is fetched only when `layout` asks for it
   * (`&layout`, the dialog's checkbox): see RemoteLayout.
   */
  async openUrl(input: string, layout: RemoteLayout = { kind: 'none' }): Promise<boolean> {
    let url: string;
    let layoutUrl: string | null;
    try {
      url = normalizeRemoteUrl(input);
      layoutUrl = remoteLayoutUrl(url, layout);
    } catch (e) {
      this.openDialog({ kind: 'remote-error', url: input, message: errorMessage(e) });
      return false;
    }
    try {
      const bytes = (await fetchBytes(url))!;
      const layoutBytes = layoutUrl
        ? await fetchBytes(layoutUrl, { optional: true }).catch(() => null)
        : null;
      let layoutText: string | null = null;
      if (layoutBytes) {
        try {
          layoutText = new TextDecoder('utf-8', { fatal: true }).decode(layoutBytes);
        } catch {
          layoutText = null;
        }
      }
      // Asked for by URL and missing: say so. "Next to it" is a guess; silence when it is not there.
      if (layout.kind === 'url' && layoutText === null) {
        this.toast('warning', `The layout file could not be loaded (${layoutUrl}).`);
      }
      const name = remoteFileName(url);
      const key = isDbmlName(name) ? name : `${name}.dbml`;
      await this.openWorkspace(
        { origin: 'url', name: key, entry: key, files: [{ key, bytes }], layoutText },
        { rotate: true },
      );
      return true;
    } catch (e) {
      if (isAbort(e)) return false;
      const message =
        e instanceof RemoteError
          ? e.message
          : e instanceof NotUtf8Error
            ? 'relvista only opens UTF-8 files.'
            : errorMessage(e);
      this.openDialog({ kind: 'remote-error', url, message });
      return false;
    }
  }

  async restorePrevious(): Promise<void> {
    const prev = await this.sessions.load('previous');
    if (!prev) {
      this.toast('info', 'There is no previous session.');
      return;
    }
    // Swaps: the open document becomes 'previous' (a paused tab writes nothing).
    if (!this.state.autosavePaused) {
      await this.autosaveNow();
      await this.sessions.rotate().catch(() => undefined);
    }
    await this.restoreSession(prev);
  }

  async restoreSession(s: SessionV1): Promise<void> {
    const w = s.workspace;
    // Files edited outside relvista since the session was saved (an IDE, git pull): unchanged
    // files open as they are on disk now; edited ones keep the edits and Save asks first.
    const { reloaded, conflicts } = await refreshFromDisk(w.files);
    let savedLayoutText = w.savedLayoutText;
    let layoutReloaded = false;
    let layoutConflict = false;
    if (w.layoutHandle && w.savedLayoutText !== null) {
      const now = await readIfGranted(w.layoutHandle);
      const text = now ? new TextDecoder().decode(now) : null;
      if (text !== null && text !== w.savedLayoutText) {
        if (w.layoutDirty) layoutConflict = true;
        else {
          savedLayoutText = text;
          layoutReloaded = true;
        }
      }
    }
    // The working layout differs from the saved sidecar text when it was edited (or auto-placed).
    let layout: Layout | null | undefined;
    if (!layoutReloaded && w.layoutText !== null && w.layoutText !== w.savedLayoutText) {
      const parsed = parseSidecar(w.layoutText);
      layout = parsed.ok ? parsed.layout : null;
    }
    const restore: SessionV1 = reloaded.size
      ? { ...s, workspace: { ...w, files: w.files.filter((f) => !reloaded.has(f.key)) } }
      : s;
    await this.openWorkspace(
      {
        origin: w.origin,
        name: w.name,
        entry: w.entry,
        files: w.files.map((f) =>
          f.disk
            ? { key: f.key, bytes: reloaded.get(f.key) ?? f.disk.bytes, handle: f.handle }
            : { key: f.key, text: f.text, handle: f.handle },
        ),
        dir: w.dir,
        layoutText: savedLayoutText,
        layoutHandle: w.layoutHandle,
        ...(layout !== undefined ? { layout } : {}),
        view: w.view,
      },
      { restore },
    );
    if (w.layoutInvalid && !layoutReloaded) this.setWs({ layoutInvalid: w.layoutInvalid });
    const changed = [...reloaded.keys()].sort();
    if (layoutReloaded) changed.push(sidecarKey(w.entry));
    if (changed.length)
      this.toast('info', `Reloaded from disk (changed outside relvista): ${changed.join(', ')}.`);
    const kept = layoutConflict ? [...conflicts, sidecarKey(w.entry)] : conflicts;
    if (kept.length)
      this.toast(
        'warning',
        `Changed on disk since your unsaved edits: ${kept.join(', ')}. Your edits are kept; Save asks before replacing the file.`,
      );
  }

  // --- startup -------------------------------------------------------------------------------

  /** Opens the share link in `location.hash`, if any, and removes it from the URL. */
  private async openShareHash(): Promise<boolean> {
    const { readShareHash, sharedName } = await import('../share/shareLink.js');
    const hash = await readShareHash(location.hash);
    if (hash.kind !== 'none')
      window.history.replaceState(null, '', location.pathname + location.search);
    if (hash.kind === 'damaged') this.toast('error', 'This link is damaged.');
    if (hash.kind === 'too-large')
      this.toast(
        'error',
        `This link holds more than ${formatBytes(hash.maxBytes)} of text; relvista does not open it.`,
      );
    if (hash.kind !== 'share') return false;
    const name = sharedName(compileDbml(hash.dbml).model?.project?.name);
    let opened = false;
    await this.guardOpen(async () => {
      await this.openWorkspace(
        {
          origin: 'share',
          name,
          entry: name,
          files: [{ key: name, text: hash.dbml }],
          layout: hash.layout,
          view: hash.view,
        },
        { rotate: true },
      );
      opened = true;
    });
    if (opened && hash.layoutError)
      this.toast('warning', `The layout in this link was ignored (${hash.layoutError}).`);
    return opened;
  }

  async init(): Promise<void> {
    await this.startAutosaveLease();
    const { readLayoutParam, readUrlParam } = await import('../files/remote.js');
    let opened = await this.openShareHash();
    // A share link opened in a tab that already runs the editor changes only the hash.
    window.addEventListener('hashchange', () => {
      void this.openShareHash();
    });

    const remote = readUrlParam(location.search);
    if (!opened && remote) {
      opened = await this.openUrl(remote, readLayoutParam(location.search));
      const params = new URLSearchParams(location.search);
      params.delete('url');
      params.delete('layout');
      const q = params.toString();
      window.history.replaceState(null, '', location.pathname + (q ? `?${q}` : '') + location.hash);
    }
    if (!opened) {
      const s = await this.sessions.load('current');
      if (s) {
        try {
          await this.restoreSession(s);
          opened = true;
        } catch {
          opened = false;
        }
      }
    }
    if (!opened) {
      await this.openWorkspace({
        origin: 'untitled',
        name: 'Untitled.dbml',
        entry: UNTITLED_KEY,
        files: [{ key: UNTITLED_KEY, text: '' }],
      });
    }
    const [hasPrevious, recent] = await Promise.all([
      this.sessions.hasPrevious().catch(() => false),
      this.sessions.recent().catch(() => [] as RecentEntry[]),
    ]);
    this.set({ ready: true, hasPrevious, recent });
  }

  /**
   * Exactly one tab autosaves the shared session: the one holding a Web Lock. The others are
   * paused and queue for the lock, so when the autosaving tab closes or reloads the next one
   * takes over. Resolves once this tab knows whether it autosaves.
   */
  private startAutosaveLease(): Promise<void> {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    if (!locks?.request) {
      this.startChannelFallback();
      return Promise.resolve();
    }
    return new Promise<void>((decided) => {
      locks
        .request(AUTOSAVE_LOCK, { ifAvailable: true }, (lock) => {
          if (lock) {
            decided();
            return HOLD;
          }
          this.set({ autosavePaused: true });
          decided();
          void locks.request(AUTOSAVE_LOCK, () => {
            this.takeOverAutosave();
            return HOLD;
          });
          return undefined;
        })
        .catch(() => decided());
    });
  }

  private takeOverAutosave(): void {
    this.checkStoredBeforeWrite = true;
    this.set({ autosavePaused: false });
    if (this.missedAutosave) this.scheduleAutosave();
  }

  /** Browsers without Web Locks: the autosaving tab answers 'hello' and says 'bye' on pagehide. */
  private startChannelFallback(): void {
    if (typeof BroadcastChannel === 'undefined') return;
    const me = crypto.randomUUID();
    this.channel = new BroadcastChannel('relvista-editor');
    this.channel.onmessage = (ev: MessageEvent<{ type: string; from: string }>) => {
      if (ev.data?.from === me) return;
      const owner = !this.state.autosavePaused;
      if (ev.data?.type === 'hello' && owner) this.channel?.postMessage({ type: 'here', from: me });
      if (ev.data?.type === 'here' && owner) this.set({ autosavePaused: true });
      if (ev.data?.type === 'bye' && !owner) this.takeOverAutosave();
    };
    this.channel.postMessage({ type: 'hello', from: me });
    window.addEventListener('pagehide', () => {
      if (!this.state.autosavePaused) this.channel?.postMessage({ type: 'bye', from: me });
    });
  }

  // --- text and compile ----------------------------------------------------------------------

  private onTextChanged(key: string): void {
    this.ls?.updateFile(key, models.modelTextOf(key));
    this.compiler.schedule(() => ({ files: models.allTexts(), entry: this.state.ws.entry }));
    if (key === this.state.ws.entry && this.state.ws.files.length === 1) {
      const empty = models.getModel(key)?.getValueLength() === 0;
      if (empty !== this.state.entryEmpty) this.set({ entryEmpty: empty });
    }
    const was = this.state.dirty[key] === true;
    const now = this.fileDirty(key);
    if (was !== now) this.set({ dirty: { ...this.state.dirty, [key]: now }, saveState: 'unsaved' });
    else if (this.state.saveState !== 'unsaved') this.set({ saveState: 'unsaved' });
    this.scheduleAutosave();
    this.scheduleInfoMarkers();
    this.updateTitle();
  }

  private fileDirty(key: string): boolean {
    const f = this.state.ws.files.find((x) => x.key === key);
    if (!f) return false;
    const disk = this.diskLf.get(key);
    if (disk !== undefined) return models.textOf(key) !== disk;
    return models.versionOf(key) !== f.savedVersionId;
  }

  private recomputeDirty(): void {
    const dirty: Record<string, boolean> = {};
    for (const f of this.state.ws.files) dirty[f.key] = this.fileDirty(f.key);
    this.state = { ...this.state, dirty };
  }

  private onCompiled({ result, ms }: CompileOutcome): void {
    const { model, diagnostics } = result;
    this.applyMarkers(diagnostics);
    if (!model) {
      this.set({
        compile: { model: this.state.compile.model, diagnostics, stale: true },
        compileMs: ms,
      });
      return;
    }
    const prev = this.state.compile.model;
    let layout = this.state.ws.layout;
    for (const [oldId, newId] of detectRenames(prev, model)) {
      if (!hasNode(layout, oldId) || hasNode(layout, newId)) continue;
      layout = renameNode(layout!, oldId, newId);
      this.history.amend(layout, (l) =>
        l && hasNode(l, oldId) && !hasNode(l, newId) ? renameNode(l, oldId, newId) : l,
      );
    }
    const renamed = layout !== this.state.ws.layout;
    // The layout file on disk names the old id: Save must rewrite it (design §4.2).
    const touch = renamed && this.state.ws.savedLayoutText !== null;
    this.state = {
      ...this.state,
      compile: { model, diagnostics, stale: false },
      compileMs: ms,
      ...(renamed ? { ws: { ...this.state.ws, layout } } : {}),
      ...(touch ? { userTouched: true } : {}),
    };
    this.set(renamed ? { layoutDirty: this.computeLayoutDirty() } : {}, renamed);
    if (touch) this.updateTitle();
  }

  private applyMarkers(diagnostics: CompileState['diagnostics']): void {
    for (const key of models.modelKeys()) {
      const model = models.getModel(key);
      if (!model) continue;
      const lineCount = model.getLineCount();
      const markers = diagnosticsToMarkers(diagnostics, key, (n) =>
        n >= 1 && n <= lineCount ? model.getLineContent(n) : undefined,
      );
      monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
    }
  }

  private scheduleInfoMarkers(): void {
    if (this.infoTimer !== null) clearTimeout(this.infoTimer);
    this.infoTimer = setTimeout(() => this.refreshInfoMarkers(), 600);
  }

  refreshInfoMarkers(): void {
    const key = this.state.activeFile;
    const model = models.getModel(key);
    if (!model || !this.ls) return;
    monaco.editor.setModelMarkers(
      model,
      INFO_OWNER,
      this.infoMarkersEnabled ? this.ls.infoMarkers(key) : [],
    );
  }

  get lintHints(): boolean {
    return this.infoMarkersEnabled;
  }

  setLintHints(on: boolean): void {
    this.infoMarkersEnabled = on;
    try {
      localStorage.setItem('relvista-editor:info-markers', on ? 'on' : 'off');
    } catch {
      // ignore
    }
    this.refreshInfoMarkers();
    this.set({});
  }

  // --- layout --------------------------------------------------------------------------------

  private computeLayoutDirty(s: EditorState = this.state): boolean {
    if (!s.userTouched) return false;
    const text = s.ws.layout ? serializeLayout(s.ws.layout) : null;
    if (text === s.ws.savedLayoutText) return false;
    // No layout file yet: back at the layout the document opened with (undo) is clean too.
    if (s.ws.savedLayoutText === null && this.baseLayoutClean) {
      const base = this.history.base;
      if (base !== undefined && (base ? serializeLayout(base) : null) === text) return false;
    }
    return true;
  }

  onLayoutChange = (next: Layout, change: LayoutChange): void => {
    if (change.kind === 'place') {
      const placed = effectivePositions(next, change.view);
      this.history.amend(next, (l) => {
        const have = effectivePositions(l, change.view);
        const add: Record<string, { x: number; y: number }> = {};
        for (const id of change.ids) if (!have[id] && placed[id]) add[id] = placed[id];
        return Object.keys(add).length ? setNodePositions(l, change.view, add) : l;
      });
      this.setWs({ layout: next });
      this.set({ layoutDirty: this.computeLayoutDirty() });
      return;
    }
    this.history.push(next);
    this.state = { ...this.state, ws: { ...this.state.ws, layout: next }, userTouched: true };
    this.set(
      {
        layoutDirty: this.computeLayoutDirty(),
        canUndo: this.history.canUndo(),
        canRedo: this.history.canRedo(),
        saveState: 'unsaved',
      },
      true,
    );
    this.updateTitle();
  };

  undoLayout(): void {
    const l = this.history.undo();
    if (l === undefined) return;
    this.afterHistoryMove(l);
  }

  redoLayout(): void {
    const l = this.history.redo();
    if (l === undefined) return;
    this.afterHistoryMove(l);
  }

  private afterHistoryMove(layout: Layout | null): void {
    this.state = { ...this.state, ws: { ...this.state.ws, layout }, userTouched: true };
    this.set(
      {
        layoutDirty: this.computeLayoutDirty(),
        canUndo: this.history.canUndo(),
        canRedo: this.history.canRedo(),
      },
      true,
    );
    this.updateTitle();
  }

  async autoLayout(scope: 'unpinned' | 'unplaced' = 'unpinned'): Promise<void> {
    if (!this.canvas || !this.state.compile.model) return;
    try {
      await this.canvas.runAutoLayout(scope);
    } catch (e) {
      this.toast('error', `Auto-layout failed: ${errorMessage(e)}`);
    }
  }

  setView(view: string): void {
    this.setWs({ view }, { highlightedNodeId: null });
  }

  /** Pan / zoom ended: the session keeps the viewport (restored on reload). */
  onViewportChange = (): void => {
    if (this.state.ready) this.scheduleAutosave();
  };

  setLayoutStatus = (status: 'pending' | 'done'): void => {
    if (status !== this.state.layoutStatus) this.set({ layoutStatus: status });
  };

  setHighlight(id: string | null): void {
    if (id !== this.state.highlightedNodeId) this.set({ highlightedNodeId: id });
  }

  // --- UI state ------------------------------------------------------------------------------

  setSplit(split: number): void {
    this.set({ split: Math.min(0.85, Math.max(0.15, split)) }, true);
  }

  setTab(tab: 'code' | 'diagram'): void {
    this.set({ tab }, true);
  }

  setActiveFile(key: string): void {
    if (key !== this.state.activeFile && this.state.ws.files.some((f) => f.key === key)) {
      this.set({ activeFile: key }, true);
      this.scheduleInfoMarkers();
    }
  }

  setCursor(line: number, column: number): void {
    const c = this.state.cursor;
    if (c.line !== line || c.column !== column) this.set({ cursor: { line, column } });
  }

  // --- saving --------------------------------------------------------------------------------

  private suggestedName(): string {
    const s = this.state;
    if (s.ws.origin === 'untitled') {
      const project = s.compile.model?.project?.name?.trim();
      return `${project ? project.replace(/[\\/:*?"<>|]+/g, '-') : 'schema'}.dbml`;
    }
    return baseName(s.ws.name);
  }

  /** The layout to write: pruned to the model's ids when the latest compile had no errors. */
  private layoutToWrite(): Layout | null {
    const { layout } = this.state.ws;
    const { model, stale } = this.state.compile;
    if (!layout) return null;
    if (!model || stale) return layout;
    return pruneLayout(layout, modelIds(model)).layout;
  }

  private markFileSaved(
    key: string,
    bytes: Uint8Array,
    handle?: FileSystemFileHandle | null,
  ): void {
    // Dirty again at once when the text changed while the bytes were being written.
    const { text } = decodeDbml(bytes);
    this.diskLf.set(key, editorText(text));
    const files = this.state.ws.files.map((f) =>
      f.key === key
        ? {
            ...f,
            disk: { bytes, text },
            savedVersionId: models.versionOf(key),
            ...(handle !== undefined ? { handle } : {}),
          }
        : f,
    );
    this.state = { ...this.state, ws: { ...this.state.ws, files } };
    this.set({ dirty: { ...this.state.dirty, [key]: this.fileDirty(key) } });
  }

  /**
   * `layout` was written as `text`; `before` is the working layout it was computed from. When the
   * layout changed while writing (a drag), the newer layout stays and is still dirty.
   */
  private markLayoutSaved(
    text: string,
    layout: Layout | null,
    handle: FileSystemFileHandle | null,
    before: Layout | null,
  ): void {
    const unchanged = this.state.ws.layout === before;
    if (unchanged && layout !== this.state.ws.layout) this.history.amend(layout);
    this.state = {
      ...this.state,
      ws: {
        ...this.state.ws,
        ...(unchanged ? { layout } : {}),
        savedLayoutText: text,
        layoutHandle: handle,
        layoutInvalid: null,
      },
    };
    this.set({ layoutDirty: this.computeLayoutDirty() });
  }

  /** The open document is still `wsId` (an open during an await makes a save stop). */
  private still(wsId: string): boolean {
    return this.state.ws.id === wsId;
  }

  async save(): Promise<void> {
    if (this.state.saving) return;
    if (!hasFsa()) return this.downloadSave();
    const ws = this.state.ws;
    const entry = ws.files.find((f) => f.key === ws.entry)!;
    const multi = ws.files.length > 1;
    if (!multi && !entry.handle) return this.saveAs();
    // A folder without a place on disk (an example, a dropped folder in some browsers): pick one.
    if (
      multi &&
      !ws.dir &&
      ws.files.some((f) => !f.handle && (this.state.dirty[f.key] || f.key === ws.entry))
    )
      return this.saveFolder();
    this.set({ saving: true });
    try {
      let ok = true;
      const unsaved: string[] = [];
      if (ws.dir) await ensureWritable(ws.dir);
      if (!this.still(ws.id)) return;
      // Changed outside relvista since it was opened or saved: replacing that is the user's call.
      const changed: string[] = [];
      for (const f of ws.files) {
        if (!this.state.dirty[f.key] || !f.handle || !f.disk) continue;
        if (await changedOnDisk(f.handle, f.disk.bytes)) changed.push(f.key);
      }
      if (!this.still(ws.id)) return;
      if (changed.length && !(await this.confirmOverwrite(changed))) return;
      for (const f of ws.files) {
        if (!this.state.dirty[f.key]) continue;
        const text = models.textOf(f.key);
        try {
          const handle = f.handle ?? (ws.dir ? await fileInDirectory(ws.dir, f.key, true) : null);
          if (!this.still(ws.id)) return;
          if (!handle) {
            unsaved.push(f.key);
            continue;
          }
          if (!(await ensureWritable(handle))) throw new Error('permission denied');
          if (!this.still(ws.id)) return;
          const bytes = saveBytes(f, text);
          await writeHandle(handle, bytes);
          if (!this.still(ws.id)) return;
          this.markFileSaved(f.key, bytes, handle);
        } catch (e) {
          ok = false;
          if (!isAbort(e)) this.toast('error', `Could not save ${f.key}: ${errorMessage(e)}`);
        }
      }
      if (unsaved.length) {
        ok = false;
        this.toast(
          'warning',
          `Not saved, no file to write to: ${unsaved.join(', ')}. Use Export → DBML file for a copy.`,
        );
      }
      if (this.state.layoutDirty) ok = (await this.writeSidecar(false)) && ok;
      if (!this.still(ws.id)) return;
      this.set({ saveState: ok && !this.isDirty() ? 'saved' : 'unsaved' }, true);
    } finally {
      this.set({ saving: false });
      this.updateTitle();
    }
  }

  /**
   * Save of a multi-file workspace that has no folder on disk: asks for one and writes every file
   * at its relative path (and the layout file next to the entry), then works on that folder.
   */
  async saveFolder(): Promise<void> {
    if (this.state.saving) return;
    const ws = this.state.ws;
    if (!hasDirectoryPicker()) {
      const keys = ws.files.filter((f) => this.state.dirty[f.key]).map((f) => f.key);
      this.toast(
        'warning',
        `This browser cannot write folders. Not saved: ${keys.join(', ') || 'nothing changed'}.`,
      );
      return;
    }
    let dir: FileSystemDirectoryHandle | null;
    try {
      dir = await pickDirectory();
    } catch (e) {
      this.toast('error', `Could not save: ${errorMessage(e)}`);
      return;
    }
    if (!dir || !this.still(ws.id)) return;
    this.set({ saving: true });
    try {
      if (!(await ensureWritable(dir))) throw new Error('permission denied');
      const existing: string[] = [];
      for (const f of ws.files) {
        const there = await fileInDirectory(dir, f.key, false).then(
          () => true,
          () => false,
        );
        if (there) existing.push(f.key);
      }
      if (!this.still(ws.id)) return;
      if (existing.length) {
        const replace = await this.confirm(
          `Replace files in ${dir.name}?`,
          `${dir.name} already has ${existing.length === 1 ? existing[0] : `${existing.length} of these files`}. Saving replaces ${existing.length === 1 ? 'it' : 'them'}.`,
          'Replace',
          true,
        );
        if (!replace || !this.still(ws.id)) return;
      }
      let ok = true;
      for (const f of ws.files) {
        const text = models.textOf(f.key);
        try {
          const handle = await fileInDirectory(dir, f.key, true);
          const bytes = saveBytes(f, text);
          await writeHandle(handle, bytes);
          if (!this.still(ws.id)) return;
          this.markFileSaved(f.key, bytes, handle);
        } catch (e) {
          ok = false;
          this.toast('error', `Could not save ${f.key}: ${errorMessage(e)}`);
        }
      }
      // A layout file the workspace had (Save as of an opened folder) comes along.
      const hadLayout = ws.savedLayoutText !== null && !!this.state.ws.layout;
      this.setWs({
        dir,
        origin: 'folder',
        name: `${dir.name}/${ws.entry}`,
        layoutHandle: null,
        savedLayoutText: null,
        layoutInvalid: null,
      });
      this.set({ layoutDirty: this.computeLayoutDirty() });
      if (this.state.layoutDirty || hadLayout) ok = (await this.writeSidecar(false)) && ok;
      if (!this.still(ws.id)) return;
      this.set({ saveState: ok && !this.isDirty() ? 'saved' : 'unsaved' }, true);
      void this.rememberRecent(dir);
    } catch (e) {
      if (!isAbort(e)) this.toast('error', `Could not save: ${errorMessage(e)}`);
    } finally {
      this.set({ saving: false });
      this.updateTitle();
    }
  }

  async saveAs(): Promise<void> {
    if (this.state.saving) return;
    if (!hasFsa()) return this.downloadSave();
    // A folder workspace moves as a whole: its files import each other by relative path, so
    // writing only the entry elsewhere would split it across two folders.
    if (this.state.ws.files.length > 1) return this.saveFolder();
    const ws = this.state.ws;
    const entry = ws.files.find((f) => f.key === ws.entry)!;
    const handle = await pickSaveFile(this.suggestedName(), 'dbml').catch((e) => {
      this.toast('error', `Could not save: ${errorMessage(e)}`);
      return null;
    });
    if (!handle || !this.still(ws.id)) return;
    this.set({ saving: true });
    try {
      const text = models.textOf(entry.key);
      const bytes = saveBytes(entry, text);
      await writeHandle(handle, bytes);
      if (!this.still(ws.id)) return;
      this.markFileSaved(entry.key, bytes, handle);
      const single = this.state.ws.files.length === 1;
      // A new place for a single file: its layout file belongs next to it too.
      const sidecar =
        single &&
        !!this.state.ws.layout &&
        (this.state.userTouched || this.state.ws.savedLayoutText !== null);
      this.setWs({
        name: single ? handle.name : this.state.ws.name,
        origin: single ? 'file' : this.state.ws.origin,
        ...(single ? { layoutHandle: null, dir: null, savedLayoutText: null } : {}),
      });
      if (single) this.set({ layoutDirty: this.computeLayoutDirty() });
      let ok = true;
      if (sidecar || this.state.layoutDirty) ok = await this.writeSidecar(true);
      if (!this.still(ws.id)) return;
      this.set({ saveState: ok && !this.isDirty() ? 'saved' : 'unsaved' }, true);
      void this.rememberRecent(handle);
    } catch (e) {
      this.toast('error', `Could not save: ${errorMessage(e)}`);
    } finally {
      this.set({ saving: false });
      this.updateTitle();
    }
  }

  /** Asks before Save replaces files that changed on disk since they were opened or saved. */
  private confirmOverwrite(keys: string[]): Promise<boolean> {
    const one = keys.length === 1;
    const names = one ? baseName(keys[0]!) : `${keys.length} files`;
    return this.confirm(
      `${names} changed on disk`,
      `${one ? 'It was' : `${keys.join(', ')} were`} changed outside relvista since ${one ? 'it was' : 'they were'} opened or last saved. Saving replaces those changes with the version here.`,
      'Replace',
      true,
    );
  }

  /** Writes `<entry>.layout.json`. `ask`: always pick a location (Save as). */
  private async writeSidecar(ask: boolean): Promise<boolean> {
    const ws = this.state.ws;
    if (ws.layoutInvalid && !ask) {
      const replace = await this.confirm(
        'Replace the invalid layout file?',
        `The existing layout file could not be read (${ws.layoutInvalid}). Saving replaces it with the current layout. Cancel saves the DBML only.`,
        'Replace layout file',
        true,
      );
      if (!replace || !this.still(ws.id)) return false;
    }
    const before = this.state.ws.layout;
    const layout = this.layoutToWrite();
    if (!layout) return true;
    const text = serializeLayout(layout);
    const { dir, entry, layoutHandle, name, savedLayoutText } = this.state.ws;
    if (!ask && layoutHandle && savedLayoutText !== null) {
      const now = await readNow(layoutHandle);
      if (!this.still(ws.id)) return false;
      if (now && new TextDecoder().decode(now) !== savedLayoutText) {
        if (!(await this.confirmOverwrite([sidecarKey(entry)]))) return false;
      }
    }
    try {
      let handle = ask ? null : layoutHandle;
      if (!handle && dir && !ask) handle = await fileInDirectory(dir, sidecarKey(entry), true);
      if (!handle) handle = await pickSaveFile(sidecarKey(baseName(name)), 'layout');
      if (!handle || !this.still(ws.id)) return false;
      if (!(await ensureWritable(handle))) throw new Error('permission denied');
      if (!this.still(ws.id)) return false;
      await writeHandle(handle, text);
      if (!this.still(ws.id)) return false;
      this.markLayoutSaved(text, layout, handle, before);
      return true;
    } catch (e) {
      if (!isAbort(e)) this.toast('error', `Could not save the layout file: ${errorMessage(e)}`);
      return false;
    }
  }

  /** No File System Access: Save = Save as = downloads. */
  private downloadSave(): void {
    const ws = this.state.ws;
    for (const f of ws.files) {
      const isEntry = f.key === ws.entry;
      if (!isEntry && !this.state.dirty[f.key]) continue;
      const bytes = saveBytes(f, models.textOf(f.key));
      downloadBytes(bytes, isEntry ? this.suggestedName() : baseName(f.key));
      this.markFileSaved(f.key, bytes);
    }
    if (this.state.layoutDirty) {
      const before = this.state.ws.layout;
      const layout = this.layoutToWrite();
      if (layout) {
        const text = serializeLayout(layout);
        downloadBytes(text, sidecarKey(this.suggestedName()), 'application/json');
        this.markLayoutSaved(text, layout, null, before);
      }
    }
    this.set({ saveState: 'downloaded' }, true);
    this.updateTitle();
  }

  // --- export --------------------------------------------------------------------------------

  private exportTitle(): string {
    return (
      this.state.compile.model?.project?.name ?? baseName(this.state.ws.name).replace(/\.dbml$/, '')
    );
  }

  private exportBase(): string {
    return baseName(this.suggestedName()).replace(/\.dbml$/, '');
  }

  async exportAs(kind: 'svg' | 'png' | 'print' | 'dbml' | 'layout'): Promise<void> {
    const { downloadBlob, downloadSvg } = await import('@relvista/renderer');
    try {
      if (kind === 'dbml') {
        const entry = this.state.ws.files.find((f) => f.key === this.state.ws.entry)!;
        downloadBytes(saveBytes(entry, models.textOf(entry.key)), this.suggestedName());
        return;
      }
      if (kind === 'layout') {
        const layout = this.layoutToWrite();
        if (!layout) {
          this.toast('info', 'There is no layout yet.');
          return;
        }
        downloadBytes(
          serializeLayout(layout),
          sidecarKey(this.suggestedName()),
          'application/json',
        );
        return;
      }
      if (!this.canvas || !this.state.compile.model) {
        this.toast('info', 'There is no diagram to export yet.');
        return;
      }
      const title = this.exportTitle();
      if (kind === 'svg') {
        const svg = this.canvas.exportSvg({ title });
        if (svg) downloadSvg(svg, `${this.exportBase()}.svg`);
      } else if (kind === 'png') {
        const blob = await this.canvas.exportPng({ title, scale: 2 });
        if (blob) downloadBlob(blob, `${this.exportBase()}.png`);
      } else {
        this.canvas.print({ title });
      }
    } catch (e) {
      this.toast('error', `Export failed: ${errorMessage(e)}`);
    }
  }

  async exportSql(format: ExportFormat, label: string): Promise<void> {
    if (this.state.ws.files.length > 1 || this.state.compile.stale) return;
    if (!sql.sqlLoaded()) this.set({ sqlBusy: 'Loading SQL support (2.6 MB)…' });
    else this.set({ sqlBusy: `Exporting ${label}…` });
    try {
      const text = await sql.exportSql(this.entryText(), format);
      downloadBytes(text, `${this.exportBase()}.${format}.sql`, 'application/sql');
    } catch (e) {
      this.toast('error', `${label} export failed: ${errorMessage(e)}`);
    } finally {
      this.set({ sqlBusy: null });
    }
  }

  async importSql(text: string, format: ImportFormat): Promise<boolean> {
    this.set({ sqlBusy: sql.sqlLoaded() ? 'Converting…' : 'Loading SQL support (2.6 MB)…' });
    try {
      const dbml = await sql.importSql(text, format);
      this.set({ sqlBusy: null });
      await this.openText(dbml, 'imported.dbml', 'sql');
      return true;
    } catch (e) {
      this.set({ sqlBusy: null });
      this.toast('error', `Could not convert the SQL: ${errorMessage(e)}`);
      return false;
    }
  }

  // --- autosave ------------------------------------------------------------------------------

  private scheduleAutosave(): void {
    if (this.autosaveTimer !== null) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => void this.autosaveNow(), 500);
  }

  async autosaveNow(): Promise<void> {
    if (this.autosaveTimer !== null) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    if (this.state.autosavePaused) {
      this.missedAutosave = true;
      return;
    }
    if (models.modelKeys().length === 0) return;
    this.missedAutosave = false;
    if (this.checkStoredBeforeWrite) {
      this.checkStoredBeforeWrite = false;
      await this.rotateStoredSession(true);
    }
    const s = this.state;
    const { files, layout, ...rest } = s.ws;
    const session: SessionV1 = {
      v: 1,
      savedAt: Date.now(),
      workspace: {
        ...rest,
        files: files.map(({ savedVersionId: _v, ...f }) => ({
          ...f,
          text: models.textOf(f.key),
          dirty: s.dirty[f.key] === true,
        })),
        layoutText: layout ? serializeLayout(layout) : null,
        layoutDirty: s.layoutDirty,
      },
      ui: {
        split: s.split,
        tab: s.tab,
        activeFile: s.activeFile,
        ...(this.canvas ? { viewport: this.canvas.getViewport() } : {}),
      },
    };
    try {
      await this.sessions.save(session);
      if (this.isDirty() && this.state.saveState === 'unsaved')
        this.set({ saveState: 'autosaved' });
    } catch {
      // Storage full or blocked: the document is still in memory.
    }
  }

  // --- misc ----------------------------------------------------------------------------------

  updateTitle(): void {
    if (typeof document === 'undefined') return;
    const name = baseName(this.state.ws.name);
    document.title = `${this.isDirty() ? '● ' : ''}${name} — relvista editor`;
  }
}

/** A stored session worth keeping as 'previous': unsaved work, or a document from a file/URL. */
export function sessionWorthKeeping(s: SessionV1): boolean {
  const w = s.workspace;
  if (w.layoutDirty || w.files.some((f) => f.dirty)) return true;
  if (w.origin === 'file' || w.origin === 'folder' || w.origin === 'url') return true;
  if (w.origin !== 'untitled' && w.origin !== 'sql') return false;
  return w.files.some((f) => f.disk === null && f.handle === null && f.text.trim() !== '');
}

export const store = new EditorStore();

export function useEditor<T>(selector: (s: EditorState) => T): T {
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}
