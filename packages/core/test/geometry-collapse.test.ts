// Collapsed TableGroups in auto-layout (docs/design/phase3-v1.md §3.1): a `group:<name>` entry
// with `collapsed: true` becomes one box; its members leave `nodes`, refs attach to the box header.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  METRICS,
  compileDbml,
  layoutDiagram,
  layoutDiagramSync,
  type Box,
  type CompileInput,
  type DetailLevel,
  type DiagramGeometry,
  type DiagramModel,
  type LayoutOptions,
  type NodeLayout,
} from '../src/index.js';
import {
  collapsedGroupIds,
  collapsedGroupLabel,
  measureCollapsedGroup,
} from '../src/geometry/collapse.js';

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

/** Groups with at least one table: the ones that get a box. */
const visibleGroups = (m: DiagramModel) =>
  m.groups.filter((g) => m.tables.some((t) => t.groupId === g.id)).map((g) => g.id);

const withGroups = loadExamples().filter(([, m]) => visibleGroups(m).length > 0);

type Engine = 'elk' | 'dagre' | 'grid';
const ENGINES: Engine[] = ['elk', 'dagre', 'grid'];
const LEVELS: DetailLevel[] = ['all', 'keys', 'names'];

function run(model: DiagramModel, engine: Engine, options: LayoutOptions) {
  return engine === 'elk'
    ? layoutDiagram(model, { ...options, engine })
    : Promise.resolve(layoutDiagramSync(model, { ...options, engine }));
}

