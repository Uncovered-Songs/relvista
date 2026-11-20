// Auto-layout (layoutDiagram / layoutDiagramSync): every example lays out without overlaps, groups
// enclose their tables, output is finite and deterministic, saved positions are honoured.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  METRICS,
  compileDbml,
  layoutDiagram,
  layoutDiagramSync,
  selectView,
  type Box,
  type CompileInput,
  type DiagramGeometry,
  type DiagramModel,
  type LayoutOptions,
  type NodeLayout,
} from '../src/index.js';

const examplesDir = fileURLToPath(new URL('../../../examples/', import.meta.url));

function collectDbml(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (current: string) => {
    for (const name of readdirSync(current).sort()) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.dbml'))
        files[relative(dir, full).split(sep).join('/')] = readFileSync(full, 'utf8');
    }
  };
  walk(dir);
  return files;
}

function loadExamples(): [string, DiagramModel][] {
  const out: [string, DiagramModel][] = [];
  for (const name of readdirSync(examplesDir).sort()) {
    const full = join(examplesDir, name);
    let input: CompileInput;
    if (statSync(full).isDirectory()) input = { files: collectDbml(full), entry: 'main.dbml' };
    else if (name.endsWith('.dbml')) input = readFileSync(full, 'utf8');
    else continue;
    const { model } = compileDbml(input);
    if (!model) throw new Error(`${name} does not compile`);
    out.push([name, model]);
  }
  return out;
}

const examples = loadExamples();
const example = (name: string) => examples.find(([n]) => n === name)![1];

/** Strict interior overlap (touching edges is fine). */
function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

function expectFiniteBox(b: Box) {
  for (const v of [b.x, b.y, b.width, b.height]) expect(Number.isFinite(v)).toBe(true);
  expect(b.width).toBeGreaterThanOrEqual(0);
  expect(b.height).toBeGreaterThanOrEqual(0);
}

/** Every structural invariant of a geometry for `model`. */
function checkGeometry(
  model: DiagramModel,
  geo: DiagramGeometry,
  opts: { checkGroupClearance: boolean },
) {
  const tableIds = model.tables.map((t) => t.id);
  const noteIds = model.stickyNotes.map((n) => n.id);
  expect(Object.keys(geo.nodes)).toEqual([...tableIds, ...noteIds]);
  const nodes = Object.values(geo.nodes);
  for (const n of nodes) {
    expectFiniteBox(n);
    expect(n.width).toBeGreaterThan(0);
    expect(n.height).toBeGreaterThan(0);
    expect(contains(geo.bounds, n)).toBe(true);
  }
  expectFiniteBox(geo.bounds);

  for (let i = 0; i < nodes.length; i++)
    for (let j = i + 1; j < nodes.length; j++)
      expect(overlaps(nodes[i]!, nodes[j]!), `${nodes[i]!.id} overlaps ${nodes[j]!.id}`).toBe(
        false,
      );

  const groups = Object.values(geo.groups);
  for (const g of groups) {
    expectFiniteBox(g);
    expect(contains(geo.bounds, g)).toBe(true);
    const members = model.tables.filter((t) => t.groupId === g.id);
    expect(members.length).toBeGreaterThan(0);
    for (const t of members) {
      expect(contains(g, geo.nodes[t.id]!), `${t.id} inside ${g.id}`).toBe(true);
      const n = geo.nodes[t.id]!;
      expect(n.y - g.y).toBeGreaterThanOrEqual(METRICS.groupPadding + METRICS.groupHeaderHeight);
    }
    if (!opts.checkGroupClearance) continue;
    for (const n of nodes) {
      const member = model.tables.find((t) => t.id === n.id)?.groupId === g.id;
      if (!member) expect(overlaps(g, n), `${n.id} overlaps ${g.id}`).toBe(false);
    }
    for (const h of groups)
      if (h !== g) expect(overlaps(g, h), `${g.id} overlaps ${h.id}`).toBe(false);
  }
  // Groups with visible tables get a box; groups without do not.
  const withTables = model.groups.filter((g) => model.tables.some((t) => t.groupId === g.id));
  expect(Object.keys(geo.groups).sort()).toEqual(withTables.map((g) => g.id).sort());

  const refIds = new Set(model.refs.map((r) => r.id));
  for (const e of Object.values(geo.edges)) {
    expect(refIds.has(e.id)).toBe(true);
    expect(e.points.length).toBeGreaterThanOrEqual(2);
    for (const p of e.points) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(contains(geo.bounds, { ...p, width: 0, height: 0 })).toBe(true);
    }
  }
}

