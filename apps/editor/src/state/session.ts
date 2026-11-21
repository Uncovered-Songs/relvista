/**
 * Autosave: one small IndexedDB helper (database 'relvista-editor', store 'sessions') and the
 * SessionV1 (de)serialiser. Keys: 'current', 'previous', 'recent'.
 */
import type { SessionV1 } from './types.js';

export const DB_NAME = 'relvista-editor';
export const STORE = 'sessions';

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export function idbOpen(factory: IDBFactory = indexedDB, name = DB_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = factory.open(name, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function idbGet<T>(db: IDBDatabase, key: string): Promise<T | undefined> {
  return (await req(db.transaction(STORE, 'readonly').objectStore(STORE).get(key))) as
    T | undefined;
}

export async function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  await req(db.transaction(STORE, 'readwrite').objectStore(STORE).put(value, key));
}

export async function idbDelete(db: IDBDatabase, key: string): Promise<void> {
  await req(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(key));
}

/** Checks the shape of a stored value; returns null for anything that is not a SessionV1. */
export function parseSession(raw: unknown): SessionV1 | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = raw as Partial<SessionV1>;
  if (s.v !== 1 || typeof s.savedAt !== 'number' || !s.workspace || !s.ui) return null;
  const w = s.workspace;
  if (typeof w.entry !== 'string' || !Array.isArray(w.files) || w.files.length === 0) return null;
  for (const f of w.files) {
    if (!f || typeof f.key !== 'string' || typeof f.text !== 'string' || !f.envelope) return null;
    if (f.disk && !(f.disk.bytes instanceof Uint8Array)) return null;
  }
  if (!w.files.some((f) => f.key === w.entry)) return null;
  if (typeof s.ui.split !== 'number') return null;
  return s as SessionV1;
}

export interface RecentEntry {
  name: string;
  kind: 'file' | 'directory';
  handle: FileSystemHandle;
  openedAt: number;
}

/** Session persistence with BroadcastChannel second-tab detection. */
export class SessionStore {
  private db: Promise<IDBDatabase> | null = null;

  constructor(private readonly factory: IDBFactory | null = globalThis.indexedDB ?? null) {}

  private open(): Promise<IDBDatabase> | null {
    if (!this.factory) return null;
    this.db ??= idbOpen(this.factory).catch((e) => {
      this.db = null;
      throw e;
    });
    return this.db;
  }

  async load(key: 'current' | 'previous' = 'current'): Promise<SessionV1 | null> {
    const db = this.open();
    if (!db) return null;
    try {
      return parseSession(await idbGet(await db, key));
    } catch {
      return null;
    }
  }

  async save(session: SessionV1): Promise<void> {
    const db = this.open();
    if (!db) return;
    await idbPut(await db, 'current', session);
  }

  /** Moves 'current' to 'previous' (before a share link, URL, example or new document replaces it). */
  async rotate(): Promise<void> {
    const db = this.open();
    if (!db) return;
    const d = await db;
    const cur = await idbGet(d, 'current');
    if (cur !== undefined) await idbPut(d, 'previous', cur);
  }

  async hasPrevious(): Promise<boolean> {
    return (await this.load('previous')) !== null;
  }

  async recent(): Promise<RecentEntry[]> {
    const db = this.open();
    if (!db) return [];
    try {
      const r = await idbGet<RecentEntry[]>(await db, 'recent');
      return Array.isArray(r) ? r : [];
    } catch {
      return [];
    }
  }

  async addRecent(entry: RecentEntry, max = 8): Promise<void> {
    const db = this.open();
    if (!db) return;
    const list = await this.recent();
    const rest: RecentEntry[] = [];
    for (const r of list) {
      let same = r.name === entry.name && r.kind === entry.kind;
      try {
        if (same && r.handle.isSameEntry) same = await r.handle.isSameEntry(entry.handle);
      } catch {
        // keep name match
      }
      if (!same) rest.push(r);
    }
    await idbPut(await db, 'recent', [entry, ...rest].slice(0, max));
  }
}
