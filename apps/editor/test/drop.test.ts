import { describe, expect, it } from 'vitest';
import { readDrop } from '../src/files/drop.js';

type HandleResult = FileSystemHandle | null | undefined | 'reject';

/** A DataTransfer with plain File objects whose `getAsFileSystemHandle` resolves to `handle`. */
function transfer(files: File[], handle: (f: File) => HandleResult): DataTransfer {
  const items = files.map((f) => ({
    kind: 'file',
    getAsFileSystemHandle: () => {
      const h = handle(f);
      return h === 'reject' ? Promise.reject(new Error('nope')) : Promise.resolve(h);
    },
    webkitGetAsEntry: () => null,
  }));
  return { items, files, types: ['Files'] } as unknown as DataTransfer;
}

const file = (name: string, text: string) => new File([text], name);

describe('readDrop', () => {
  it('uses File System Access handles when every item has one', async () => {
    const h = { kind: 'file', name: 'a.dbml' } as FileSystemHandle;
    const r = await readDrop(transfer([file('a.dbml', 'x')], () => h));
    expect(r).toEqual({ kind: 'handles', handles: [h] });
  });

  for (const missing of [null, undefined, 'reject'] as const) {
    it(`falls back to the File bytes when a handle is ${String(missing)}`, async () => {
      // Chromium resolves undefined for Files a page put into the DataTransfer (not on disk).
      const r = await readDrop(transfer([file('a.dbml', 'Table a {}')], () => missing));
      expect(r.kind).toBe('files');
      if (r.kind !== 'files') return;
      expect(r.files.map((f) => f.path)).toEqual(['a.dbml']);
      expect(new TextDecoder().decode(await r.files[0]!.read())).toBe('Table a {}');
    });
  }
});