/** ELK routes start and end on a left/right border of the ref's tables, at a column row or header. */
function checkEdgeAttachments(model: DiagramModel, geo: DiagramGeometry) {
  const onBorder = (p: { x: number; y: number }, tableId: string) => {
    const n = geo.nodes[tableId]!;
    const onSide = Math.abs(p.x - n.x) < 0.5 || Math.abs(p.x - (n.x + n.width)) < 0.5;
    const rel = p.y - n.y;
    const atRow =
      Math.abs(rel - METRICS.headerHeight / 2) < 0.5 ||
      Math.abs(((rel - METRICS.headerHeight - METRICS.rowHeight / 2) / METRICS.rowHeight) % 1) <
        1e-6;
    return onSide && atRow && rel > 0 && rel < n.height;
  };
  for (const e of Object.values(geo.edges)) {
    const ref = model.refs.find((r) => r.id === e.id)!;
    const a = e.points[0]!;
    const b = e.points[e.points.length - 1]!;
    const ends = [ref.from.tableId, ref.to.tableId];
    expect(
      (onBorder(a, ends[0]!) && onBorder(b, ends[1]!)) ||
        (onBorder(a, ends[1]!) && onBorder(b, ends[0]!)),
      `route of ${e.id} attaches to its tables`,
    ).toBe(true);
    // Orthogonal routing: every segment is horizontal or vertical.
    for (let i = 1; i < e.points.length; i++) {
      const p = e.points[i - 1]!;
      const q = e.points[i]!;
      expect(Math.abs(p.x - q.x) < 0.5 || Math.abs(p.y - q.y) < 0.5).toBe(true);
    }
  }
}

describe.each(examples)('%s', (_name, model) => {
  it('ELK: no overlaps, groups enclose members, routes attach to column rows', async () => {
    const geo = await layoutDiagram(model);
    checkGeometry(model, geo, { checkGroupClearance: true });
    checkEdgeAttachments(model, geo);
    const refsInside = model.refs.filter(
      (r) =>
        model.tables.some((t) => t.id === r.from.tableId) &&
        model.tables.some((t) => t.id === r.to.tableId),
    );
    expect(Object.keys(geo.edges).length).toBe(new Set(refsInside.map((r) => r.id)).size);
  });

  it('ELK direction DOWN: no overlaps', async () => {
    const geo = await layoutDiagram(model, { direction: 'DOWN' });
    checkGeometry(model, geo, { checkGroupClearance: true });
    checkEdgeAttachments(model, geo);
  });

  it.each(['dagre', 'grid'] as const)('%s: no overlaps, groups enclose members', (engine) => {
    const geo = layoutDiagramSync(model, { engine });
    checkGeometry(model, geo, { checkGroupClearance: true });
    expect(geo.edges).toEqual({});
  });

  it('is deterministic (ELK and dagre)', async () => {
    const a = await layoutDiagram(model);
    const b = await layoutDiagram(structuredClone(model));
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(JSON.stringify(layoutDiagramSync(model))).toBe(
      JSON.stringify(layoutDiagramSync(structuredClone(model))),
    );
  });

  it('keeps saved positions and places the rest without overlapping them', async () => {
    const base = await layoutDiagram(model);
    const ids = Object.keys(base.nodes);
    // Save every other node, moved, and pin one of them.
    const saved: Record<string, NodeLayout> = {};
    ids.forEach((id, i) => {
      if (i % 2) return;
      const n = base.nodes[id]!;
      saved[id] = { x: n.x + 1000, y: n.y - 500, ...(i === 0 ? { pinned: true } : {}) };
    });
    for (const run of [
      (o: LayoutOptions) => layoutDiagram(model, o),
      async (o: LayoutOptions) => layoutDiagramSync(model, o),
      async (o: LayoutOptions) => layoutDiagramSync(model, { ...o, engine: 'grid' }),
    ]) {
      const geo = await run({ saved: { nodes: saved } });
      checkGeometry(model, geo, { checkGroupClearance: false });
      for (const [id, s] of Object.entries(saved)) {
        expect(geo.nodes[id]!.x).toBe(s.x);
        expect(geo.nodes[id]!.y).toBe(s.y);
      }
      // No route touches a fixed node (renderers route those themselves).
      for (const e of Object.values(geo.edges)) {
        const ref = model.refs.find((r) => r.id === e.id)!;
        expect(saved[ref.from.tableId] ?? saved[ref.to.tableId]).toBeUndefined();
      }
    }
  });
});

