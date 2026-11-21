/**
 * Drag-and-drop of files and folders: File System Access handles when the browser offers them
 * (`getAsFileSystemHandle`), else `webkitGetAsEntry` (folders) or plain files.
 */
import { walkDirectoryHandle, type WalkedFile } from './folder.js';
import { LIMITS, LimitError } from './limits.js';
import { isDbmlName, isSidecarName } from './sidecar.js';

export type DropResult =
  | { kind: 'directory'; handle: FileSystemDirectoryHandle }
  | { kind: 'handles'; handles: FileSystemFileHandle[] }
  | { kind: 'folder-files'; name: string; files: WalkedFile[] }
  | { kind: 'files'; files: WalkedFile[] }
  | { kind: 'none' };

export function hasFiles(dt: DataTransfer | null): boolean {
  return !!dt && [...dt.types].includes('Files');
}

/** Must be called synchronously inside the drop handler (items expire after it returns). */
export function readDrop(dt: DataTransfer): Promise<DropResult> {
  const items = [...dt.items].filter((i) => i.kind === 'file');
  const handlePromises = items.map((i) => i.getAsFileSystemHandle?.() ?? null);
  const entries = items.map((i) => i.webkitGetAsEntry?.() ?? null);
  const files = [...dt.files];
  return (async () => {
    if (handlePromises.length > 0 && handlePromises.every((p) => p !== null)) {
      // Chromium resolves to null / undefined (or rejects) for files that are not on disk: a
      // File put into the DataTransfer by a page, or some drags from other apps. Then the plain
      // File objects below still carry the bytes.
      const handles = await Promise.all(
        handlePromises.map((p) => Promise.resolve(p).catch(() => null)),
      );
      if (handles.every((h): h is FileSystemHandle => h != null)) {
        const dir = handles.find((h) => h.kind === 'directory');
        if (dir) return { kind: 'directory', handle: dir as FileSystemDirectoryHandle };
        const fileHandles = handles.filter((h) => h.kind === 'file') as FileSystemFileHandle[];
        return fileHandles.length ? { kind: 'handles', handles: fileHandles } : { kind: 'none' };
      }
    }
    const dirEntry = entries.find((e) => e?.isDirectory) as FileSystemDirectoryEntry | undefined;
    if (dirEntry)
      return { kind: 'folder-files', name: dirEntry.name, files: await walkEntry(dirEntry) };
    const out: WalkedFile[] = files
      .filter((f) => isDbmlName(f.name) || isSidecarName(f.name))
      .map((f) => ({
        path: f.name,
        size: f.size,
        read: async () => new Uint8Array(await f.arrayBuffer()),
        handle: null,
      }));
    return out.length ? { kind: 'files', files: out } : { kind: 'none' };
  })();
}

function readEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader();
  const all: FileSystemEntry[] = [];
  return new Promise((resolve, reject) => {
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else {
          all.push(...batch);
          next();
        }
      }, reject);
    next();
  });
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

/** Same rules as folder.ts (depth, skips, limits) over FileSystemEntry. */
async function walkEntry(root: FileSystemDirectoryEntry): Promise<WalkedFile[]> {
  // Reuse walkDirectoryHandle through an adapter so the rules live in one place.
  const adapt = (d: FileSystemDirectoryEntry): Parameters<typeof walkDirectoryHandle>[0] => ({
    kind: 'directory',
    name: d.name,
    async *values() {
      for (const e of await readEntries(d)) {
        if (e.isDirectory) yield adapt(e as FileSystemDirectoryEntry);
        else {
          const fe = e as FileSystemFileEntry;
          yield {
            kind: 'file' as const,
            name: fe.name,
            getFile: () => fileOf(fe),
          };
        }
      }
    },
  });
  const files = await walkDirectoryHandle(adapt(root));
  if (files.length > LIMITS.maxFolderFiles) throw new LimitError('Too many files');
  return files.map((f) => ({ ...f, handle: null }));
}
