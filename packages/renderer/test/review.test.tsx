// @vitest-environment jsdom
// Review round 1 regressions: marker ends on ELK routes, collapsed nodes, self-ref loops, badge
// room, hostile names, and viewer chrome (empty views, Esc layering, errors, export names).
import {
  METRICS,
  compileDbml,
  layoutDiagram,
  layoutDiagramSync,
  measureTable,
  type DiagramModel,
  type LayoutOptions,
} from '@relvista/core';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderDiagramSvgString } from '../src/export/svgString.js';
import { printDocument } from '../src/export/print.js';
import { DiagramSvg } from '../src/svg/DiagramSvg.js';
import { SELF_LOOP, routeAll } from '../src/svg/routing.js';
import { DbmlViewer, exportBaseName, sortDiagnostics } from '../src/viewer/DbmlViewer.js';

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', RO);
  if (!('DOMMatrixReadOnly' in globalThis)) {
    class M {
      m22 = 1;
      constructor(_t?: string) {}
    }
    vi.stubGlobal('DOMMatrixReadOnly', M);
  }
});

afterEach(() => cleanup());

function compile(src: string): DiagramModel {
  const { model, diagnostics } = compileDbml(src);
  if (!model) throw new Error(diagnostics.map((d) => d.message).join('\n'));
  return model;
}

function parse(markup: string): Document {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
  return doc;
}

