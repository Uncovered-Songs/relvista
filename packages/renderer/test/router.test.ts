// Obstacle-avoiding orthogonal router (docs/design/phase3-v1.md §4.1).
import {
  METRICS,
  compileDbml,
  layoutDiagram,
  layoutDiagramSync,
  type Box,
  type DiagramGeometry,
  type DiagramModel,
  type NodeLayout,
} from '@relvista/core';
import { describe, expect, it } from 'vitest';
import { loadExamples } from './examples.js';
import {
  ROUTER_MAX_NODES,
  SELF_LOOP,
  STUB,
  fanOffsets,
  routeAll,
  routeRef,
  rowCenterOffset,
  tableIndex,
  type Point,
  type RefRoute,
  type RouteContext,
  type RouteResult,
} from '../src/svg/routing.js';
import { MARGIN } from '../src/svg/router/obstacles.js';
import type { RawRoute } from '../src/svg/router/search.js';

function compile(src: Parameters<typeof compileDbml>[0]): DiagramModel {
  const r = compileDbml(src);
  if (!r.model) throw new Error(JSON.stringify(r.diagnostics));
  return r.model;
}

const examples = loadExamples().map(([name, input]) => [name, compile(input)] as const);
const large = examples.find(([name]) => name === '14-large.dbml')![1];

function ctxOf(
  model: DiagramModel,
  geometry: DiagramGeometry,
  extra: Partial<RouteContext> = {},
): RouteContext {
  return {
    model,
    geometry,
    detailLevel: 'all',
    edgeStyle: 'orthogonal',
    avoid: 'tables',
    ...extra,
  };
}

/** Searched route of a ref, from the cache internals. */
function rawOf(routes: RouteResult, id: string): RawRoute | undefined {
  const key = routes.cache.key as { final: Map<string, RawRoute> };
  return key.final.get(id);
}

/** Every position of `geometry` saved (as the editor does after its first 'place'). */
function savedOf(geometry: DiagramGeometry): { nodes: Record<string, NodeLayout> } {
  return {
    nodes: Object.fromEntries(
      Object.entries(geometry.nodes).map(([id, n]) => [id, { x: n.x, y: n.y }]),
    ),
  };
}

/** The axis-aligned segment a–b crosses the interior of `box` grown by `pad`. */
function crosses(a: Point, b: Point, box: Box, pad: number): boolean {
  const x0 = box.x - pad;
  const y0 = box.y - pad;
  const x1 = box.x + box.width + pad;
  const y1 = box.y + box.height + pad;
  return (
    Math.max(a.x, b.x) > x0 &&
    Math.min(a.x, b.x) < x1 &&
    Math.max(a.y, b.y) > y0 &&
    Math.min(a.y, b.y) < y1
  );
}

/** Tables (other than the ref's own ends) a route runs under. */
function tablesCrossed(route: RefRoute, geometry: DiagramGeometry): string[] {
  const out: string[] = [];
  for (const [id, n] of Object.entries(geometry.nodes)) {
    if (n.kind !== 'table' || id === route.fromNode || id === route.toNode) continue;
    for (let i = 1; i < route.points.length; i++) {
      if (crosses(route.points[i - 1]!, route.points[i]!, n, 2)) {
        out.push(id);
        break;
      }
    }
  }
  return out;
}

/** A stub end of the route lies inside the margin of a box other than the route's own ends. */
function stubBlocked(route: RefRoute, geometry: DiagramGeometry): boolean {
  const stubs = [route.from, route.to].map((e) => {
    const stub = route.fromNode === route.toNode ? SELF_LOOP : STUB;
    return { x: e.x + (e.side === 'right' ? stub : -stub), y: e.y };
  });
  return Object.entries(geometry.nodes).some(
    ([id, n]) =>
      id !== route.fromNode &&
      id !== route.toNode &&
      stubs.some(
        (p) =>
          p.x > n.x - MARGIN &&
          p.x < n.x + n.width + MARGIN &&
          p.y > n.y - MARGIN &&
          p.y < n.y + n.height + MARGIN,
      ),
  );
}

