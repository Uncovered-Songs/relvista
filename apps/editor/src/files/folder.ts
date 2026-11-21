/**
 * Folder workspaces: walk a directory (File System Access handles, or a `webkitdirectory` File
 * list), keep `*.dbml` and `*.dbml.layout.json`, enforce limits, choose the entry file.
 */
import { LIMITS, LimitError, formatBytes } from './limits.js';
import { isDbmlName, isSidecarName } from './sidecar.js';

export interface WalkedFile {
  /** Path relative to the chosen folder, '/'-separated, e.g. `common/users.dbml`. */
  path: string;
  size: number;
  read(): Promise<Uint8Array>;
  handle: FileSystemFileHandle | null;
}

/** Minimal shape of a directory handle the walker needs (real handles and test fakes). */
export interface DirLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<DirLike | FileLike>;
}
export interface FileLike {
  kind: 'file';
  name: string;
  getFile(): Promise<{ size: number; arrayBuffer(): Promise<ArrayBuffer> }>;
}

function skipFolder(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules';
}

function wanted(name: string): boolean {
  return isDbmlName(name) || isSidecarName(name);
}

class Budget {
  files = 0;
  bytes = 0;
  add(size: number): void {
    this.files++;
    this.bytes += size;
    if (this.files > LIMITS.maxFolderFiles) {
      throw new LimitError(
        `This folder has more than ${LIMITS.maxFolderFiles} DBML files; open a smaller folder.`,
      );
    }
    if (this.bytes > LIMITS.maxFolderBytes) {
      throw new LimitError(
        `The DBML files in this folder exceed ${formatBytes(LIMITS.maxFolderBytes)}; open a smaller folder.`,
      );
    }
  }
}

/** Walks a directory handle (depth ≤ 4 below it, dot-folders and node_modules skipped). */
export async function walkDirectoryHandle(dir: DirLike): Promise<WalkedFile[]> {
  const out: WalkedFile[] = [];
  const budget = new Budget();
  async function walk(d: DirLike, prefix: string, depth: number): Promise<void> {
    const children: Array<DirLike | FileLike> = [];
    for await (const child of d.values()) children.push(child);
    children.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const child of children) {
      if (child.kind === 'directory') {
        if (depth < LIMITS.maxFolderDepth && !skipFolder(child.name)) {
          await walk(child, `${prefix}${child.name}/`, depth + 1);
        }
        continue;
      }
      if (!wanted(child.name)) continue;
      const file = await child.getFile();
      budget.add(file.size);
      out.push({
        path: prefix + child.name,
        size: file.size,
        read: async () => new Uint8Array(await file.arrayBuffer()),
        handle: child as unknown as FileSystemFileHandle,
      });
    }
  }
  await walk(dir, '', 0);
  return out;
}

/** Files from `<input webkitdirectory>` or a dropped folder (paths include the folder name). */
export function walkFileList(
  files: ReadonlyArray<{
    name: string;
    size: number;
    webkitRelativePath?: string;
    arrayBuffer(): Promise<ArrayBuffer>;
  }>,
  relativePath: (f: { name: string; webkitRelativePath?: string }) => string = (f) =>
    f.webkitRelativePath || f.name,
): WalkedFile[] {
  const budget = new Budget();
  const out: WalkedFile[] = [];
  const paths = files.map((f) => relativePath(f).replace(/^\/+/, ''));
  // Strip the common top folder ("myproject/main.dbml" → "main.dbml").
  const tops = new Set(paths.map((p) => (p.includes('/') ? p.split('/')[0] : '')));
  const strip = tops.size === 1 && !tops.has('') ? `${[...tops][0]}/` : '';
  files.forEach((f, i) => {
    const path = paths[i]!.slice(strip.length);
    const segments = path.split('/');
    const folders = segments.slice(0, -1);
    if (folders.length > LIMITS.maxFolderDepth) return;
    if (folders.some(skipFolder)) return;
    if (!wanted(segments[segments.length - 1]!)) return;
    budget.add(f.size);
    out.push({
      path,
      size: f.size,
      read: async () => new Uint8Array(await f.arrayBuffer()),
      handle: null,
    });
  });
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * Entry file of a folder: `main.dbml` at the root; else the only root `*.dbml`; else null (ask).
 * With a single `.dbml` anywhere, that one.
 */
export function chooseEntry(paths: readonly string[]): string | null {
  const dbml = paths.filter(isDbmlName);
  const root = dbml.filter((p) => !p.includes('/'));
  if (root.includes('main.dbml')) return 'main.dbml';
  if (root.length === 1) return root[0]!;
  if (dbml.length === 1) return dbml[0]!;
  return null;
}

/** Folder part of a key: `common/users.dbml` → `common/`, `main.dbml` → ''. */
export function dirOf(key: string): string {
  const i = key.lastIndexOf('/');
  return i < 0 ? '' : key.slice(0, i + 1);
}

export function baseName(key: string): string {
  const i = key.lastIndexOf('/');
  return i < 0 ? key : key.slice(i + 1);
}
