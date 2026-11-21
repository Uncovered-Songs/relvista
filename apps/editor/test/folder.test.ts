import { describe, expect, it } from 'vitest';
import {
  chooseEntry,
  walkDirectoryHandle,
  walkFileList,
  type DirLike,
  type FileLike,
} from '../src/files/folder.js';
import { LimitError } from '../src/files/limits.js';

type Tree = { [name: string]: Tree | string };
function fake(name: string, tree: Tree): DirLike {
  return {
    kind: 'directory',
    name,
    async *values() {
      for (const [n, v] of Object.entries(tree)) {
        if (typeof v === 'string') {
          const bytes = new TextEncoder().encode(v);
          const f: FileLike = {
            kind: 'file',
            name: n,
            getFile: async () => ({
              size: bytes.length,
              arrayBuffer: async () => bytes.buffer as ArrayBuffer,
            }),
          };
          yield f;
        } else yield fake(n, v);
      }
    },
  };
}

describe('walkDirectoryHandle', () => {
  it('keeps DBML and sidecars, skips dot-folders and node_modules, limits depth', async () => {
    const files = await walkDirectoryHandle(
      fake('root', {
        'main.dbml': 'Table a {}',
        'main.dbml.layout.json': '{}',
        'README.md': 'x',
        '.git': { 'x.dbml': '' },
        node_modules: { 'y.dbml': '' },
        common: {
          'users.dbml': '',
          deep: { a: { b: { c: { 'too-deep.dbml': '' } }, 'ok.dbml': '' } },
        },
      }),
    );
    expect(files.map((f) => f.path).sort()).toEqual([
      'common/deep/a/ok.dbml',
      'common/users.dbml',
      'main.dbml',
      'main.dbml.layout.json',
    ]);
    expect(new TextDecoder().decode(await files.find((f) => f.path === 'main.dbml')!.read())).toBe(
      'Table a {}',
    );
  });
  it('limits the file count', async () => {
    const tree: Tree = {};
    for (let i = 0; i < 201; i++) tree[`t${i}.dbml`] = '';
    await expect(walkDirectoryHandle(fake('r', tree))).rejects.toThrow(LimitError);
  });
  it('limits total bytes', async () => {
    const big = 'x'.repeat(3 * 1024 * 1024);
    await expect(
      walkDirectoryHandle(
        fake('r', { 'a.dbml': big, 'b.dbml': big, 'c.dbml': big, 'd.dbml': big }),
      ),
    ).rejects.toThrow(LimitError);
  });
});

describe('walkFileList', () => {
  const file = (path: string) => ({
    name: path.split('/').pop()!,
    size: 1,
    webkitRelativePath: path,
    arrayBuffer: async () => new ArrayBuffer(1),
  });
  it('strips the top folder and applies skip rules', () => {
    const out = walkFileList([
      file('proj/main.dbml'),
      file('proj/.hidden/x.dbml'),
      file('proj/sub/a.dbml'),
      file('proj/notes.txt'),
    ]);
    expect(out.map((f) => f.path)).toEqual(['main.dbml', 'sub/a.dbml']);
  });
});

describe('chooseEntry', () => {
  it('main.dbml at the root wins', () =>
    expect(chooseEntry(['a.dbml', 'main.dbml', 'x/main.dbml'])).toBe('main.dbml'));
  it('the only root dbml', () =>
    expect(chooseEntry(['schema.dbml', 'sub/a.dbml'])).toBe('schema.dbml'));
  it('the only dbml anywhere', () =>
    expect(chooseEntry(['db/schema.dbml', 'db/schema.dbml.layout.json'])).toBe('db/schema.dbml'));
  it('ambiguous → ask', () => expect(chooseEntry(['a.dbml', 'b.dbml'])).toBeNull());
});
