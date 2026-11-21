/**
 * Files changed outside relvista (an IDE, `git pull`): a restored session re-reads its files, and
 * Save compares the file on disk with what was opened before replacing it. Pure apart from the
 * handles it is given, so it is unit-tested with fakes.
 */

/** The part of a FileSystemFileHandle used here. */
export interface ReadableHandle {
  getFile(): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
  queryPermission?(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The file's bytes now; null when it cannot be read (gone, no permission). */
export async function readNow(handle: ReadableHandle): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await (await handle.getFile()).arrayBuffer());
  } catch {
    return null;
  }
}

/**
 * The file's bytes, read only when read access is already granted (no permission prompt: at
 * startup there is no click to ask in). Null otherwise.
 */
export async function readIfGranted(handle: ReadableHandle): Promise<Uint8Array | null> {
  try {
    if (handle.queryPermission && (await handle.queryPermission({ mode: 'read' })) !== 'granted')
      return null;
  } catch {
    return null;
  }
  return readNow(handle);
}

/** The bytes on disk when they differ from `known`; null when unchanged or unreadable. */
export async function changedOnDisk(
  handle: ReadableHandle,
  known: Uint8Array,
): Promise<Uint8Array | null> {
  const now = await readNow(handle);
  return now && !sameBytes(now, known) ? now : null;
}

export interface SessionFileLike {
  key: string;
  disk: { bytes: Uint8Array; text: string } | null;
  handle: ReadableHandle | null;
  dirty: boolean;
}

export interface RefreshResult {
  /** Files unchanged in the session whose disk bytes changed: they open from the new bytes. */
  reloaded: Map<string, Uint8Array>;
  /** Files with unsaved edits whose disk bytes changed too: the edits are kept, Save asks. */
  conflicts: string[];
}

/** Compares a restored session's files with the disk (where read access is still granted). */
export async function refreshFromDisk(files: readonly SessionFileLike[]): Promise<RefreshResult> {
  const reloaded = new Map<string, Uint8Array>();
  const conflicts: string[] = [];
  await Promise.all(
    files.map(async (f) => {
      if (!f.handle || !f.disk) return;
      const now = await readIfGranted(f.handle);
      if (!now || sameBytes(now, f.disk.bytes)) return;
      if (f.dirty) conflicts.push(f.key);
      else reloaded.set(f.key, now);
    }),
  );
  conflicts.sort();
  return { reloaded, conflicts };
}
