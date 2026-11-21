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
import { mergeRefs, mergedMarkers } from '../src/svg/collapsed.js';
import { renderDiagramSvgString } from '../src/export/svgString.js';
import { DiagramSvg } from '../src/svg/DiagramSvg.js';
import { NOTE_FADE, NoteSvg, noteLines } from '../src/svg/NoteSvg.js';
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

  // The sync layout of 14-large takes ~1-2 s, more on a busy CI runner.
  it('renders every table, column and ref (core sync layout)', { timeout: 30_000 }, () => {
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
    // users.id is shared by several refs: their ends fan out inside the row.
    expect(Math.abs(usersEnd.y - rowCenterOffset(0))).toBeLessThan(13);
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
    expect(chooseSides(a, a, true)).toEqual(['left', 'left']);
  });

  it('draws tables at the measured size', () => {
    const t = model.tables[0]!;
    const m = measureTable(t);
    expect(geometry.nodes[t.id]).toMatchObject(m);
  });
});

/** `geometry` with group `groupId` collapsed as core lays it out (§3.1): members gone, box flagged. */
function collapse(
  model: DiagramModel,
  geometry: DiagramGeometry,
  groupId: string,
): DiagramGeometry {
  const g = model.groups.find((x) => x.id === groupId)!;
  const nodes = { ...geometry.nodes };
  for (const t of g.tableIds) delete nodes[t];
  const box = geometry.groups[groupId]!;
  return {
    ...geometry,
    nodes,
    groups: {
      ...geometry.groups,
      [groupId]: { id: groupId, x: box.x, y: box.y, width: 200, height: 62, collapsed: true },
    },
  };
}

