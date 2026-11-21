import { compileDbml, formatDiff } from '@relvista/core';
import { describe, expect, it } from 'vitest';
import { withGitRef } from '../src/files/remote.js';
import {
  CompareError,
  canCompareGitRef,
  changeRows,
  compareSides,
  compareSourceUrl,
  compileOther,
  computeCompare,
  documentRef,
  mergedForView,
  refLabel,
  resolveCompareSource,
  summaryLine,
} from '../src/state/compare.js';

const enc = new TextEncoder();
const BEFORE = 'Table users {\n  id int [pk]\n  email varchar\n}\nTable gone {\n  id int\n}\n';
const AFTER =
  'Table users {\n  id int [pk]\n  email text\n}\nTable orders {\n  id int\n  user_id int [ref: > users.id]\n}\n';

function fakeFetch(files: Record<string, string>) {
  const asked: string[] = [];
  const f = (url: string) => {
    asked.push(url);
    const body = files[url];
    return Promise.resolve(
      body === undefined
        ? new Response('no', { status: 404 })
        : new Response(enc.encode(body), { status: 200 }),
    );
  };
  return { f, asked };
}

describe('compare sources', () => {
  it('paste: text as is (LF), empty refused', async () => {
    expect(
      await resolveCompareSource({ kind: 'paste', text: 'Table a {\r\n id int\r\n}' }),
    ).toEqual({ kind: 'paste', label: 'Pasted text', text: 'Table a {\n id int\n}' });
    await expect(resolveCompareSource({ kind: 'paste', text: '  \n' })).rejects.toThrow(
      CompareError,
    );
  });
  it('file: UTF-8 with or without BOM; other encodings refused', async () => {
    const bom = new Uint8Array([0xef, 0xbb, 0xbf, ...enc.encode('Table a {}\n')]);
    expect(await resolveCompareSource({ kind: 'file', name: 'old.dbml', bytes: bom })).toEqual({
      kind: 'file',
      label: 'old.dbml',
      text: 'Table a {}\n',
    });
    await expect(
      resolveCompareSource({ kind: 'file', name: 'x.dbml', bytes: new Uint8Array([0xff, 0xfe]) }),
    ).rejects.toThrow(/UTF-8/);
  });
  it('URL: GitHub blob and tree URLs are fetched raw; https only', async () => {
    const raw = 'https://raw.githubusercontent.com/o/r/main/db/schema.dbml';
    const { f, asked } = fakeFetch({ [raw]: BEFORE });
    for (const kind of ['blob', 'tree']) {
      const other = await resolveCompareSource(
        { kind: 'url', url: `https://github.com/o/r/${kind}/main/db/schema.dbml` },
        { fetch: f },
      );
      expect(other).toMatchObject({ kind: 'url', label: 'schema.dbml', url: raw, text: BEFORE });
    }
    expect(asked).toEqual([raw, raw]);
    expect(() => compareSourceUrl({ kind: 'url', url: 'http://example.com/a.dbml' })).toThrow(
      CompareError,
    );
    await expect(
      resolveCompareSource(
        { kind: 'url', url: 'https://x.test/missing.dbml' },
        { fetch: fakeFetch({}).f },
      ),
    ).rejects.toThrow(/404/);
  });
  it('Git ref: the ref segment of the document URL is rewritten', async () => {
    const doc = 'https://raw.githubusercontent.com/o/r/main/db/schema.dbml';
    const old = 'https://raw.githubusercontent.com/o/r/v1.0/db/schema.dbml';
    const { f, asked } = fakeFetch({ [old]: BEFORE });
    const other = await resolveCompareSource(
      { kind: 'git', docUrl: doc, ref: ' v1.0 ' },
      { fetch: f },
    );
    expect(other).toMatchObject({ kind: 'git', label: 'v1.0: schema.dbml', url: old });
    expect(asked).toEqual([old]);
    expect(canCompareGitRef(doc)).toBe(true);
    expect(documentRef(doc)).toBe('main');
    expect(canCompareGitRef('https://example.com/schema.dbml')).toBe(false);
    expect(canCompareGitRef(null)).toBe(false);
    expect(() =>
      compareSourceUrl({ kind: 'git', docUrl: 'https://example.com/a.dbml', ref: 'main' }),
    ).toThrow(CompareError);
  });
  it('Git ref rewrite: branches with slashes, commits, refs/heads URLs; unsafe refs refused', () => {
    const doc = 'https://github.com/o/r/blob/main/a%20b/s.dbml';
    expect(withGitRef(doc, 'feature/x')).toBe(
      'https://raw.githubusercontent.com/o/r/feature/x/a%20b/s.dbml',
    );
    expect(withGitRef(doc, '0123abc')).toBe(
      'https://raw.githubusercontent.com/o/r/0123abc/a%20b/s.dbml',
    );
    expect(withGitRef('https://raw.githubusercontent.com/o/r/refs/heads/dev/s.dbml', 'main')).toBe(
      'https://raw.githubusercontent.com/o/r/main/s.dbml',
    );
    for (const bad of ['', ' ', '../x', 'a b', 'x?y', '/x', 'x/', 'a//b'])
      expect(() => withGitRef(doc, bad)).toThrow();
  });
});

describe('compare sides and diff', () => {
  const before = compileDbml(BEFORE).model!;
  const after = compileDbml(AFTER).model!;
  it('other = before, current = after by default; swap flips them', () => {
    expect(compareSides('current', 'other', false)).toEqual({
      before: 'other',
      after: 'current',
      beforeIsOther: true,
    });
    expect(compareSides('current', 'other', true)).toEqual({
      before: 'current',
      after: 'other',
      beforeIsOther: false,
    });
    const normal = computeCompare(after, before, false).diff;
    const swapped = computeCompare(after, before, true).diff;
    expect(normal.summary).toEqual({ added: 2, removed: 1, changed: 1 });
    expect(swapped.summary).toEqual({ added: 1, removed: 2, changed: 1 });
  });
  it('panel rows and summary match formatDiff', () => {
    const { diff, merged } = computeCompare(after, before, false);
    expect(summaryLine(diff)).toBe(formatDiff(diff).split('\n')[0]);
    const rows = changeRows(diff);
    const count = (s: string) => rows.filter((r) => r.status === s).length;
    expect([count('added'), count('removed'), count('changed')]).toEqual([2, 1, 1]);
    expect(rows.find((r) => r.group === 'tables' && r.status === 'changed')).toMatchObject({
      target: 'public.users',
      label: 'users',
      detail: '1 column',
    });
    expect(rows.find((r) => r.group === 'refs')?.label).toBe('users.id < orders.user_id');
    // The merged model draws both versions.
    expect(merged.tables.map((t) => t.id).sort()).toEqual([
      'public.gone',
      'public.orders',
      'public.users',
    ]);
    expect(mergedForView(merged, '*')).toBe(merged);
  });
  it('the same schema has no changes', () => {
    const { diff } = computeCompare(before, before, false);
    expect(diff.empty).toBe(true);
    expect(summaryLine(diff)).toBe('No changes');
    expect(changeRows(diff)).toEqual([]);
  });
  it('an other version with errors is reported with its first error', () => {
    const r = compileOther('Table {');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/^The other schema has errors \(line 1/);
    expect(compileOther(BEFORE).ok).toBe(true);
    expect(refLabel('not a ref id')).toBe('not a ref id');
  });
});