function expectOrthogonal(route: RefRoute) {
  for (let i = 1; i < route.points.length; i++) {
    const a = route.points[i - 1]!;
    const b = route.points[i]!;
    expect(Math.abs(a.x - b.x) < 1e-6 || Math.abs(a.y - b.y) < 1e-6, route.id).toBe(true);
  }
}

type Layouts = [string, DiagramGeometry][];

async function layoutsOf(model: DiagramModel): Promise<Layouts> {
  const elk = await layoutDiagram(model);
  const elkSaved = await layoutDiagram(model, { saved: savedOf(elk) });
  return [
    ['dagre', layoutDiagramSync(model)],
    ['grid', layoutDiagramSync(model, { engine: 'grid' })],
    ['elk, all positions saved', elkSaved],
  ];
}

describe('router: every example', () => {
  for (const [name, model] of examples) {
    it(`${name}: routes avoid unrelated tables and keep their ports`, async () => {
      for (const [layout, geometry] of await layoutsOf(model)) {
        const routes = routeAll(ctxOf(model, geometry));
        const tables = tableIndex(model);
        let blocked = 0;
        // Ends per port, to know each end's fan-out.
        const portCount = new Map<string, number>();
        const portKey = (node: string, row: number, side: string) => `${node}/${row}/${side}`;
        for (const r of routes.values()) {
          if (r.fromNode === r.toNode && r.from.row === r.to.row) continue;
          for (const [node, e] of [
            [r.fromNode!, r.from],
            [r.toNode!, r.to],
          ] as const) {
            const k = portKey(node, e.row, e.side);
            portCount.set(k, (portCount.get(k) ?? 0) + 1);
          }
        }
        for (const ref of model.refs) {
          const r = routes.get(ref.id);
          if (!r) continue;
          const label = `${name} ${layout} ${ref.id}`;
          expect(geometry.edges[ref.id], label).toBeUndefined();
          expectOrthogonal(r);
          // First / last points exactly on the side border, at the row centre (plus the fan).
          for (const [end, e] of [
            ['from', r.from],
            ['to', r.to],
          ] as const) {
            const node = geometry.nodes[ref[end].tableId]!;
            const p = end === 'from' ? r.points[0]! : r.points[r.points.length - 1]!;
            expect(p).toEqual({ x: e.x, y: e.y });
            expect(e.x, label).toBe(e.side === 'right' ? node.x + node.width : node.x);
            expect(tables.has(ref[end].tableId)).toBe(true);
            const centre = node.y + rowCenterOffset(e.row);
            const self = r.fromNode === r.toNode && r.from.row === r.to.row;
            const n = self ? 1 : portCount.get(portKey(ref[end].tableId, e.row, e.side))!;
            expect(fanOffsets(n), label).toContain(Math.round((e.y - centre) * 100) / 100);
          }
          const raw = rawOf(routes, ref.id);
          if (!raw) {
            // Only same-row self refs keep the phase-2 loop.
            expect(r.fromNode).toBe(r.toNode);
            expect(r.from.row).toBe(r.to.row);
            continue;
          }
          // The grid has a clean route unless a stub end lies inside another box's margin (a
          // table closer than the stub to the port: nothing can be clean then).
          if (!stubBlocked(r, geometry)) expect(raw.clean, label).toBe(true);
          // A clean route is drawn clean.
          if (raw.clean) expect(tablesCrossed(r, geometry), label).toEqual([]);
          else blocked++;
        }
        // Blocked stubs are rare (only the tight grid layout of 14-large has one).
        expect(blocked, `${name} ${layout}`).toBeLessThanOrEqual(1);
      }
    });
  }
});