describe('collapsed groups', () => {
  const { model } = compileDbml(`
Table accounts {
  id integer [pk]
}
Table invoices {
  id integer [pk]
  account_id integer [ref: > accounts.id]
}
Table payments {
  id integer [pk]
  account_id integer
  invoice_id integer [ref: > invoices.id]
}
Ref: payments.account_id - accounts.id
TableGroup billing [color: #3498DB] {
  invoices
  payments
}
`);
  if (!model) throw new Error('no model');
  const expanded = gridLayout(model);
  const geometry = collapse(model, expanded, 'group:billing');
  // Routes as the router will give them (wave 1: today's router has none for absent members).
  const routes = routeAll({
    model,
    geometry: expanded,
    detailLevel: 'all',
    edgeStyle: 'orthogonal',
  });

  it('draws the collapsed group as a card instead of a box', () => {
    const markup = renderToStaticMarkup(
      <DiagramSvg model={model} geometry={geometry} routes={routes} />,
    );
    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
    const doc = parse(markup);
    const cards = doc.querySelectorAll('[data-rv-group="group:billing"]');
    expect(cards).toHaveLength(1);
    const card = cards[0]!;
    expect(card.getAttribute('data-rv-collapsed')).toBe('true');
    expect(card.querySelector('.rv-table-name')!.textContent).toBe('billing');
    expect(card.querySelector('[data-rv-count]')!.textContent).toBe('2 tables');
    expect(card.querySelector('[data-rv-icon="stack"]')).not.toBeNull();
    expect(card.querySelector('path')!.getAttribute('style')).toContain('#3498DB');
    const title = card.querySelector('title')!.textContent!;
    expect(title).toContain('invoices');
    expect(title).toContain('payments');
    // Members are not drawn, the expanded box is not drawn.
    expect(byAttr(doc, 'data-rv-table', 'public.invoices')).toBeNull();
    expect(doc.querySelector('.rv-groups [data-rv-group]')).toBeNull();
    // Cards draw over refs.
    const order = Array.from(doc.querySelectorAll('.rv-refs, .rv-collapsed-groups')).map((e) =>
      e.getAttribute('class'),
    );
    expect(order).toEqual(['rv-refs', 'rv-collapsed-groups']);
  });

  it('merges refs between the same display nodes into one line labelled ×N', () => {
    const lines = mergeRefs(model, geometry);
    // invoices→payments is inside the card: dropped. Both refs to accounts: one line.
    expect(lines).toHaveLength(1);
    expect(lines[0]!.refs).toHaveLength(2);
    const doc = parse(
      renderToStaticMarkup(<DiagramSvg model={model} geometry={geometry} routes={routes} />),
    );
    const refs = doc.querySelectorAll('[data-rv-ref]');
    expect(refs).toHaveLength(1);
    const line = refs[0]!;
    expect(line.getAttribute('data-rv-merged')).toBe('2');
    expect(line.getAttribute('data-rv-refs')!.split(' ').sort()).toEqual(
      lines[0]!.refs.map((r) => r.id).sort(),
    );
    expect(line.querySelector('[data-rv-ref-count]')!.textContent).toBe('×2');
    const title = line.querySelector('title')!.textContent!;
    expect(title.split('\n')).toHaveLength(2);
    // accounts end: "one" for both refs → marker; billing end: many vs one → plain end.
    const markers = Array.from(line.querySelectorAll('[data-rv-marker]'));
    expect(markers.map((m) => m.getAttribute('data-rv-marker'))).toEqual(['one']);
    const { from, to } = mergedMarkers(lines[0]!, lines[0]!.refs[0]!);
    expect([from, to].filter(Boolean)).toHaveLength(1);
  });

  it('keeps both markers when every merged ref agrees', () => {
    const { model: m2 } = compileDbml(`
Table a { id integer [pk] }
Table b { id integer [pk]
  a_id integer [ref: > a.id] }
Table c { id integer [pk]
  a_id integer }
Ref: a.id < c.a_id
TableGroup g {
  b
  c
}
`);
    if (!m2) throw new Error('no model');
    const exp = gridLayout(m2);
    const geo = collapse(m2, exp, 'group:g');
    const r2 = routeAll({ model: m2, geometry: exp, detailLevel: 'all', edgeStyle: 'orthogonal' });
    const doc = parse(renderToStaticMarkup(<DiagramSvg model={m2} geometry={geo} routes={r2} />));
    const line = doc.querySelector('[data-rv-ref]')!;
    expect(line.getAttribute('data-rv-merged')).toBe('2');
    expect(
      Array.from(line.querySelectorAll('[data-rv-marker]'))
        .map((e) => e.getAttribute('data-rv-marker'))
        .sort(),
    ).toEqual(['many', 'one']);
  });

  it('highlighting the collapsed group lights all of its refs', () => {
    const doc = parse(
      renderToStaticMarkup(
        <DiagramSvg
          model={model}
          geometry={geometry}
          routes={routes}
          highlight={['group:billing']}
        />,
      ),
    );
    expect(doc.querySelector('[data-rv-ref]')!.getAttribute('data-rv-state')).toBe('highlight');
    expect(byAttr(doc, 'data-rv-group', 'group:billing')!.getAttribute('opacity')).toBeNull();
  });

  it('does not merge refs between plain tables', () => {
    const lines = mergeRefs(model, expanded);
    expect(lines).toHaveLength(model.refs.length);
  });
});

describe('notes', () => {
  const { model } = compileDbml(`Note n { '${'lorem ipsum dolor sit amet '.repeat(12).trim()}' }`);
  if (!model) throw new Error('no model');
  const note = model.stickyNotes[0]!;
  const draw = (width: number, height: number) =>
    parse(
      renderToStaticMarkup(
        <svg xmlns="http://www.w3.org/2000/svg">
          <NoteSvg note={note} box={{ x: 0, y: 0, width, height }} idPrefix="t" />
        </svg>,
      ),
    );

  it('wraps at the box width', () => {
    const narrow = draw(220, 1000).querySelectorAll('tspan').length;
    const wide = draw(440, 1000).querySelectorAll('tspan').length;
    expect(wide).toBeLessThan(narrow);
    expect(narrow).toBe(noteLines(note.content, 220).length);
  });

  it('clips text taller than the box and fades the bottom', () => {
    const tall = draw(220, 1000);
    expect(tall.querySelector('clipPath')).toBeNull();
    expect(tall.querySelector('[data-rv-clipped]')).toBeNull();
    const short = draw(220, 80);
    const g = short.querySelector('[data-rv-note]')!;
    expect(g.getAttribute('data-rv-clipped')).toBe('true');
    const clip = short.querySelector('clipPath')!;
    expect(clip.getAttribute('id')).toMatch(/^t-note-clip-/);
    expect(short.querySelector('text')!.getAttribute('clip-path')).toBe(
      `url(#${clip.getAttribute('id')})`,
    );
    const fade = short.querySelector('.rv-note-fade')!;
    expect(fade.getAttribute('height')).toBe(String(NOTE_FADE));
    expect(fade.getAttribute('style')).toContain('url(#t-note-fade-');
    // Lines below the box are not written; the full text stays in the tooltip.
    expect(short.querySelectorAll('tspan').length).toBeLessThan(
      tall.querySelectorAll('tspan').length,
    );
    expect(g.querySelector('title')!.textContent).toContain(note.content);
  });
});

