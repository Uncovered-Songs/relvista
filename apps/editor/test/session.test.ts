import { describe, expect, it } from 'vitest';
import {
  SessionStore,
  idbDelete,
  idbGet,
  idbOpen,
  idbPut,
  parseSession,
} from '../src/state/session.js';
import type { SessionV1 } from '../src/state/types.js';

// --- a minimal in-memory IndexedDB shim (just what session.ts uses) -------------------------
type Handler = (() => void) | null;
class Req<T> {
  result!: T;
  error: unknown = null;
  onsuccess: Handler = null;
  onerror: Handler = null;
  onupgradeneeded: Handler = null;
  succeed(v: T) {
    this.result = v;
    queueMicrotask(() => this.onsuccess?.());
  }
}
class Store {
  constructor(private readonly data: Map<string, unknown>) {}
  get(k: string) {
    const r = new Req<unknown>();
    r.succeed(this.data.has(k) ? structuredClone(this.data.get(k)) : undefined);
    return r;
  }
  put(v: unknown, k: string) {
    const r = new Req<string>();
    this.data.set(k, structuredClone(v));
    r.succeed(k);
    return r;
  }
  delete(k: string) {
    const r = new Req<undefined>();
    this.data.delete(k);
    r.succeed(undefined);
    return r;
  }
}
class Db {
  stores = new Map<string, Map<string, unknown>>();
  objectStoreNames = { contains: (n: string) => this.stores.has(n) };
  createObjectStore(n: string) {
    this.stores.set(n, new Map());
  }
  transaction(n: string) {
    const s = this.stores.get(n);
    if (!s) throw new Error(`no store ${n}`);
    return { objectStore: () => new Store(s) };
  }
}
class Factory {
  dbs = new Map<string, Db>();
  open(name: string) {
    const r = new Req<Db>();
    let db = this.dbs.get(name);
    const fresh = !db;
    if (!db) this.dbs.set(name, (db = new Db()));
    r.result = db;
    queueMicrotask(() => {
      if (fresh) r.onupgradeneeded?.();
      r.onsuccess?.();
    });
    return r;
  }
}
const factory = () => new Factory() as unknown as IDBFactory;

function session(text = 'Table a {\n  id int\n}\n'): SessionV1 {
  return {
    v: 1,
    savedAt: 1,
    workspace: {
      id: 'w1',
      origin: 'file',
      name: 'a.dbml',
      entry: 'a.dbml',
      dir: null,
      savedLayoutText: null,
      layoutHandle: null,
      layoutInvalid: null,
      view: 'v1',
      files: [
        {
          key: 'a.dbml',
          envelope: { bom: true, eol: '\r\n', mixed: false },
          disk: { bytes: new Uint8Array([0xef, 0xbb, 0xbf, 0x41]), text: 'A' },
          handle: null,
          text,
          dirty: true,
        },
      ],
      layoutText: '{"version":1}\n',
      layoutDirty: true,
    },
    ui: { split: 0.42, tab: 'diagram', activeFile: 'a.dbml', viewport: { x: 1, y: 2, zoom: 0.5 } },
  };
}

describe('idb helper', () => {
  it('put / get / delete', async () => {
    const db = await idbOpen(factory());
    await idbPut(db, 'k', { a: 1 });
    expect(await idbGet(db, 'k')).toEqual({ a: 1 });
    await idbDelete(db, 'k');
    expect(await idbGet(db, 'k')).toBeUndefined();
  });
});

describe('SessionStore', () => {
  it('round trips a SessionV1 including bytes', async () => {
    const s = new SessionStore(factory());
    await s.save(session());
    const back = await s.load();
    expect(back).toEqual(session());
    expect(back!.workspace.files[0]!.disk!.bytes).toBeInstanceOf(Uint8Array);
  });
  it('rotate moves current to previous', async () => {
    const s = new SessionStore(factory());
    expect(await s.hasPrevious()).toBe(false);
    await s.save(session('one'));
    await s.rotate();
    await s.save(session('two'));
    expect((await s.load('previous'))!.workspace.files[0]!.text).toBe('one');
    expect((await s.load('current'))!.workspace.files[0]!.text).toBe('two');
  });
  it('no IndexedDB → no-ops', async () => {
    const s = new SessionStore(null);
    await s.save(session());
    expect(await s.load()).toBeNull();
  });
  it('recent list dedupes by name and caps', async () => {
    const s = new SessionStore(factory());
    const h = (name: string) => ({ name, kind: 'file' }) as unknown as FileSystemHandle;
    for (const n of ['a', 'b', 'a', 'c']) {
      await s.addRecent({ name: n, kind: 'file', handle: h(n), openedAt: 0 }, 2);
    }
    expect((await s.recent()).map((r) => r.name)).toEqual(['c', 'a']);
  });
});

describe('parseSession', () => {
  it('rejects malformed values', () => {
    expect(parseSession(null)).toBeNull();
    expect(parseSession({ v: 2 })).toBeNull();
    const s = session();
    s.workspace.entry = 'missing.dbml';
    expect(parseSession(s)).toBeNull();
    expect(parseSession(session())).not.toBeNull();
  });
});
