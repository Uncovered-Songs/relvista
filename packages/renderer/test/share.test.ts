import { emptyLayout, parseLayout, serializeLayout, type Layout } from '@relvista/core';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EDITOR_URL,
  createEditorLink,
  decodeShareHash,
  deflateToBase64Url,
  encodeShareHash,
  inflateFromBase64Url,
  ShareTooLargeError,
} from '../src/share/index.js';
import { loadExamples } from './examples.js';

const singleFile = loadExamples().filter((e): e is [string, string] => typeof e[1] === 'string');

const LAYOUT: Layout = {
  ...emptyLayout(),
  views: {
    '*': { nodes: { 'public.users': { x: 10, y: 20, pinned: true } } },
    'only users': { nodes: { 'public.users': { x: 300 } } },
  },
  settings: { detailLevel: 'keys' },
};

/** Values of the hash, in order. */
function keys(hash: string): string[] {
  return [...new URLSearchParams(hash).keys()];
}

describe('share codec', () => {
  it('has the deployed editor as default URL', () => {
    expect(DEFAULT_EDITOR_URL).toBe('https://relvista.org/editor/');
  });

  it.each(singleFile)('round-trips example %s', async (_name, text) => {
    const hash = await encodeShareHash({ dbml: text });
    expect(hash).toMatch(/^dbml=[A-Za-z0-9_-]+$/);
    const out = await decodeShareHash(`#${hash}`);
    expect(out).toEqual({ dbml: text.replace(/^\uFEFF/, '') });
  });

  it('round-trips unicode, emoji, CRLF and lone CR text', async () => {
    for (const text of [
      'Table "üñí€" {\n  名前 varchar [note: \'😀 👩‍👩‍👧\']\n}\n',
      'Table a {\r\n  id int\r\n}\r\n',
      'Table a {\r  id int\r}',
      '',
    ]) {
      const b = await deflateToBase64Url(text);
      expect(b).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(await inflateFromBase64Url(b)).toBe(text);
    }
  });

  it('round-trips 1 MB of text and compresses it', async () => {
    const line = 'Table t_0000 {\n  id integer [pk]\n  name varchar\n}\n';
    let text = '';
    for (let i = 0; text.length < 1_000_000; i++) text += line.replace('0000', String(i));
    const hash = await encodeShareHash({ dbml: text });
    expect(hash.length).toBeLessThan(text.length / 4);
    expect((await decodeShareHash(hash))?.dbml).toBe(text);
  });

  it('drops a BOM', async () => {
    const out = await decodeShareHash(await encodeShareHash({ dbml: '\uFEFFTable a {}' }));
    expect(out?.dbml).toBe('Table a {}');
  });

  it('carries layout and view, keys in order', async () => {
    const hash = await encodeShareHash({
      dbml: 'Table users {}',
      layout: LAYOUT,
      view: 'only users',
    });
    expect(keys(hash)).toEqual(['dbml', 'layout', 'view']);
    expect(hash.endsWith('&view=only%20users')).toBe(true);
    const out = await decodeShareHash(hash);
    expect(out?.view).toBe('only users');
    expect(out?.layoutError).toBeUndefined();
    expect(serializeLayout(out!.layout!)).toBe(serializeLayout(LAYOUT));
    expect(parseLayout(out!.layout).ok).toBe(true);
  });

  it('omits the default view and an absent layout', async () => {
    for (const view of [null, undefined, '*']) {
      const hash = await encodeShareHash({ dbml: 'x', layout: null, view });
      expect(keys(hash)).toEqual(['dbml']);
      const out = await decodeShareHash(hash);
      expect(out && 'view' in out).toBe(false);
      expect(out && 'layout' in out).toBe(false);
    }
  });

  it('reads phase-1 links (encodeURIComponent text) as legacy', async () => {
    const text = 'Table users {\n  id integer [pk] // #1 & more + 50%\n}\n';
    const out = await decodeShareHash(`#dbml=${encodeURIComponent(text)}`);
    expect(out).toEqual({ dbml: text, legacy: true });
  });

  it('drops a garbage layout and says why', async () => {
    const dbml = await deflateToBase64Url('Table a {}');
    const bad = await decodeShareHash(`dbml=${dbml}&layout=!!notbase64`);
    expect(bad?.dbml).toBe('Table a {}');
    expect(bad?.layout).toBeUndefined();
    expect(bad?.layoutError).toMatch(/damaged/);
    const invalid = await decodeShareHash(
      `dbml=${dbml}&layout=${await deflateToBase64Url('{"version": 2}')}`,
    );
    expect(invalid?.layout).toBeUndefined();
    expect(invalid?.layoutError).toMatch(/invalid/);
    const notJson = await decodeShareHash(
      `dbml=${dbml}&layout=${await deflateToBase64Url('{ nope')}`,
    );
    expect(notJson?.layoutError).toMatch(/invalid JSON/);
  });

  it('returns null without a dbml key; ignores unknown keys', async () => {
    expect(await decodeShareHash('')).toBeNull();
    expect(await decodeShareHash('#layout=abc')).toBeNull();
    const out = await decodeShareHash(`#files=x&dbml=${await deflateToBase64Url('y')}`);
    expect(out).toEqual({ dbml: 'y' });
  });

  it('throws on bad input to inflate', async () => {
    await expect(inflateFromBase64Url('a+b/')).rejects.toThrow();
    await expect(inflateFromBase64Url('A')).rejects.toThrow();
    await expect(inflateFromBase64Url('AAAA')).rejects.toThrow();
  });

  it('refuses to inflate past the size cap (decompression bombs)', async () => {
    const big = 'Table a { id int }\n'.repeat(60_000); // ~1.1 MB, compresses to a few KB
    const b = await deflateToBase64Url(big);
    expect(b.length).toBeLessThan(20_000);
    await expect(inflateFromBase64Url(b, 100_000)).rejects.toBeInstanceOf(ShareTooLargeError);
    expect(await inflateFromBase64Url(b, 2_000_000)).toBe(big);
    await expect(decodeShareHash(`#dbml=${b}`, { maxBytes: 100_000 })).rejects.toBeInstanceOf(
      ShareTooLargeError,
    );
    // Legacy (uncompressed) text is measured too.
    await expect(
      decodeShareHash(`#dbml=${encodeURIComponent('Table é {}'.repeat(50))}`, { maxBytes: 100 }),
    ).rejects.toBeInstanceOf(ShareTooLargeError);
    // A too-large layout is dropped, not fatal.
    const out = await decodeShareHash(
      `#dbml=${await deflateToBase64Url('Table a {}')}&layout=${b}`,
      {
        maxBytes: 100_000,
      },
    );
    expect(out?.dbml).toBe('Table a {}');
    expect(out?.layoutError).toMatch(/too large/);
  });

  it('builds editor links that replace an existing hash', async () => {
    const link = await createEditorLink('https://x.dev/editor/?a=1#old&dbml=zzz', {
      dbml: 'Table a {}',
      view: 'v',
    });
    expect(link.startsWith('https://x.dev/editor/?a=1#dbml=')).toBe(true);
    expect(link.split('#')).toHaveLength(2);
    const out = await decodeShareHash(link.slice(link.indexOf('#')));
    expect(out).toEqual({ dbml: 'Table a {}', view: 'v' });
  });
});