describe('inactive refs', () => {
  const { model } = compileDbml(`
Table a { id integer [pk] }
Table b { id integer [pk]
  a_id integer
  a2 integer }
Ref: b.a_id > a.id
Ref: b.a2 > a.id [inactive]
`);
  if (!model) throw new Error('no model');

  it('are marked, drawn at 60% opacity and under active refs', () => {
    const doc = parse(
      renderToStaticMarkup(<DiagramSvg model={model} geometry={gridLayout(model)} />),
    );
    const refs = Array.from(doc.querySelectorAll('[data-rv-ref]'));
    expect(refs).toHaveLength(2);
    const inactive = model.refs.find((r) => r.inactive)!;
    // Model order is active first; drawing order puts the inactive one first (underneath).
    expect(model.refs[0]!.inactive).toBe(false);
    expect(refs[0]!.getAttribute('data-rv-ref')).toBe(inactive.id);
    expect(refs[0]!.getAttribute('data-rv-inactive')).toBe('true');
    expect(refs[0]!.getAttribute('opacity')).toBe('0.6');
    expect(refs[0]!.querySelector('path')!.getAttribute('stroke-dasharray')).toBe('5 4');
    expect(refs[1]!.getAttribute('data-rv-inactive')).toBeNull();
    expect(refs[1]!.getAttribute('opacity')).toBeNull();
  });
});

describe('router default (phase 3 wave 2)', () => {
  // a → c with b between them on one row: phase-2 routes ran straight under b.
  const m = compileDbml(`
Table a {
  id int [pk]
}
Table b {
  id int [pk]
}
Table c {
  id int [pk]
  a_id int [ref: > a.id]
}
`).model!;
  const g = gridLayout(m, {
    saved: {
      nodes: {
        'public.a': { x: 0, y: 0 },
        'public.b': { x: 400, y: 0 },
        'public.c': { x: 800, y: 0 },
      },
    },
  });
  const ctx = {
    model: m,
    geometry: g,
    detailLevel: 'all' as const,
    edgeStyle: 'orthogonal' as const,
  };

  it("routeAll and DiagramSvg go round tables by default ('tables')", () => {
    const id = m.refs[0]!.id;
    const byDefault = routeAll(ctx).get(id)!;
    expect(byDefault.path).toBe(routeAll({ ...ctx, avoid: 'tables' }).get(id)!.path);
    expect(byDefault.path).not.toBe(routeAll({ ...ctx, avoid: 'none' }).get(id)!.path);
    // No point of the route is inside b's box.
    const b = g.nodes['public.b']!;
    for (const p of byDefault.points)
      expect(p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height).toBe(false);
    const doc = parse(renderToStaticMarkup(<DiagramSvg model={m} geometry={g} />));
    const drawn = byAttr(doc, 'data-rv-ref', id)!.querySelector('path')!.getAttribute('d');
    expect(drawn).toBe(byDefault.path);
  });
});

describe('hostile text', () => {
  it('names, notes and the title stay text in renderDiagramSvgString', () => {
    const h = '</script><img src=x onerror=alert(1)><!--';
    const { model } = compileDbml(
      `Table "${h}" {\n  "${h}" int [pk, note: '${h}']\n  Note: '${h}'\n}\nNote n { '${h}' }\n`,
    );
    const svg = renderDiagramSvgString(model!, layoutSync(model!), { title: h });
    expect(svg).not.toMatch(/<img[\s>]/i);
    expect(svg).not.toContain('<!--');
    expect(svg).not.toContain('</script>');
    // Well-formed XML whose text holds the names verbatim.
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    expect(doc.documentElement.textContent).toContain(h);
  });
});
