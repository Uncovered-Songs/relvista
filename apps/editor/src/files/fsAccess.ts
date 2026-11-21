/** File System Access API (Chromium). Every function feature-tests; callers fall back otherwise. */

export const DBML_TYPES: FilePickerAcceptType[] = [
  {
    description: 'DBML, layout and SQL files',
    accept: {
      'text/plain': ['.dbml'],
      'application/json': ['.json'],
      'application/sql': ['.sql', '.ddl'],
    },
  },
];

export const DBML_SAVE_TYPES: FilePickerAcceptType[] = [
  { description: 'DBML file', accept: { 'text/plain': ['.dbml'] } },
];

export const LAYOUT_SAVE_TYPES: FilePickerAcceptType[] = [
  { description: 'relvista layout file', accept: { 'application/json': ['.json'] } },
];

export function hasFsa(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.showOpenFilePicker === 'function' &&
    typeof window.showSaveFilePicker === 'function'
  );
}

export function hasDirectoryPicker(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

/** True when the user dismissed a picker (not an error to report). */
export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}

export async function pickOpenFiles(): Promise<FileSystemFileHandle[] | null> {
  try {
    return await window.showOpenFilePicker!({
      multiple: true,
      types: DBML_TYPES,
      id: 'relvista-open',
    });
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
}

export async function pickDirectory(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await window.showDirectoryPicker!({ mode: 'readwrite', id: 'relvista-open' });
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
}

export async function pickSaveFile(
  suggestedName: string,
  kind: 'dbml' | 'layout' | 'other' = 'dbml',
  accept?: FilePickerAcceptType[],
): Promise<FileSystemFileHandle | null> {
  try {
    return await window.showSaveFilePicker!({
      suggestedName,
      types:
        accept ??
        (kind === 'dbml' ? DBML_SAVE_TYPES : kind === 'layout' ? LAYOUT_SAVE_TYPES : undefined),
      id: 'relvista-save',
    });
  } catch (e) {
    if (isAbort(e)) return null;
    throw e;
  }
}

/** Asks for write access if needed (must run inside the click's activation). */
export async function ensureWritable(handle: FileSystemHandle): Promise<boolean> {
  const desc = { mode: 'readwrite' as const };
  try {
    if (handle.queryPermission && (await handle.queryPermission(desc)) === 'granted') return true;
    if (handle.requestPermission) return (await handle.requestPermission(desc)) === 'granted';
    return true;
  } catch {
    return false;
  }
}

export async function ensureReadable(handle: FileSystemHandle): Promise<boolean> {
  const desc = { mode: 'read' as const };
  try {
    if (handle.queryPermission && (await handle.queryPermission(desc)) === 'granted') return true;
    if (handle.requestPermission) return (await handle.requestPermission(desc)) === 'granted';
    return true;
  } catch {
    return false;
  }
}

export async function readHandle(handle: FileSystemFileHandle): Promise<Uint8Array> {
  const file = await handle.getFile();
  return new Uint8Array(await file.arrayBuffer());
}

export async function writeHandle(
  handle: FileSystemFileHandle,
  data: Uint8Array | string,
): Promise<void> {
  const w = await handle.createWritable();
  try {
    await w.write(typeof data === 'string' ? data : (data as Uint8Array<ArrayBuffer>));
    await w.close();
  } catch (e) {
    try {
      await w.abort();
    } catch {
      // ignore
    }
    throw e;
  }
}

/** Gets (or creates) a file inside `dir` at a '/'-separated relative path. */
export async function fileInDirectory(
  dir: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<FileSystemFileHandle> {
  const parts = path.split('/').filter(Boolean);
  let d = dir;
  for (const seg of parts.slice(0, -1)) d = await d.getDirectoryHandle(seg, { create });
  return d.getFileHandle(parts[parts.length - 1]!, { create });
}
