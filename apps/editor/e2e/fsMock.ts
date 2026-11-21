/**
 * Test-only in-memory File System Access API, injected with `page.addInitScript(installFsMock)`.
 * Tests seed files and read them back through `window.__fsMock` (the app ships no hooks).
 *
 * - `__fsMock.files`: Map path → Uint8Array ('/'-separated, no leading slash).
 * - `__fsMock.nextOpen`: paths `showOpenFilePicker` returns next (then cleared).
 * - `__fsMock.nextDirectory`: folder path `showDirectoryPicker` returns next.
 * - `__fsMock.nextSave`: path `showSaveFilePicker` returns next (shifted from an array).
 * - `__fsMock.writes`: every completed write, in order.
 */
export interface FsMockApi {
  files: Map<string, Uint8Array>;
  nextOpen: string[];
  nextDirectory: string | null;
  nextSave: string[];
  writes: string[];
  put(path: string, bytes: number[] | string): void;
  get(path: string): number[] | null;
}

declare global {
  interface Window {
    __fsMock: FsMockApi;
  }
}

/** Runs in the page (serialised by Playwright): keep it self-contained. */
export function installFsMock(mode: string = 'fsa'): void {
  if (mode === 'fallback') {
    const w = window as unknown as Record<string, unknown>;
    delete w.showOpenFilePicker;
    delete w.showSaveFilePicker;
    delete w.showDirectoryPicker;
    return;
  }
  const files = new Map<string, Uint8Array>();
  const api = {
    files,
    nextOpen: [] as string[],
    nextDirectory: null as string | null,
    nextSave: [] as string[],
    writes: [] as string[],
    put(path: string, bytes: number[] | string) {
      files.set(
        path,
        typeof bytes === 'string' ? new TextEncoder().encode(bytes) : new Uint8Array(bytes),
      );
    },
    get(path: string) {
      const b = files.get(path);
      return b ? [...b] : null;
    },
  };
  const base = (p: string) => p.slice(p.lastIndexOf('/') + 1);
  const abort = () => new DOMException('The user aborted a request.', 'AbortError');

  class FileHandle {
    readonly kind = 'file';
    constructor(readonly path: string) {}
    get name() {
      return base(this.path);
    }
    async getFile() {
      const bytes = files.get(this.path);
      if (!bytes) throw new DOMException('not found', 'NotFoundError');
      return new File([bytes as Uint8Array<ArrayBuffer>], this.name);
    }
    async createWritable() {
      const path = this.path;
      let chunks: Uint8Array[] = [];
      return {
        async write(data: Uint8Array | string | Blob) {
          if (typeof data === 'string') chunks.push(new TextEncoder().encode(data));
          else if (data instanceof Blob) chunks.push(new Uint8Array(await data.arrayBuffer()));
          else chunks.push(new Uint8Array(data));
        },
        async close() {
          const total = chunks.reduce((n, c) => n + c.length, 0);
          const out = new Uint8Array(total);
          let at = 0;
          for (const c of chunks) {
            out.set(c, at);
            at += c.length;
          }
          files.set(path, out);
          api.writes.push(path);
        },
        async abort() {
          chunks = [];
        },
      };
    }
    async queryPermission() {
      return 'granted';
    }
    async requestPermission() {
      return 'granted';
    }
    async isSameEntry(other: { path?: string }) {
      return other?.path === this.path;
    }
  }

  class DirHandle {
    readonly kind = 'directory';
    constructor(readonly path: string) {}
    get name() {
      return base(this.path) || 'root';
    }
    private child(name: string) {
      return this.path ? `${this.path}/${name}` : name;
    }
    async *values() {
      const prefix = this.path ? `${this.path}/` : '';
      const dirs = new Set<string>();
      for (const p of [...files.keys()].sort()) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash < 0) yield new FileHandle(p);
        else dirs.add(rest.slice(0, slash));
      }
      for (const d of dirs) yield new DirHandle(this.child(d));
    }
    async getFileHandle(name: string, opts?: { create?: boolean }) {
      const p = this.child(name);
      if (!files.has(p)) {
        if (!opts?.create) throw new DOMException('not found', 'NotFoundError');
        files.set(p, new Uint8Array());
      }
      return new FileHandle(p);
    }
    async getDirectoryHandle(name: string) {
      return new DirHandle(this.child(name));
    }
    async queryPermission() {
      return 'granted';
    }
    async requestPermission() {
      return 'granted';
    }
    async isSameEntry(other: { path?: string }) {
      return other?.path === this.path;
    }
  }

  const w = window as unknown as Record<string, unknown>;
  w.showOpenFilePicker = async () => {
    const paths = api.nextOpen;
    api.nextOpen = [];
    if (!paths.length) throw abort();
    return paths.map((p) => new FileHandle(p));
  };
  w.showSaveFilePicker = async (opts?: { suggestedName?: string }) => {
    const p = api.nextSave.shift() ?? opts?.suggestedName;
    if (!p) throw abort();
    if (!files.has(p)) files.set(p, new Uint8Array());
    return new FileHandle(p);
  };
  w.showDirectoryPicker = async () => {
    const p = api.nextDirectory;
    api.nextDirectory = null;
    if (p === null) throw abort();
    return new DirHandle(p);
  };
  (window as unknown as { __fsMock: unknown }).__fsMock = api;
}
