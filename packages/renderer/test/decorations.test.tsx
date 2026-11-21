// @vitest-environment jsdom
import { compileDbml } from '@relvista/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { renderDiagramSvgString } from '../src/export/svgString.js';
import { gridLayout } from '../src/geometry.js';
import { DiagramSvg } from '../src/svg/DiagramSvg.js';
import {
  TONE_COLOR,
  dimmedByDecorations,
  type DecorationTone,
  type Decorations,
} from '../src/svg/decorations.js';
import { PALETTES } from '../src/theme.js';

const { model } = compileDbml(`
Table users {
  id integer [pk]
  email varchar
  name varchar
}
Table orders {
  id integer [pk]
  user_id integer [ref: > users.id]
}
Table items {
  id integer [pk]
  order_id integer [ref: > orders.id]
}
TableGroup shop {
  orders
  items
}
Note n { 'hello' }
`);
if (!model) throw new Error('no model');
const geometry = gridLayout(model);
const refUsers = model.refs.find(
  (r) => r.from.tableId === 'public.users' || r.to.tableId === 'public.users',
)!;
const refItems = model.refs.find((r) => r.id !== refUsers.id)!;

function draw(decorations: Decorations, colorMode: 'light' | 'dark' = 'light'): Document {
  const markup = renderToStaticMarkup(
    <DiagramSvg
      model={model!}
      geometry={geometry}
      decorations={decorations}
      colorMode={colorMode}
    />,
  );
  expect(markup).not.toMatch(/NaN|undefined|Infinity/);
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
}

const sel = (doc: Document, attr: string, v: string) =>
  Array.from(doc.querySelectorAll(`[${attr}]`)).find((e) => e.getAttribute(attr) === v) ?? null;

const TONES: DecorationTone[] = ['match', 'path', 'added', 'removed', 'changed'];

describe.each(['light', 'dark'] as const)('decorations (%s)', (mode) => {
  it.each(TONES)('tone %s on tables, notes, groups, columns and refs', (tone) => {
    const color = PALETTES[mode][TONE_COLOR[tone]];
    const doc = draw(
      {
        nodes: { 'public.users': tone, 'note:n': tone, 'group:shop': tone },
        columns: { 'public.orders': { user_id: tone } },
        refs: { [refUsers.id]: tone },
      },
      mode,
    );
    for (const [attr, id] of [
      ['data-rv-table', 'public.users'],
      ['data-rv-note', 'note:n'],
      ['data-rv-group', 'group:shop'],
      ['data-rv-ref', refUsers.id],
    ] as const) {
      const g = sel(doc, attr, id)!;
      expect(g, id).not.toBeNull();
      expect(g.getAttribute('data-rv-tone'), id).toBe(tone);
      expect(g.outerHTML, id).toContain(color);
    }
    const users = sel(doc, 'data-rv-table', 'public.users')!;
    const ring = users.querySelector('.rv-tone-ring')!;
    expect(ring.getAttribute('stroke-width')).toBe('2');
    expect(ring.getAttribute('stroke-dasharray')).toBe(tone === 'removed' ? '6 4' : null);
    expect(users.getAttribute('opacity')).toBe(tone === 'removed' ? '0.6' : null);
    expect(users.querySelector('[data-rv-strike="name"]') !== null).toBe(tone === 'removed');
    expect(users.querySelector('.rv-tone-tint')).not.toBeNull();

    const row = sel(doc, 'data-rv-table', 'public.orders')!.querySelector(
      '[data-rv-column="user_id"]',
    )!;
    expect(row.getAttribute('data-rv-tone')).toBe(tone);
    expect(row.querySelector('.rv-tone-tint')!.getAttribute('style')).toContain(color);
    expect(row.querySelector('[data-rv-strike="row"]') !== null).toBe(tone === 'removed');
    // Undecorated rows stay plain.
    const other = sel(doc, 'data-rv-table', 'public.orders')!.querySelector(
      '[data-rv-column="id"]',
    )!;
    expect(other.getAttribute('data-rv-tone')).toBeNull();

    const ref = sel(doc, 'data-rv-ref', refUsers.id)!;
    const path = ref.querySelector('path')!;
    expect(path.getAttribute('stroke-width')).toBe('2');
    expect(path.getAttribute('style')).toContain(color);
    expect(path.getAttribute('stroke-dasharray')).toBe(tone === 'removed' ? '6 4' : null);
    // Markers follow the tone colour.
    expect(ref.querySelector('[data-rv-marker]')!.getAttribute('style')).toContain(color);
  });

  it('strikes through removed column rows', () => {
    const doc = draw({ columns: { 'public.users': { email: 'removed', name: 'changed' } } }, mode);
    const users = sel(doc, 'data-rv-table', 'public.users')!;
    expect(users.querySelectorAll('[data-rv-strike="row"]')).toHaveLength(1);
    expect(users.querySelector('[data-rv-column="email"] [data-rv-strike="row"]')).not.toBeNull();
    const changed = users.querySelector('[data-rv-column="name"]')!;
    expect(changed.getAttribute('data-rv-tone')).toBe('changed');
    expect(changed.querySelector('.rv-tone-tint')!.getAttribute('style')).toContain(
      PALETTES[mode].diffChanged,
    );
    // Column tones alone do not ring the table.
    expect(users.querySelector('.rv-tone-ring')).toBeNull();
  });
});