describe('router: behaviour', () => {
  // a — c — b on one row: the phase-2 route runs straight under c.
  const ROW = `
Table a {
  id int [pk]
}
Table c {
  id int [pk]
}
Table b {
  id int [pk]
  a_id int
}
Ref: b.a_id > a.id
`;
  const rowModel = compile(ROW);
  const rowGeometry = (): DiagramGeometry => {
    const g = layoutDiagramSync(rowModel, { engine: 'grid' });
    const box = (x: number) => ({ x, y: 0, width: 200, height: 100 });
    return {
      ...g,
      nodes: {
        'public.a': { ...g.nodes['public.a']!, ...box(0) },
        'public.c': { ...g.nodes['public.c']!, ...box(300) },
        'public.b': { ...g.nodes['public.b']!, ...box(600) },
      },
      groups: {},
      edges: {},
    };
  };

  it("goes round a table that the 'none' route runs under", () => {
    const g = rowGeometry();
    const ref = rowModel.refs[0]!;
    const none = routeAll(ctxOf(rowModel, g, { avoid: 'none' })).get(ref.id)!;
    expect(tablesCrossed(none, g)).toEqual(['public.c']);
    const avoid = routeAll(ctxOf(rowModel, g)).get(ref.id)!;
    expect(tablesCrossed(avoid, g)).toEqual([]);
    // It keeps MARGIN clear of the table it goes round.
    const c = g.nodes['public.c']!;
    for (let i = 1; i < avoid.points.length; i++)
      expect(crosses(avoid.points[i - 1]!, avoid.points[i]!, c, MARGIN - 0.01)).toBe(false);
    // Same ports as before.
    expect(avoid.from).toEqual(none.from);
    expect(avoid.to).toEqual(none.to);
    // routeRef alone gives the same route (nothing to nudge here).
    expect(routeRef(ref, ctxOf(rowModel, g), tableIndex(rowModel))!.path).toBe(avoid.path);
  });

  // Phase 3 wave 2 (canvas v1) flipped the default from 'none' to 'tables'.
  it("defaults to 'tables'", () => {
    const g = rowGeometry();
    const ctx = ctxOf(rowModel, g);
    delete ctx.avoid;
    const a = routeAll(ctx);
    const b = routeAll({ ...ctx, avoid: 'tables' });
    expect([...a.values()].map((r) => r.path)).toEqual([...b.values()].map((r) => r.path));
    expect(tablesCrossed(a.get(rowModel.refs[0]!.id)!, g)).toEqual([]);
  });

  it("keeps 'straight' and 'curved' as in phase 2", () => {
    const g = rowGeometry();
    for (const edgeStyle of ['straight', 'curved'] as const) {
      const a = routeAll(ctxOf(rowModel, g, { edgeStyle }));
      const b = routeAll(ctxOf(rowModel, g, { edgeStyle, avoid: 'none' }));
      expect([...a.values()]).toEqual([...b.values()]);
    }
  });

  it('takes the least-bad route when every route crosses a box', () => {
    const g = rowGeometry();
    // c overlaps b's stub end: no clean route exists.
    g.nodes['public.c'] = { ...g.nodes['public.c']!, x: 380, width: 210 };
    const routes = routeAll(ctxOf(rowModel, g));
    const ref = rowModel.refs[0]!;
    expect(rawOf(routes, ref.id)!.clean).toBe(false);
    const r = routes.get(ref.id)!;
    expectOrthogonal(r);
    expect(r.points[0]).toEqual({ x: r.from.x, y: r.from.y });
  });

  it('uses ELK points when they are present and valid', async () => {
    const model = examples.find(([n]) => n === '02-ecommerce.dbml')![1];
    const g = await layoutDiagram(model);
    expect(Object.keys(g.edges).length).toBeGreaterThan(0);
    const a = routeAll(ctxOf(model, g));
    const b = routeAll(ctxOf(model, g, { avoid: 'none' }));
    for (const id of Object.keys(g.edges)) {
      if (!a.has(id)) continue;
      expect(a.get(id)!.path, id).toBe(b.get(id)!.path);
    }
  });

  it(`falls back to 'none' above ROUTER_MAX_NODES (${ROUTER_MAX_NODES}) nodes`, () => {
    const n = ROUTER_MAX_NODES + 1;
    const src = Array.from(
      { length: n },
      (_, i) => `Table t${i} {\n  id int [pk]\n  p int [ref: > t${(i * 7) % n}.id]\n}`,
    ).join('\n');
    const model = compile(src);
    const g = layoutDiagramSync(model, { engine: 'grid' });
    expect(Object.keys(g.nodes)).toHaveLength(n);
    const a = routeAll(ctxOf(model, g));
    const b = routeAll(ctxOf(model, g, { avoid: 'none' }));
    expect([...a.values()].map((r) => r.path)).toEqual([...b.values()].map((r) => r.path));
  });

  it('is deterministic', () => {
    for (const [, model] of examples) {
      for (const g of [layoutDiagramSync(model), layoutDiagramSync(model, { engine: 'grid' })]) {
        const a = [...routeAll(ctxOf(model, g)).values()].map((r) => r.path);
        const b = [...routeAll(ctxOf(model, structuredClone(g))).values()].map((r) => r.path);
        expect(b).toEqual(a);
      }
    }
  });
});