/** x of a marker's translate(). */
function markerX(el: Element): number {
  return Number(/translate\(([-\d.]+)/.exec(el.getAttribute('transform') ?? '')![1]);
}

const BLOG = `
Table users {
  id int [pk]
  name varchar
}
Table posts {
  id int [pk]
  title varchar
  user_id int
}
Ref: posts.user_id > users.id
`;

describe('cardinality markers on ELK routes', () => {
  it('puts the crow’s foot on the FK table for a `>` ref', async () => {
    const m = compile(BLOG);
    const g = await layoutDiagram(m);
    expect(Object.keys(g.edges)).toHaveLength(1);
    const doc = parse(renderToStaticMarkup(<DiagramSvg model={m} geometry={g} />));
    const many = doc.querySelector('[data-rv-marker="many"]')!;
    const one = doc.querySelector('[data-rv-marker="one"]')!;
    const posts = g.nodes['public.posts']!;
    const users = g.nodes['public.users']!;
    const onEdge = (x: number, b: typeof posts) =>
      Math.min(Math.abs(x - b.x), Math.abs(x - b.x - b.width)) < 1;
    expect(onEdge(markerX(many), posts)).toBe(true);
    expect(onEdge(markerX(one), users)).toBe(true);
  });

  it('agrees with the self-routed (sync) layout for inline and `<` refs', async () => {
    const src = `
Table users {
  id int [pk]
}
Table posts {
  id int [pk]
  user_id int [ref: > users.id]
}
Table tags {
  id int [pk]
  post_id int
}
Ref: posts.id < tags.post_id
`;
    const m = compile(src);
    const elk = await layoutDiagram(m);
    const routes = routeAll({
      model: m,
      geometry: elk,
      detailLevel: 'all',
      edgeStyle: 'orthogonal',
    });
    for (const ref of m.refs) {
      const r = routes.get(ref.id)!;
      const from = elk.nodes[ref.from.tableId]!;
      const to = elk.nodes[ref.to.tableId]!;
      expect(r.from.y).toBeGreaterThanOrEqual(from.y);
      expect(r.from.y).toBeLessThanOrEqual(from.y + from.height);
      expect(r.to.y).toBeGreaterThanOrEqual(to.y);
      expect(r.to.y).toBeLessThanOrEqual(to.y + to.height);
      // The many side is the FK side.
      const fk = ref.fkSide === 'from' ? ref.from : ref.to;
      expect(fk.cardinality).toBe('many');
    }
  });

  it('accepts routes stored in the reverse order (older geometry)', async () => {
    const m = compile(BLOG);
    const g = await layoutDiagram(m);
    const ref = m.refs[0]!;
    const reversed = {
      ...g,
      edges: { [ref.id]: { id: ref.id, points: [...g.edges[ref.id]!.points].reverse() } },
    };
    const a = routeAll({ model: m, geometry: g, detailLevel: 'all', edgeStyle: 'orthogonal' });
    const b = routeAll({
      model: m,
      geometry: reversed,
      detailLevel: 'all',
      edgeStyle: 'orthogonal',
    });
    expect(b.get(ref.id)!.from).toEqual(a.get(ref.id)!.from);
    expect(b.get(ref.id)!.to).toEqual(a.get(ref.id)!.to);
  });
});

describe('self refs', () => {
  it('loop on the left with room for both markers', async () => {
    const m = compile(`
Table categories {
  id int [pk]
  parent_id int [ref: > categories.id]
  name varchar
}
Table products {
  id int [pk]
  category_id int [ref: > categories.id]
}
`);
    const g = await layoutDiagram(m);
    const routes = routeAll({ model: m, geometry: g, detailLevel: 'all', edgeStyle: 'orthogonal' });
    const self = m.refs.find((r) => r.from.tableId === r.to.tableId)!;
    const other = m.refs.find((r) => r !== self)!;
    const box = g.nodes['public.categories']!;
    const r = routes.get(self.id)!;
    expect(r.from.side).toBe('left');
    expect(r.to.side).toBe('left');
    expect(Math.min(...r.points.map((p) => p.x))).toBeLessThanOrEqual(box.x - SELF_LOOP);
    // The other ref leaves categories.id on the right: the markers do not share a port.
    expect(other.from.tableId).toBe('public.categories');
    expect(routes.get(other.id)!.from.side).toBe('right');
    // The loop is inside the diagram bounds.
    expect(g.bounds.x).toBeLessThanOrEqual(box.x - SELF_LOOP);
  });
});

describe('collapsed nodes', () => {
  it('are drawn header-only, refs attached to the header', () => {
    const m = compile(BLOG);
    // A collapsed node without a saved position (still auto-placed).
    const saved = {
      nodes: { 'public.users': { collapsed: true } },
    } as unknown as LayoutOptions['saved'];
    const g = layoutDiagramSync(m, { saved });
    const doc = parse(renderToStaticMarkup(<DiagramSvg model={m} geometry={g} />));
    const users = Array.from(doc.querySelectorAll('[data-rv-table]')).find(
      (e) => e.getAttribute('data-rv-table') === 'public.users',
    )!;
    expect(users.querySelectorAll('.rv-column')).toHaveLength(0);
    const r = routeAll({ model: m, geometry: g, detailLevel: 'all', edgeStyle: 'orthogonal' }).get(
      m.refs[0]!.id,
    )!;
    expect(r.to.row).toBe(-1);
    expect(r.to.y).toBe(g.nodes['public.users']!.y + METRICS.headerHeight / 2);
  });
});

describe('table text fits', () => {
  it('draws every badge and the full type when the table has its measured width', () => {
    const m = compile(`
Table tickets {
  id int [pk]
  status ticket_status [not null, unique, note: 'state']
  channel "support.channel" [not null, note: 'where']
}
`);
    const t = m.tables[0]!;
    const g = layoutDiagramSync(m);
    expect(g.nodes[t.id]!.width).toBe(measureTable(t).width);
    const doc = parse(renderToStaticMarkup(<DiagramSvg model={m} geometry={g} />));
    expect(doc.querySelectorAll('[data-rv-badge="note"]')).toHaveLength(2);
    expect(doc.querySelectorAll('[data-rv-badge="not null"]')).toHaveLength(2);
    expect(doc.querySelectorAll('[data-rv-badge="unique"]')).toHaveLength(1);
    expect(doc.documentElement.textContent).not.toContain('…');
  });
});

describe('hostile names are escaped', () => {
  it('in the SVG export and the print document', () => {
    const m = compile(`
Table "<script>alert(1)</script>" {
  id int [pk, note: '</svg><script>alert(2)</script>']
}
TableGroup "<g onload=alert(3)>" {
  "<script>alert(1)</script>"
}
Note n1 {
  '<img src=x onerror=alert(4)>'
}
`);
    const g = layoutDiagramSync(m);
    const svg = renderDiagramSvgString(m, g, { title: '<img src=x onerror=alert(5)>' });
    const doc = parse(svg);
    expect(doc.getElementsByTagName('script')).toHaveLength(0);
    expect(doc.getElementsByTagName('img')).toHaveLength(0);
    for (const el of Array.from(doc.getElementsByTagName('*')))
      for (const a of Array.from(el.attributes)) expect(a.name.startsWith('on')).toBe(false);

    const html = printDocument(m, g, { title: '<img src=x onerror=alert(6)>' });
    const page = new DOMParser().parseFromString(html, 'text/html');
    expect(page.getElementsByTagName('script')).toHaveLength(0);
    expect(page.getElementsByTagName('img')).toHaveLength(0);
  });
});

describe('viewer helpers (review)', () => {
  it('strips .dbml from export names', () => {
    expect(exportBaseName('02-ecommerce.dbml')).toBe('02-ecommerce');
    expect(exportBaseName('schema.dbml.layout.json')).toBe('schema');
    expect(exportBaseName('Blog')).toBe('Blog');
  });

  it('sorts diagnostics by position', () => {
    const d = (line: number, column: number) =>
      ({
        severity: 'error',
        message: '',
        file: 'main.dbml',
        start: { line, column, offset: 0 },
        end: { line, column, offset: 0 },
      }) as unknown as Parameters<typeof sortDiagnostics>[0][number];
    const out = sortDiagnostics([d(7, 19), d(9, 13), d(7, 25)]);
    expect(out.map((x) => `${x.start.line}:${x.start.column}`)).toEqual(['7:19', '7:25', '9:13']);
  });
});

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

const VIEWS = `
Table users {
  id integer [pk]
}
DiagramView empty_view { Tables { } }
DiagramView only_users { Tables { users } }
`;

describe('DbmlViewer (review)', () => {
  it('says so when a view has no tables', async () => {
    const { container } = render(<DbmlViewer source={VIEWS} view="empty_view" />);
    await flush();
    expect(container.querySelector('.rv-empty')?.textContent).toMatch(/empty_view.*no tables/);
  });

  it('falls back to all tables (and says why) for an unknown view', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(<DbmlViewer source={VIEWS} view="typo" />);
    await flush();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown view "typo"'));
    expect((screen.getByLabelText('Diagram view') as HTMLSelectElement).value).toBe('*');
    warn.mockRestore();
  });

  it('lists errors in source order', async () => {
    render(<DbmlViewer source={'Table a {\n  id int [pk\n}\nTable b {\n  x int [nope\n}\n'} />);
    await flush();
    const labels = Array.from(screen.getByRole('alert').querySelectorAll('li code')).map((c) =>
      c.textContent!.split(':').map(Number),
    );
    for (let i = 1; i < labels.length; i++) {
      const [l0, c0] = labels[i - 1]!;
      const [l1, c1] = labels[i]!;
      expect(l1! > l0! || (l1 === l0 && c1! >= c0!)).toBe(true);
    }
  });

  it('Esc closes the export menu before the fullscreen overlay', async () => {
    const { container } = render(<DbmlViewer source={VIEWS} toolbar={['export', 'fullscreen']} />);
    await flush();
    fireEvent.click(screen.getByLabelText('Fullscreen'));
    await flush();
    expect(container.querySelector('.rv-viewer--overlay')).not.toBeNull();
    fireEvent.click(screen.getByLabelText('Export'));
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Download SVG');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement?.textContent).toBe('Download PNG');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await flush();
    expect(screen.queryByRole('menu')).toBeNull();
    expect(container.querySelector('.rv-viewer--overlay')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    await flush();
    expect(container.querySelector('.rv-viewer--overlay')).toBeNull();
  });

  it('hides the editor link for multi-file sources and the React Flow attribution', async () => {
    const { container } = render(
      <DbmlViewer
        source={{ files: { 'main.dbml': 'Table a {\n  id int\n}' }, entry: 'main.dbml' }}
        editorUrl="https://example.org/editor/"
      />,
    );
    await flush();
    expect(screen.queryByLabelText('Open in editor')).toBeNull();
    expect(container.querySelector('.react-flow__attribution')).toBeNull();
  });
});