describe('dimOthers and badges', () => {
  it('dims every undecorated node and ref', () => {
    const doc = draw({
      nodes: { 'public.users': 'match' },
      refs: { [refUsers.id]: 'path' },
      dimOthers: true,
    });
    expect(sel(doc, 'data-rv-table', 'public.users')!.getAttribute('opacity')).toBeNull();
    expect(sel(doc, 'data-rv-table', 'public.orders')!.getAttribute('opacity')).toBe('0.28');
    expect(sel(doc, 'data-rv-table', 'public.items')!.getAttribute('opacity')).toBe('0.28');
    expect(sel(doc, 'data-rv-note', 'note:n')!.getAttribute('opacity')).toBe('0.28');
    expect(sel(doc, 'data-rv-ref', refUsers.id)!.getAttribute('opacity')).toBeNull();
    expect(sel(doc, 'data-rv-ref', refItems.id)!.getAttribute('opacity')).toBe('0.28');
  });

  it('does not dim without dimOthers; column tones and badges count as decorated', () => {
    const doc = draw({ nodes: { 'public.users': 'match' } });
    expect(sel(doc, 'data-rv-table', 'public.orders')!.getAttribute('opacity')).toBeNull();
    const d: Decorations = {
      columns: { 'public.orders': { id: 'added' } },
      badges: { 'public.items': '+1' },
      dimOthers: true,
    };
    expect(dimmedByDecorations(d, 'public.orders')).toBe(false);
    expect(dimmedByDecorations(d, 'public.items')).toBe(false);
    expect(dimmedByDecorations(d, 'public.users')).toBe(true);
  });

  it('draws a header badge', () => {
    const doc = draw({
      nodes: { 'public.users': 'changed' },
      badges: { 'public.users': '~3', 'note:n': '+1' },
    });
    const badge = sel(doc, 'data-rv-table', 'public.users')!.querySelector('[data-rv-node-badge]')!;
    expect(badge.getAttribute('data-rv-node-badge')).toBe('~3');
    expect(badge.textContent).toBe('~3');
    expect(badge.outerHTML).toContain(PALETTES.light.diffChanged);
    expect(
      sel(doc, 'data-rv-note', 'note:n')!.querySelector('[data-rv-node-badge="+1"]'),
    ).not.toBeNull();
  });

  it('ignores unknown tones', () => {
    const doc = draw({ nodes: { 'public.users': 'bogus' as DecorationTone } });
    expect(sel(doc, 'data-rv-table', 'public.users')!.getAttribute('data-rv-tone')).toBeNull();
  });
});

describe('export', () => {
  it('draws decorations into the standalone SVG string', () => {
    const svg = renderDiagramSvgString(model, geometry, {
      colorMode: 'dark',
      decorations: {
        nodes: { 'public.users': 'added' },
        columns: { 'public.orders': { user_id: 'removed' } },
        refs: { [refUsers.id]: 'changed' },
        badges: { 'public.users': '+3' },
      },
    });
    expect(svg).not.toContain('var(--');
    expect(svg).toContain('data-rv-tone="added"');
    expect(svg).toContain('data-rv-tone="removed"');
    expect(svg).toContain('data-rv-tone="changed"');
    expect(svg).toContain('data-rv-strike="row"');
    expect(svg).toContain('data-rv-node-badge="+3"');
    expect(svg).toContain(PALETTES.dark.diffAdded);
    expect(svg).toContain('--rv-diff-added: #4ade80;');
    const plain = renderDiagramSvgString(model, geometry, { colorMode: 'dark' });
    expect(plain).not.toContain('data-rv-tone');
  });
});