describe('router: collapsed groups (§4.1 5a)', () => {
  const model = examples.find(([n]) => n === '05-table-groups.dbml')![1];

  /** `geometry` with group `id` collapsed by hand: members deleted, a header-and-one-row box. */
  function collapse(geometry: DiagramGeometry, id: string): DiagramGeometry {
    const group = model.groups.find((g) => g.id === id)!;
    const box = geometry.groups[id]!;
    const nodes = { ...geometry.nodes };
    for (const t of group.tableIds) delete nodes[t];
    return {
      ...geometry,
      nodes,
      groups: {
        ...geometry.groups,
        [id]: {
          id,
          x: box.x,
          y: box.y,
          width: 200,
          height: METRICS.headerHeight + METRICS.rowHeight,
          collapsed: true,
        },
      },
      edges: {},
    };
  }

  it('attaches ends to the box header, drops refs inside the group', () => {
    expect(model.groups.length).toBeGreaterThan(0);
    const base = layoutDiagramSync(model);
    for (const group of model.groups) {
      const g = collapse(base, group.id);
      const box = g.groups[group.id]!;
      const members = new Set(group.tableIds);
      for (const avoid of ['tables', 'none'] as const) {
        const routes = routeAll(ctxOf(model, g, { avoid }));
        let attached = 0;
        for (const ref of model.refs) {
          const inFrom = members.has(ref.from.tableId);
          const inTo = members.has(ref.to.tableId);
          const r = routes.get(ref.id);
          if (inFrom && inTo) {
            expect(r, ref.id).toBeUndefined();
            continue;
          }
          expect(r, ref.id).toBeDefined();
          for (const [inGroup, e, node, tableId] of [
            [inFrom, r!.from, r!.fromNode, ref.from.tableId],
            [inTo, r!.to, r!.toNode, ref.to.tableId],
          ] as const) {
            if (!inGroup) {
              expect(node).toBe(tableId);
              continue;
            }
            attached++;
            expect(node).toBe(group.id);
            expect(e.row).toBe(-1);
            expect(e.x).toBe(e.side === 'right' ? box.x + box.width : box.x);
            const centre = box.y + METRICS.headerHeight / 2;
            expect(Math.abs(e.y - centre)).toBeLessThanOrEqual(METRICS.rowHeight / 2);
          }
          if (avoid === 'tables') expect(tablesCrossed(r!, g), ref.id).toEqual([]);
        }
        expect(attached, `${group.id} ${avoid}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('router: incremental', () => {
  function moved(g: DiagramGeometry, id: string, dx: number, dy: number): DiagramGeometry {
    const n = g.nodes[id]!;
    return { ...g, nodes: { ...g.nodes, [id]: { ...n, x: n.x + dx, y: n.y + dy } } };
  }

  it('equals a full routeAll after a move, and reuses unaffected routes', () => {
    const g0 = layoutDiagramSync(large);
    const before = routeAll(ctxOf(large, g0));
    for (const id of Object.keys(g0.nodes).slice(0, 12)) {
      const g1 = moved(g0, id, 140, -60);
      const inc = routeAll(ctxOf(large, g1), { previous: before.cache, dirty: new Set([id]) });
      const full = routeAll(ctxOf(large, g1));
      expect([...inc.entries()].map(([k, r]) => [k, r.path])).toEqual(
        [...full.entries()].map(([k, r]) => [k, r.path]),
      );
      expect([...inc.values()]).toEqual([...full.values()]);
      // Refs of the moved table were searched again; most others were reused.
      const searched = (r: RouteResult) => (r.cache.key as { raw: Map<string, RawRoute> }).raw;
      const old = new Set(searched(before).values());
      let reused = 0;
      for (const [key, raw] of searched(inc)) {
        const refId = key.split('\u0000')[0]!;
        const ref = large.refs.find((r) => r.id === refId)!;
        if (ref.from.tableId === id || ref.to.tableId === id) expect(old.has(raw)).toBe(false);
        else if (old.has(raw)) reused++;
      }
      expect(reused).toBeGreaterThan(large.refs.length / 2);
    }
  });

  it('notices boxes that moved without being marked dirty', () => {
    const g0 = layoutDiagramSync(large);
    const before = routeAll(ctxOf(large, g0));
    const id = Object.keys(g0.nodes)[5]!;
    const g1 = moved(g0, id, -90, 120);
    const inc = routeAll(ctxOf(large, g1), { previous: before.cache, dirty: new Set() });
    expect([...inc.values()]).toEqual([...routeAll(ctxOf(large, g1)).values()]);
  });

  it('starts over when the context changes', () => {
    const g0 = layoutDiagramSync(large);
    const before = routeAll(ctxOf(large, g0));
    const inc = routeAll(ctxOf(large, g0, { detailLevel: 'keys' }), {
      previous: before.cache,
      dirty: new Set(),
    });
    expect([...inc.values()]).toEqual([
      ...routeAll(ctxOf(large, g0, { detailLevel: 'keys' })).values(),
    ]);
  });

  it('returns a Map usable as before', () => {
    const g0 = layoutDiagramSync(large);
    const routes: Map<string, RefRoute> = routeAll(ctxOf(large, g0));
    expect(routes).toBeInstanceOf(Map);
    expect(routes.size).toBeGreaterThan(0);
  });
});

describe('router: budget (14-large, dagre)', () => {
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

  it('routes everything in ≤ 150 ms (target 25 ms median)', () => {
    const g = layoutDiagramSync(large);
    routeAll(ctxOf(large, g)); // warm-up
    const times: number[] = [];
    for (let i = 0; i < 9; i++) {
      const t0 = performance.now();
      routeAll(ctxOf(large, g));
      times.push(performance.now() - t0);
    }
    console.log(`routeAll 14-large (dagre, avoid tables): ${median(times).toFixed(2)} ms median`);
    expect(median(times)).toBeLessThanOrEqual(150);
  });

  it('re-routes a one-table drag frame in ≤ 40 ms (target 4 ms median)', () => {
    const g0 = layoutDiagramSync(large);
    // The table with the most refs.
    const count = new Map<string, number>();
    for (const r of large.refs)
      for (const t of [r.from.tableId, r.to.tableId]) count.set(t, (count.get(t) ?? 0) + 1);
    const id = [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0]![0];
    let prev = routeAll(ctxOf(large, g0));
    const times: number[] = [];
    for (let i = 1; i <= 15; i++) {
      const n = g0.nodes[id]!;
      const g = { ...g0, nodes: { ...g0.nodes, [id]: { ...n, x: n.x + i * 4, y: n.y + i * 2 } } };
      const t0 = performance.now();
      prev = routeAll(ctxOf(large, g), { previous: prev.cache, dirty: new Set([id]) });
      times.push(performance.now() - t0);
    }
    console.log(`drag frame 14-large (${id}): ${median(times).toFixed(2)} ms median`);
    expect(median(times)).toBeLessThanOrEqual(40);
  });
});
