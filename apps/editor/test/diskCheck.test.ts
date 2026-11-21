import { describe, expect, it } from 'vitest';
import {
  changedOnDisk,
  readIfGranted,
  refreshFromDisk,
  sameBytes,
  type ReadableHandle,
} from '../src/files/diskCheck.js';

const enc = (t: string) => new TextEncoder().encode(t);

function handle(
  text: string | null,
  permission: PermissionState = 'granted',
): ReadableHandle & { reads: number } {
  const h = {
    reads: 0,
    async getFile() {
      h.reads++;
      if (text === null) throw new DOMException('not found', 'NotFoundError');
      const bytes = enc(text);
      return { arrayBuffer: async () => bytes.buffer as ArrayBuffer };
    },
    async queryPermission() {
      return permission;
    },
  };
  return h;
}

describe('sameBytes', () => {
  it('compares length and content', () => {
    expect(sameBytes(enc('ab'), enc('ab'))).toBe(true);
    expect(sameBytes(enc('ab'), enc('abc'))).toBe(false);
    expect(sameBytes(enc('ab'), enc('ac'))).toBe(false);
  });
});

describe('readIfGranted', () => {
  it('reads only with read access already granted (never prompts)', async () => {
    expect(await readIfGranted(handle('x'))).toEqual(enc('x'));
    const asked = handle('x', 'prompt');
    expect(await readIfGranted(asked)).toBeNull();
    expect(asked.reads).toBe(0);
    expect(await readIfGranted(handle(null))).toBeNull();
  });
});

describe('changedOnDisk', () => {
  it('returns the new bytes only when they differ', async () => {
    expect(await changedOnDisk(handle('same'), enc('same'))).toBeNull();
    expect(await changedOnDisk(handle('new'), enc('old'))).toEqual(enc('new'));
    // Gone from disk: nothing to protect, Save recreates it.
    expect(await changedOnDisk(handle(null), enc('old'))).toBeNull();
  });
});

describe('refreshFromDisk', () => {
  const file = (key: string, disk: string, now: string | null, dirty: boolean) => ({
    key,
    disk: { bytes: enc(disk), text: disk },
    handle: handle(now),
    dirty,
  });

  it('reloads clean files that changed, reports edited ones as conflicts', async () => {
    const r = await refreshFromDisk([
      file('a.dbml', 'Table a {}', 'Table a {}', false),
      file('b.dbml', 'Table b {}', 'Table b2 {}', false),
      file('c.dbml', 'Table c {}', 'Table c2 {}', true),
      file('d.dbml', 'Table d {}', null, false),
      { key: 'untitled.dbml', disk: null, handle: null, dirty: true },
    ]);
    expect([...r.reloaded.keys()]).toEqual(['b.dbml']);
    expect(new TextDecoder().decode(r.reloaded.get('b.dbml'))).toBe('Table b2 {}');
    expect(r.conflicts).toEqual(['c.dbml']);
  });

  it('leaves files alone without read permission', async () => {
    const r = await refreshFromDisk([
      {
        key: 'a.dbml',
        disk: { bytes: enc('x'), text: 'x' },
        handle: handle('y', 'prompt'),
        dirty: false,
      },
    ]);
    expect(r.reloaded.size).toBe(0);
    expect(r.conflicts).toEqual([]);
  });
});
