import { describe, expect, it } from 'vitest';
import { decodeShareHash, encodeShareHash } from '../src/share/codec.js';
import {
  formatAnchoredTarget,
  formatDiagramTarget,
  parseAnchoredTarget,
  parseDiagramTarget,
  type DiagramTarget,
} from '../src/share/deepLink.js';

const FULL: DiagramTarget = {
  view: 'billing',
  table: 'public.users',
  hops: 2,
  detail: 'keys',
  viewport: { x: -120.5, y: 40, zoom: 1.25 },
  search: 'email address',
  path: ['users', 'invoices'],
};

describe('formatDiagramTarget / parseDiagramTarget', () => {
  it('writes keys in the grammar order', () => {
    expect(formatDiagramTarget(FULL)).toBe(
      'view=billing&table=public.users&hops=2&detail=keys&vp=-120.5,40,1.25&q=email%20address&path=users~invoices',
    );
    // Property order of the input does not matter.
    const shuffled: DiagramTarget = {
      path: FULL.path!,
      search: FULL.search!,
      viewport: FULL.viewport!,
      detail: FULL.detail!,
      hops: FULL.hops!,
      table: FULL.table!,
      view: FULL.view!,
    };
    expect(formatDiagramTarget(shuffled)).toBe(formatDiagramTarget(FULL));
  });

  it('round-trips every key, alone and together', () => {
    expect(parseDiagramTarget(formatDiagramTarget(FULL))).toEqual(FULL);
    const singles: DiagramTarget[] = [
      { view: 'v' },
      { table: 't' },
      { table: 't', hops: 0 },
      { detail: 'names' },
      { detail: 'all' },
      { viewport: { x: 0, y: 0, zoom: 0.05 } },
      { viewport: { x: 1e6, y: -3.25, zoom: 4 } },
      { search: 'a&b=c#d+e%f' },
      { path: ['a~b', 'c&d'] },
    ];
    for (const t of singles) expect(parseDiagramTarget(formatDiagramTarget(t))).toEqual(t);
  });

  it('formats an empty target as an empty string', () => {
    expect(formatDiagramTarget({})).toBe('');
    expect(parseDiagramTarget('')).toEqual({});
    expect(parseDiagramTarget('#')).toEqual({});
  });

  it('accepts #, ? or a bare body', () => {
    for (const prefix of ['#', '?', ''])
      expect(parseDiagramTarget(`${prefix}table=users&hops=1`)).toEqual({
        table: 'users',
        hops: 1,
      });
  });

  it('rounds viewport numbers to 2 decimals and leaves out the default view', () => {
    expect(formatDiagramTarget({ viewport: { x: 1.23456, y: -0.004, zoom: 1.005 } })).toBe(
      'vp=1.23,0,1',
    );
    expect(formatDiagramTarget({ view: '*' })).toBe('');
    expect(parseDiagramTarget('view=*')).toEqual({});
    expect(parseDiagramTarget('vp=1.234,2.5,0.5')).toEqual({
      viewport: { x: 1.23, y: 2.5, zoom: 0.5 },
    });
  });

  it('drops invalid values, never throws', () => {
    const garbage = [
      'hops=3', // hops without table
      'table=&hops=1',
      'table=t&hops=6',
      'table=t&hops=-1',
      'table=t&hops=1.5',
      'table=t&hops=two',
      'detail=full',
      'vp=1,2',
      'vp=1,2,3,4',
      'vp=a,b,c',
      'vp=1,2,0.01',
      'vp=1,2,5',
      'vp=1e3,2,1',
      'vp=Infinity,0,1',
      'vp=,,',
      'q=',
      'q=%20%20',
      'path=a',
      'path=a~',
      'path=~b',
      'path=a~b~c',
      'view=',
      'view=%E0%A4%A',
      'table=%',
      'q=%ZZ',
    ];
    for (const hash of garbage) {
      const t = parseDiagramTarget(hash);
      expect({ hash, t }).toEqual({ hash, t: hash.startsWith('table=t&') ? { table: 't' } : {} });
    }
    expect(() => parseDiagramTarget(undefined as unknown as string)).not.toThrow();
    // Invalid values are left out when formatting too.
    expect(
      formatDiagramTarget({
        hops: 3,
        detail: 'x' as never,
        viewport: { x: NaN, y: 0, zoom: 1 },
        search: ' ',
        path: ['a', ''],
        table: '',
      }),
    ).toBe('');
    expect(formatDiagramTarget({ table: 't', hops: 9 })).toBe('table=t');
    expect(formatDiagramTarget({ viewport: { x: 0, y: 0, zoom: 10 } })).toBe('');
  });

  it('keeps the first occurrence of a repeated key, like URLSearchParams.get', () => {
    expect(parseDiagramTarget('table=a&table=b')).toEqual({ table: 'a' });
    expect(new URLSearchParams('table=a&table=b').get('table')).toBe('a');
  });

  it('decodes + as a space (URLSearchParams syntax) and %7E inside path parts', () => {
    expect(parseDiagramTarget('q=order+items')).toEqual({ search: 'order items' });
    expect(parseDiagramTarget('path=a%7Eb~c')).toEqual({ path: ['a~b', 'c'] });
    expect(formatDiagramTarget({ search: 'a+b' })).toBe('q=a%2Bb');
  });

  it('reads unicode view and table names', () => {
    const t: DiagramTarget = { view: 'Facturación 請求', table: 'ユーザー', path: ['ü', '😀'] };
    const text = formatDiagramTarget(t);
    expect(text).toMatch(/^[\x21-\x7e]+$/);
    expect(parseDiagramTarget(text)).toEqual(t);
    expect(new URLSearchParams(text).get('view')).toBe('Facturación 請求');
  });
});

