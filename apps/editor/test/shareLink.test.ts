import { emptyLayout, type Layout } from '@relvista/core';
import {
  createEditorLink,
  decodeShareHash,
  encodeShareHash,
  parseDiagramTarget,
} from '@relvista/renderer';
import { positionSuffix } from '../src/state/navigation.js';
import { describe, expect, it } from 'vitest';
import {
  LONG_LINK_CHARS,
  MAX_LINK_CHARS,
  buildShareLink,
  multiFileNote,
  readShareHash,
  sharePayload,
  shareSize,
  sharedName,
} from '../src/share/shareLink.js';
import { exampleFiles } from './helpers.js';

const layout = (): Layout => {
  const l = emptyLayout();
  l.views['*']!.nodes['public.users'] = { x: 10, y: 20, pinned: true };
  return l;
};

describe('share payload', () => {
  it('includes layout and view only when asked and meaningful', () => {
    expect(
      sharePayload({
        dbml: 'x',
        layout: layout(),
        view: 'v',
        includeLayout: true,
        includeView: true,
      }),
    ).toEqual({
      dbml: 'x',
      layout: layout(),
      view: 'v',
    });
    expect(
      sharePayload({
        dbml: 'x',
        layout: layout(),
        view: '*',
        includeLayout: false,
        includeView: true,
      }),
    ).toEqual({ dbml: 'x' });
    expect(
      sharePayload({ dbml: 'x', layout: null, view: 'v', includeLayout: true, includeView: false }),
    ).toEqual({ dbml: 'x' });
  });
});

describe('readShareHash', () => {
  it('round trips every example with layout and view', async () => {
    for (const ex of exampleFiles()) {
      const link = await buildShareLink(
        { dbml: ex.text, layout: layout(), view: 'Core', includeLayout: true, includeView: true },
        'https://example.org/relvista/editor/',
      );
      expect(link.startsWith('https://example.org/relvista/editor/#dbml=')).toBe(true);
      const r = await readShareHash(new URL(link).hash);
      expect(r.kind).toBe('share');
      if (r.kind !== 'share') return;
      expect(r.dbml).toBe(ex.text);
      expect(r.layout).toEqual(layout());
      expect(r.view).toBe('Core');
      expect(r.legacy).toBe(false);
    }
  });
  it('refuses links that inflate past the file size limit', async () => {
    const big = 'Table t { id int }\n'.repeat(400_000); // ~7.6 MB of text in a short link
    const link = await buildShareLink(
      { dbml: big, layout: null, view: '*', includeLayout: false, includeView: false },
      'https://example.org/e/',
    );
    expect(link.length).toBeLessThan(100_000);
    expect(await readShareHash(new URL(link).hash)).toEqual({
      kind: 'too-large',
      maxBytes: 5 * 1024 * 1024,
    });
  });
  it('reads phase-1 links (plain encodeURIComponent)', async () => {
    const r = await readShareHash(`#dbml=${encodeURIComponent('Table a {\n  id int\n}')}`);
    expect(r).toMatchObject({
      kind: 'share',
      dbml: 'Table a {\n  id int\n}',
      legacy: true,
      view: '*',
      layout: null,
    });
  });
  it('a link built by the renderer opens', async () => {
    const link = await createEditorLink('https://x.org/editor/#old', {
      dbml: 'Table b {}',
      view: null,
    });
    const r = await readShareHash(new URL(link).hash);
    expect(r).toMatchObject({ kind: 'share', dbml: 'Table b {}', view: '*' });
  });
  it('a damaged layout is dropped with a reason', async () => {
    const good = await encodeShareHash({ dbml: 'Table c {}' });
    const r = await readShareHash(`#${good}&layout=not-valid`);
    expect(r.kind).toBe('share');
    if (r.kind === 'share') {
      expect(r.layout).toBeNull();
      expect(r.layoutError).toBeTruthy();
    }
  });
  it('no dbml key → none; malformed legacy text → damaged', async () => {
    expect(await readShareHash('')).toEqual({ kind: 'none' });
    expect(await readShareHash('#view=x')).toEqual({ kind: 'none' });
    const r = await readShareHash('#dbml=%E0%A4%A');
    expect(['damaged', 'share']).toContain(r.kind);
  });
});

describe('size thresholds and notes', () => {
  it('ok / long / too large', () => {
    expect(shareSize('x'.repeat(100)).level).toBe('ok');
    expect(shareSize('x'.repeat(LONG_LINK_CHARS + 1)).level).toBe('long');
    expect(shareSize('x'.repeat(MAX_LINK_CHARS + 1)).level).toBe('too-large');
    expect(shareSize('x'.repeat(1200)).label).toBe('1.2 KB link');
  });
  it('multi-file note', () => {
    expect(multiFileNote(1, 'main.dbml')).toBeNull();
    expect(multiFileNote(3, 'main.dbml')).toMatch(/main\.dbml only; the other 2 files/);
    expect(multiFileNote(2, 'main.dbml')).toMatch(/other 1 file of/);
  });
  it('shared name', () => {
    expect(sharedName('Shop')).toBe('Shop.dbml');
    expect(sharedName('a/b')).toBe('a-b.dbml');
    expect(sharedName(null)).toBe('shared.dbml');
  });
});

describe('share link with "Include position"', () => {
  it('appends table and viewport keys that the share decoder ignores and the editor reads', async () => {
    const { compileDbml } = await import('@relvista/core');
    const dbml = 'Table users {\n  id int\n}\nTable orders {\n  id int\n}\n';
    const model = compileDbml(dbml).model!;
    const base = await buildShareLink(
      { dbml, layout: layout(), view: 'v', includeLayout: true, includeView: true },
      'https://x.test/relvista/editor/',
    );
    const suffix = positionSuffix(
      {
        table: 'public.orders',
        focus: { id: 'public.orders', hops: 2 },
        viewport: { x: -10, y: 20.5, zoom: 0.5 },
      },
      model,
    );
    expect(suffix).toBe('&table=orders&hops=2&vp=-10,20.5,0.5');
    const link = base + suffix;
    const hash = new URL(link).hash;
    // Phase-2 decoding is unchanged by the extra keys.
    const decoded = await decodeShareHash(hash);
    expect(decoded?.dbml).toBe(dbml);
    expect(decoded?.view).toBe('v');
    expect((await readShareHash(hash)).kind).toBe('share');
    // The deep-link codec reads view (from the payload's own key), table, hops and vp.
    expect(parseDiagramTarget(hash)).toEqual({
      view: 'v',
      table: 'orders',
      hops: 2,
      viewport: { x: -10, y: 20.5, zoom: 0.5 },
    });
  });
});
