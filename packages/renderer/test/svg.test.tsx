// @vitest-environment jsdom
import {
  compileDbml,
  measureTable,
  selectView,
  visibleColumns,
  type DetailLevel,
  type DiagramGeometry,
  type DiagramModel,
} from '@relvista/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { gridLayout, layoutSync } from '../src/geometry.js';
import { DiagramSvg } from '../src/svg/DiagramSvg.js';
import { chooseSides, routeAll, rowCenterOffset } from '../src/svg/routing.js';
import { loadExamples } from './examples.js';

function byAttr(root: ParentNode, attr: string, value: string): Element | null {
  return (
    Array.from(root.querySelectorAll(`[${attr}]`)).find((e) => e.getAttribute(attr) === value) ??
    null
  );
}

function parse(markup: string): Document {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
}

function check(model: DiagramModel, geometry: DiagramGeometry, detailLevel: DetailLevel = 'all') {
  const markup = renderToStaticMarkup(
    <DiagramSvg model={model} geometry={geometry} detailLevel={detailLevel} />,
  );
  expect(markup).not.toMatch(/NaN|undefined|Infinity/);
  const doc = parse(markup);
  const text = doc.documentElement.textContent ?? '';

  for (const t of model.tables) {
    const g = byAttr(doc, 'data-rv-table', t.id);
    expect(g, t.id).not.toBeNull();
    expect(text).toContain(t.name);
    const cols = Array.from(g!.querySelectorAll('[data-rv-column]')).map((e) =>
      e.getAttribute('data-rv-column'),
    );
    expect(cols).toEqual(visibleColumns(t, detailLevel).map((c) => c.name));
    // Full column names are in the row tooltips even when the visible label is truncated.
    for (const c of visibleColumns(t, detailLevel)) expect(text).toContain(c.name);
  }
  for (const n of model.stickyNotes) {
    expect(byAttr(doc, 'data-rv-note', n.id), n.id).not.toBeNull();
  }
  for (const g of model.groups) {
    if (geometry.groups[g.id]) expect(text).toContain(g.name);
  }
  const drawnRefs = model.refs.filter(
    (r) => geometry.nodes[r.from.tableId] && geometry.nodes[r.to.tableId],
  );
  expect(doc.querySelectorAll('[data-rv-ref]')).toHaveLength(drawnRefs.length);
  expect(doc.querySelectorAll('[data-rv-marker]')).toHaveLength(drawnRefs.length * 2);
  const many = drawnRefs.reduce(
    (n, r) => n + (r.from.cardinality === 'many' ? 1 : 0) + (r.to.cardinality === 'many' ? 1 : 0),
    0,
  );
  expect(doc.querySelectorAll('[data-rv-marker="many"]')).toHaveLength(many);
  const optional = drawnRefs.reduce(
    (n, r) => n + (r.from.optional ? 1 : 0) + (r.to.optional ? 1 : 0),
    0,
  );
  expect(doc.querySelectorAll('[data-rv-optional="true"]')).toHaveLength(optional);
  const inactive = drawnRefs.filter((r) => r.inactive).length;
  expect(doc.querySelectorAll('.rv-ref > path[stroke-dasharray]')).toHaveLength(inactive);
  return doc;
}

describe.each(loadExamples())('DiagramSvg: %s', (_name, input) => {
  const { model } = compileDbml(input);
  if (!model) throw new Error('example does not compile');

  it('renders every table, column and ref (core sync layout)', () => {
    check(model, layoutSync(model));
  });

  it('renders with the local grid layout', () => {
    check(model, gridLayout(model));
  });

  it.each(['keys', 'names'] as const)('detail level %s', (level) => {
    check(model, layoutSync(model, { detailLevel: level }), level);
  });

  it('renders every DiagramView', () => {
    for (const v of model.views) {
      const m = selectView(model, v.name);
      if (m) check(m, layoutSync(m));
    }
  });
});