describe('coexistence with share keys', () => {
  it('ignores dbml= and layout=, and the share codec ignores target keys', async () => {
    const share = await encodeShareHash({ dbml: 'Table a { id int }', view: 'billing' });
    const hash = `#${share}&${formatDiagramTarget({ table: 'a', hops: 1 })}`;
    expect(parseDiagramTarget(hash)).toEqual({ view: 'billing', table: 'a', hops: 1 });
    const decoded = await decodeShareHash(hash);
    expect(decoded?.dbml).toBe('Table a { id int }');
    expect(decoded?.view).toBe('billing');
  });

  it('reads a target after a layout payload with base64url characters', () => {
    expect(parseDiagramTarget('dbml=abc-_&layout=x_y-z&table=users&detail=names')).toEqual({
      table: 'users',
      detail: 'names',
    });
  });
});

describe('anchored targets', () => {
  it('parses an anchor without params', () => {
    expect(parseAnchoredTarget('#erd-billing')).toEqual({ anchor: 'erd-billing', target: {} });
    expect(parseAnchoredTarget('erd-billing')).toEqual({ anchor: 'erd-billing', target: {} });
  });

  it('parses an anchor with params', () => {
    expect(parseAnchoredTarget('#erd&table=users&hops=1&vp=10,20,2')).toEqual({
      anchor: 'erd',
      target: { table: 'users', hops: 1, viewport: { x: 10, y: 20, zoom: 2 } },
    });
  });

  it('returns null when the hash names no anchor', () => {
    expect(parseAnchoredTarget('')).toBeNull();
    expect(parseAnchoredTarget('#')).toBeNull();
    expect(parseAnchoredTarget('#table=users')).toBeNull();
    expect(parseAnchoredTarget('#&table=users')).toBeNull();
    expect(parseAnchoredTarget('#%E0%A4%A')).toBeNull();
  });

  it('round-trips, with unicode anchors', () => {
    expect(formatAnchoredTarget('erd', {})).toBe('erd');
    expect(formatAnchoredTarget('erd', { table: 'users' })).toBe('erd&table=users');
    for (const anchor of ['erd', 'diagramme-façade', '図-1', 'a&b=c']) {
      for (const target of [{}, FULL, { view: 'ビュー' }] as DiagramTarget[]) {
        const text = formatAnchoredTarget(anchor, target);
        expect(parseAnchoredTarget(`#${text}`)).toEqual({ anchor, target });
      }
    }
  });

  it('parseDiagramTarget skips the anchor segment', () => {
    expect(parseDiagramTarget('#erd&view=billing')).toEqual({ view: 'billing' });
  });
});