function collapsedEntries(ids: string[], extra: Partial<NodeLayout> = {}) {
  const nodes: Record<string, NodeLayout> = {};
  for (const id of ids) nodes[id] = { collapsed: true, ...extra } as NodeLayout;
  return { nodes };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** `fixed`: collapsed groups with a saved position (refs touching them get no ELK route). */
function check(
  model: DiagramModel,
  collapsed: string[],
  geo: DiagramGeometry,
  engine: Engine,
  fixed: string[] = [],
) {
  const set = new Set(collapsed);
  const memberOf = (tableId: string) => {
    const g = model.tables.find((t) => t.id === tableId)?.groupId;
    return g && set.has(g) ? g : null;
  };
  // No member in nodes; every other table and note is there, in model order.
  const expected = [
    ...model.tables.filter((t) => !memberOf(t.id)).map((t) => t.id),
    ...model.stickyNotes.map((n) => n.id),
  ];
  expect(Object.keys(geo.nodes)).toEqual(expected);
  // Groups: model order; collapsed ones carry `collapsed: true` and the measured size.
  expect(Object.keys(geo.groups)).toEqual(visibleGroups(model));
  for (const id of collapsed) {
    const box = geo.groups[id]!;
    expect(box.collapsed).toBe(true);
    const group = model.groups.find((g) => g.id === id)!;
    const count = model.tables.filter((t) => t.groupId === id).length;
    expect({ width: box.width, height: box.height }).toEqual(measureCollapsedGroup(group, count));
    expect(geo.nodes[id]).toBeUndefined();
    for (const n of Object.values(geo.nodes))
      expect(overlaps(box, n), `${n.id} overlaps ${id}`).toBe(false);
    for (const other of Object.values(geo.groups))
      if (other.id !== id) expect(overlaps(box, other), `${other.id} overlaps ${id}`).toBe(false);
    expect(box.x >= geo.bounds.x && box.y >= geo.bounds.y).toBe(true);
    expect(box.x + box.width <= geo.bounds.x + geo.bounds.width + 1e-9).toBe(true);
    expect(box.y + box.height <= geo.bounds.y + geo.bounds.height + 1e-9).toBe(true);
  }
  for (const g of Object.values(geo.groups))
    if (!set.has(g.id)) expect(g.collapsed).toBeUndefined();

  // Internal refs are absent; ELK routes of the others end on the box header.
  for (const ref of model.refs) {
    const a = memberOf(ref.from.tableId);
    const b = memberOf(ref.to.tableId);
    if (a && a === b) expect(geo.edges[ref.id], `internal ref ${ref.id}`).toBeUndefined();
  }
  if (engine !== 'elk') {
    expect(geo.edges).toEqual({});
    return;
  }
  const tableIds = new Set(model.tables.map((t) => t.id));
  const drawn = model.refs.filter((r) => {
    if (!tableIds.has(r.from.tableId) || !tableIds.has(r.to.tableId)) return false;
    const a = memberOf(r.from.tableId);
    const b = memberOf(r.to.tableId);
    if ((a && fixed.includes(a)) || (b && fixed.includes(b))) return false;
    return !a || a !== b;
  });
  expect(Object.keys(geo.edges).sort()).toEqual(Array.from(new Set(drawn.map((r) => r.id))).sort());
  for (const e of Object.values(geo.edges)) {
    const ref = model.refs.find((r) => r.id === e.id)!;
    const ends: Array<[string | null, { x: number; y: number }]> = [
      [memberOf(ref.from.tableId), e.points[0]!],
      [memberOf(ref.to.tableId), e.points[e.points.length - 1]!],
    ];
    for (const [group, p] of ends) {
      if (!group) continue;
      const box = geo.groups[group]!;
      const onSide = Math.abs(p.x - box.x) < 0.5 || Math.abs(p.x - (box.x + box.width)) < 0.5;
      expect(onSide, `${e.id} ends on a side of ${group}`).toBe(true);
      expect(p.y - box.y).toBeCloseTo(METRICS.headerHeight / 2, 6);
    }
  }
}

describe('collapse helpers', () => {
  const [, model] = withGroups.find(([n]) => n === '05-table-groups.dbml')!;
  const [first, second] = visibleGroups(model);

  it('collapsedGroupIds reads `collapsed: true` entries of visible groups only', () => {
    expect(collapsedGroupIds(model, null)).toEqual(new Set());
    expect(collapsedGroupIds(model, { nodes: {} })).toEqual(new Set());
    const saved = {
      nodes: {
        [first!]: { x: 0, y: 0, collapsed: true },
        [second!]: { x: 0, y: 0, collapsed: false },
        'group:nope': { x: 0, y: 0, collapsed: true },
      },
    };
    expect(collapsedGroupIds(model, saved)).toEqual(new Set([first]));
    // A group whose tables are all filtered out of the view has no box.
    const filtered = { ...model, tables: model.tables.filter((t) => t.groupId !== first) };
    expect(collapsedGroupIds(filtered, saved)).toEqual(new Set());
  });

  it('measureCollapsedGroup: header + one row, table width clamps', () => {
    const group = model.groups.find((g) => g.id === first)!;
    const size = measureCollapsedGroup(group, 3);
    expect(size.height).toBe(METRICS.headerHeight + METRICS.rowHeight + METRICS.tableBottomPadding);
    expect(size.width).toBeGreaterThanOrEqual(METRICS.minTableWidth);
    expect(measureCollapsedGroup(group, 3, () => 10_000).width).toBe(METRICS.maxTableWidth);
    expect(measureCollapsedGroup(group, 3, () => 0).width).toBe(METRICS.minTableWidth);
    expect(collapsedGroupLabel(1)).toBe('1 table');
    expect(collapsedGroupLabel(4)).toBe('4 tables');
  });

  it('saved w/h of the group entry override the measured size', async () => {
    const saved = collapsedEntries([first!], { w: 333, h: 99 });
    for (const engine of ENGINES) {
      const geo = await run(model, engine, { saved });
      expect(geo.groups[first!]).toMatchObject({ width: 333, height: 99, collapsed: true });
    }
  });

  it('several refs between the same display nodes stay separate edges', async () => {
    const src = `
Table a { id int [pk] }
Table b { id int [pk]
  a1 int [ref: > a.id]
  a2 int [ref: > a.id]
}
Table c { id int [pk]
  b1 int [ref: > b.id]
}
TableGroup g { b
  c }`;
    const m = compileDbml(src).model!;
    const geo = await layoutDiagram(m, { saved: collapsedEntries(['group:g']) });
    expect(Object.keys(geo.nodes)).toEqual(['public.a']);
    // Two refs a <- b survive (separate edges), b <- c is internal and dropped.
    expect(Object.keys(geo.edges)).toHaveLength(2);
    expect(geo.groups['group:g']!.collapsed).toBe(true);
  });
});

describe.each(withGroups)('%s', (_name, model) => {
  const groups = visibleGroups(model);
  const configs: Array<[string, string[]]> = [
    ...groups.map((g): [string, string[]] => [g, [g]]),
    ['all groups', groups],
  ];

  const expandedCache = new Map<string, string>();
  const expandedOf = async (engine: Engine, detailLevel: DetailLevel) => {
    const key = `${engine}/${detailLevel}`;
    if (!expandedCache.has(key))
      expandedCache.set(key, JSON.stringify(await run(model, engine, { detailLevel })));
    return expandedCache.get(key)!;
  };

  describe.each(configs)('collapsed: %s', (_label, collapsed) => {
    it.each(ENGINES)('%s × detail levels', { timeout: 30_000 }, async (engine) => {
      for (const detailLevel of LEVELS) {
        const saved = collapsedEntries(collapsed);
        const geo = await run(model, engine, { detailLevel, saved });
        check(model, collapsed, geo, engine);
        // Repeated runs are JSON-equal.
        const again = await run(structuredClone(model), engine, {
          detailLevel,
          saved: structuredClone(saved),
        });
        expect(JSON.stringify(again)).toBe(JSON.stringify(geo));
        // Removing the entries (no saved layout, or `collapsed: false`) gives exactly the
        // expanded geometry.
        const expanded = await expandedOf(engine, detailLevel);
        expect(
          JSON.stringify(
            await run(model, engine, {
              detailLevel,
              saved: collapsedEntries(collapsed, { collapsed: false }),
            }),
          ),
        ).toBe(expanded);
      }
    });
  });

  it.each(ENGINES)('%s: saved x/y of a collapsed group are honoured', async (engine) => {
    const target = groups[0]!;
    const saved = collapsedEntries(groups);
    saved.nodes[target] = { x: 5000, y: -300, collapsed: true };
    const geo = await run(model, engine, { saved });
    check(model, groups, geo, engine, [target]);
    expect(geo.groups[target]).toMatchObject({ x: 5000, y: -300, collapsed: true });
    // Routes touching the fixed box are left to the renderer, as for fixed tables.
    const members = new Set(model.tables.filter((t) => t.groupId === target).map((t) => t.id));
    for (const id of Object.keys(geo.edges)) {
      const ref = model.refs.find((r) => r.id === id)!;
      expect(members.has(ref.from.tableId) || members.has(ref.to.tableId)).toBe(false);
    }
  });
});