describe('layout options and edge cases', () => {
  it('lays out an empty model', async () => {
    const { model } = compileDbml('');
    expect(model).not.toBeNull();
    const empty = { nodes: {}, groups: {}, edges: {}, bounds: { x: 0, y: 0, width: 0, height: 0 } };
    expect(await layoutDiagram(model!)).toEqual(empty);
    expect(layoutDiagramSync(model!)).toEqual(empty);
    expect(layoutDiagramSync(model!, { engine: 'grid' })).toEqual(empty);
  });

  it('starts at the origin when nothing is saved', async () => {
    const geo = await layoutDiagram(example('02-ecommerce.dbml'));
    expect(geo.bounds.x).toBe(0);
    expect(geo.bounds.y).toBe(0);
  });

  it('skips refs to tables outside the model (view-filtered models)', async () => {
    const model = example('02-ecommerce.dbml');
    const filtered = { ...model, tables: model.tables.filter((t) => t.name !== 'users') };
    const geo = await layoutDiagram(filtered);
    checkGeometry(filtered, geo, { checkGroupClearance: true });
    for (const e of Object.values(geo.edges)) {
      const ref = filtered.refs.find((r) => r.id === e.id)!;
      expect([ref.from.tableId, ref.to.tableId]).not.toContain('public.users');
    }
    expect(layoutDiagramSync(filtered).nodes['public.users']).toBeUndefined();
  });

  it('routes self-references', async () => {
    const model = example('02-ecommerce.dbml');
    const self = model.refs.find((r) => r.from.tableId === r.to.tableId);
    expect(self).toBeDefined();
    const geo = await layoutDiagram(model);
    expect(geo.edges[self!.id]!.points.length).toBeGreaterThanOrEqual(2);
  });

  it('lays out every diagram view of 08-diagram-views', async () => {
    const model = example('08-diagram-views.dbml');
    for (const view of model.views) {
      const m = selectView(model, view.name)!;
      checkGeometry(m, await layoutDiagram(m), { checkGroupClearance: true });
      checkGeometry(m, layoutDiagramSync(m), { checkGroupClearance: true });
    }
  });

  it('respects detailLevel and saved size overrides / collapsed', async () => {
    const model = example('02-ecommerce.dbml');
    const names = await layoutDiagram(model, { detailLevel: 'names' });
    for (const n of Object.values(names.nodes))
      if (n.kind === 'table') expect(n.height).toBe(METRICS.headerHeight);
    checkEdgeAttachments(model, names);
    const keys = layoutDiagramSync(model, { detailLevel: 'keys' });
    const all = layoutDiagramSync(model);
    expect(keys.nodes['public.users']!.height).toBeLessThan(all.nodes['public.users']!.height);

    const geo = await layoutDiagram(model, {
      saved: { nodes: { 'public.users': { x: NaN, y: 0, w: 300, h: 500 } as NodeLayout } },
    });
    expect(geo.nodes['public.users']!.width).toBe(300);
    expect(geo.nodes['public.users']!.height).toBe(500);
    const collapsed = await layoutDiagram(model, {
      saved: { nodes: { 'public.orders': { collapsed: true } as NodeLayout } },
    });
    expect(collapsed.nodes['public.orders']!.height).toBe(METRICS.headerHeight);
  });

  it('uses options.measure for widths', () => {
    const model = example('01-minimal.dbml');
    const geo = layoutDiagramSync(model, { measure: () => 1000 });
    for (const n of Object.values(geo.nodes))
      if (n.kind === 'table') expect(n.width).toBe(METRICS.maxTableWidth);
  });

  it('packs disconnected tables into rows, not one long line', async () => {
    const model = example('04-indexes-and-checks.dbml');
    expect(model.refs.length).toBe(0);
    expect(model.tables.length).toBeGreaterThanOrEqual(4);
    for (const geo of [await layoutDiagram(model), layoutDiagramSync(model, { engine: 'grid' })]) {
      const sumWidth = Object.values(geo.nodes).reduce((s, n) => s + n.width, 0);
      expect(geo.bounds.width).toBeLessThan(sumWidth);
      const rows = new Set(Object.values(geo.nodes).map((n) => n.y));
      expect(rows.size).toBeGreaterThan(1);
    }
  });

  it('places new nodes beside a saved layout (incremental add)', async () => {
    const model = example('02-ecommerce.dbml');
    const base = await layoutDiagram(model);
    const saved: Record<string, NodeLayout> = {};
    for (const [id, n] of Object.entries(base.nodes))
      if (id !== 'public.tags') saved[id] = { x: n.x, y: n.y };
    const geo = await layoutDiagram(model, { saved: { nodes: saved } });
    const added = geo.nodes['public.tags']!;
    for (const [id, n] of Object.entries(geo.nodes)) {
      if (id === 'public.tags') continue;
      expect(n).toEqual(base.nodes[id]);
      expect(overlaps(n, added)).toBe(false);
    }
  });

  it('falls back to in-process ELK when workerUrl is set but Worker is unavailable', async () => {
    const model = example('02-ecommerce.dbml');
    expect(typeof (globalThis as { Worker?: unknown }).Worker).toBe('undefined');
    const geo = await layoutDiagram(model, { workerUrl: 'https://example.invalid/elk-worker.js' });
    expect(geo).toEqual(await layoutDiagram(model));
  });

  it('runs dagre and grid through layoutDiagram too', async () => {
    const model = example('05-table-groups.dbml');
    expect(await layoutDiagram(model, { engine: 'dagre' })).toEqual(layoutDiagramSync(model));
    expect(await layoutDiagram(model, { engine: 'grid' })).toEqual(
      layoutDiagramSync(model, { engine: 'grid' }),
    );
  });

  it('lays out 14-large (61 tables) with ELK in under 3 s', async () => {
    const model = example('14-large.dbml');
    expect(model.tables.length).toBeGreaterThanOrEqual(60);
    await layoutDiagram(example('01-minimal.dbml')); // load elkjs outside the measurement
    const t0 = performance.now();
    const geo = await layoutDiagram(model);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(3000);
    checkGeometry(model, geo, { checkGroupClearance: true });
  });
});