describe('DiagramSvg details', () => {
  const { model } = compileDbml(`
Table users [headercolor: #F4D03F] {
  id integer [pk, note: 'identity']
  email varchar [not null, unique]
  Note: 'people'
}
Table orders {
  id integer [pk]
  user_id integer [ref: > users.id]
}
Ref: orders.id - users.id [color: #ff0000]
TableGroup g [color: #3498DB] { users }
Note n { 'hello world' }
`);
  if (!model) throw new Error('no model');
  const geometry = gridLayout(model);

  it('uses the header colour with a readable text colour', () => {
    const doc = parse(renderToStaticMarkup(<DiagramSvg model={model} geometry={geometry} />));
    const users = doc.querySelector('[data-rv-table="public.users"]')!;
    expect(users.querySelector('path')!.getAttribute('style')).toContain('#F4D03F');
    expect(users.querySelector('.rv-table-name')!.getAttribute('style')).toContain('#1b2230');
    expect(users.querySelector('[data-rv-key="pk"]')).not.toBeNull();
    expect(doc.querySelector('[data-rv-table="public.orders"] [data-rv-key="fk"]')).not.toBeNull();
    expect(users.querySelector('[data-rv-badge="not null"]')).not.toBeNull();
    expect(users.querySelector('[data-rv-badge="unique"]')).not.toBeNull();
    expect(users.querySelector('[data-rv-badge="note"]')).not.toBeNull();
  });

  it('colours refs and dims everything unrelated to the highlight', () => {
    const doc = parse(
      renderToStaticMarkup(
        <DiagramSvg model={model} geometry={geometry} highlight={['public.orders']} />,
      ),
    );
    const refs = Array.from(doc.querySelectorAll('[data-rv-ref]'));
    expect(refs.every((r) => r.getAttribute('data-rv-state') === 'highlight')).toBe(true);
    const colored = model.refs.find((r) => r.color)!;
    expect(
      byAttr(doc, 'data-rv-ref', colored.id)!.querySelector('path')!.getAttribute('style'),
    ).toContain('#ff0000');
    expect(doc.querySelector('[data-rv-note="note:n"]')!.getAttribute('opacity')).toBe('0.28');
  });

  it('uses var(--rv-*) with fallbacks of the chosen mode', () => {
    const light = renderToStaticMarkup(<DiagramSvg model={model} geometry={geometry} />);
    const dark = renderToStaticMarkup(
      <DiagramSvg model={model} geometry={geometry} colorMode="dark" />,
    );
    expect(light).toContain('var(--rv-canvas-bg, #f6f7f9)');
    expect(dark).toContain('var(--rv-canvas-bg, #0f1217)');
    expect(dark).toContain('data-rv-color-mode="dark"');
  });

  it('attaches refs to the exact column rows on facing sides', () => {
    const geo: DiagramGeometry = {
      ...geometry,
      nodes: {
        ...geometry.nodes,
        'public.users': { ...geometry.nodes['public.users']!, x: 0, y: 0 },
        'public.orders': { ...geometry.nodes['public.orders']!, x: 600, y: 100 },
      },
      edges: {},
    };
    const routes = routeAll({ model, geometry: geo, detailLevel: 'all', edgeStyle: 'orthogonal' });
    const ref = model.refs.find(
      (r) => r.from.columns[0] === 'user_id' || r.to.columns[0] === 'user_id',
    )!;
    const route = routes.get(ref.id)!;
    const usersEnd = ref.from.tableId === 'public.users' ? route.from : route.to;
    const ordersEnd = ref.from.tableId === 'public.users' ? route.to : route.from;
    const users = geo.nodes['public.users']!;
    expect(usersEnd.x).toBe(users.width);
    expect(usersEnd.y).toBe(rowCenterOffset(0));
    expect(usersEnd.side).toBe('right');
    expect(ordersEnd.x).toBe(600);
    expect(ordersEnd.y).toBe(100 + rowCenterOffset(1));
    expect(ordersEnd.angle).toBe(180);
  });

  it('chooses sides', () => {
    const a = { x: 0, y: 0, width: 100, height: 100 };
    expect(chooseSides(a, { ...a, x: 300 }, false)).toEqual(['right', 'left']);
    expect(chooseSides({ ...a, x: 300 }, a, false)).toEqual(['left', 'right']);
    expect(chooseSides(a, { ...a, y: 300 }, false)[0]).toBe(
      chooseSides(a, { ...a, y: 300 }, false)[1],
    );
    expect(chooseSides(a, a, true)).toEqual(['right', 'right']);
  });

  it('draws tables at the measured size', () => {
    const t = model.tables[0]!;
    const m = measureTable(t);
    expect(geometry.nodes[t.id]).toMatchObject(m);
  });
});
