// Review round 1 regressions: ELK route direction, ref spacing inside groups, monospace type
// widths, badge room, shared type label, collapsed nodes, note hard breaks, aspect-aware packing.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  METRICS,
  badgesWidth,
  columnBadges,
  columnTypeLabel,
  compileDbml,
  estimateTextWidth,
  layoutDiagram,
  layoutDiagramSync,
  measureNote,
  measureTable,
  wrapNoteText,
  type Column,
  type DiagramModel,
  type LayoutOptions,
} from '../src/index.js';

const examplesDir = fileURLToPath(new URL('../../../examples/', import.meta.url));

function compile(src: string): DiagramModel {
  const { model, diagnostics } = compileDbml(src);
  if (!model) throw new Error(diagnostics.map((d) => d.message).join('\n'));
  return model;
}

function exampleModels(): [string, DiagramModel][] {
  const out: [string, DiagramModel][] = [];
  for (const name of readdirSync(examplesDir).sort()) {
    const full = join(examplesDir, name);
    if (statSync(full).isDirectory() || !name.endsWith('.dbml')) continue;
    out.push([name, compile(readFileSync(full, 'utf8'))]);
  }
  return out;
}

const near = (p: { x: number; y: number }, box: { x: number; y: number; width: number }) =>
  Math.min(Math.abs(p.x - box.x), Math.abs(p.x - (box.x + box.width)));

describe('ELK edge points run from ref.from to ref.to', () => {
  it('for a `>` ref (FK on the from side) the first point is on the FK table', async () => {
    const m = compile(`
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
`);
    const ref = m.refs[0]!;
    expect(ref.fkSide).toBe('from');
    const g = await layoutDiagram(m);
    const pts = g.edges[ref.id]!.points;
    const from = g.nodes[ref.from.tableId]!;
    const to = g.nodes[ref.to.tableId]!;
    expect(near(pts[0]!, from)).toBeLessThan(1);
    expect(near(pts[pts.length - 1]!, to)).toBeLessThan(1);
  });

  it('holds for every ref of every example', async () => {
    for (const [name, m] of exampleModels()) {
      const g = await layoutDiagram(m);
      for (const ref of m.refs) {
        const e = g.edges[ref.id];
        if (!e || ref.from.tableId === ref.to.tableId) continue;
        const from = g.nodes[ref.from.tableId]!;
        const to = g.nodes[ref.to.tableId]!;
        const first = e.points[0]!;
        const last = e.points[e.points.length - 1]!;
        const ok =
          near(first, from) < 1 &&
          near(last, to) < 1 &&
          first.y >= from.y &&
          first.y <= from.y + from.height &&
          last.y >= to.y &&
          last.y <= to.y + to.height;
        expect(ok, `${name} ${ref.id}`).toBe(true);
      }
    }
  });
});

describe('refs inside a group get room for their markers', () => {
  it('linked tables in the same group are at least 80px apart', async () => {
    for (const [name, m] of exampleModels()) {
      const g = await layoutDiagram(m);
      for (const ref of m.refs) {
        const a = m.tables.find((t) => t.id === ref.from.tableId);
        const b = m.tables.find((t) => t.id === ref.to.tableId);
        if (!a || !b || a === b || !a.groupId || a.groupId !== b.groupId) continue;
        const ga = g.nodes[a.id]!;
        const gb = g.nodes[b.id]!;
        const gap = Math.max(gb.x - (ga.x + ga.width), ga.x - (gb.x + gb.width));
        const vgap = Math.max(gb.y - (ga.y + ga.height), ga.y - (gb.y + gb.height));
        expect(Math.max(gap, vgap), `${name} ${ref.id}`).toBeGreaterThanOrEqual(80);
      }
    }
  });
});

describe('refs leaving a group', () => {
  it('never run along a drawn group border', async () => {
    for (const [name, m] of exampleModels()) {
      const g = await layoutDiagram(m);
      for (const gr of Object.values(g.groups))
        for (const e of Object.values(g.edges))
          for (let i = 1; i < e.points.length; i++) {
            const a = e.points[i - 1]!;
            const b = e.points[i]!;
            const alongH =
              a.y === b.y &&
              (Math.abs(a.y - gr.y) < 2 || Math.abs(a.y - gr.y - gr.height) < 2) &&
              Math.max(a.x, b.x) > gr.x &&
              Math.min(a.x, b.x) < gr.x + gr.width;
            const alongV =
              a.x === b.x &&
              (Math.abs(a.x - gr.x) < 2 || Math.abs(a.x - gr.x - gr.width) < 2) &&
              Math.max(a.y, b.y) > gr.y &&
              Math.min(a.y, b.y) < gr.y + gr.height;
            expect(alongH || alongV, `${name} ${e.id} on ${gr.id}`).toBe(false);
          }
    }
  });
});

describe('text measurement', () => {
  it('column types are estimated as monospace', () => {
    const w = (s: string) => estimateTextWidth(s, 'columnType');
    const cell = 0.6 * METRICS.fontSize.columnType;
    expect(w('ticket_status')).toBe(Math.ceil(13 * cell));
    expect(w('integer')).toBe(Math.ceil(7 * cell));
    expect(w('iiii')).toBe(w('MMMM'));
  });

  it('the type label never repeats its arguments', () => {
    const col = { type: 'varchar(255)', typeArgs: '255' } as Column;
    expect(columnTypeLabel(col)).toBe('varchar(255)');
    expect(columnTypeLabel({ type: 'varchar', typeArgs: '255' } as Column)).toBe('varchar(255)');
    expect(columnTypeLabel({ type: 'int', typeArgs: null } as unknown as Column)).toBe('int');
  });

  it('measureTable measures the drawn type label and reserves badge room', () => {
    const m = compile(`
Table users {
  id int [pk]
  name varchar(255)
  email varchar(255) [not null, unique, note: 'login']
}
`);
    const t = m.tables[0]!;
    const email = t.columns.find((c) => c.name === 'email')!;
    const badges = columnBadges(email);
    expect(badges.map((b) => b.kind)).toEqual(['note', 'unique', 'notNull']);
    const row =
      METRICS.paddingX * 2 +
      METRICS.keyMarkerWidth +
      estimateTextWidth('email', 'columnName') +
      badgesWidth(badges) +
      estimateTextWidth('varchar(255)', 'columnType');
    expect(measureTable(t).width).toBe(Math.max(METRICS.minTableWidth, Math.ceil(row)));
  });

  it('a table note reserves room for the header note icon', () => {
    const long = 'a_rather_long_table_name_x';
    const plain = compile(`Table ${long} {\n  id int\n}`).tables[0]!;
    const noted = compile(`Table ${long} {\n  id int\n  Note: 'n'\n}`).tables[0]!;
    expect(measureTable(noted).width - measureTable(plain).width).toBe(METRICS.headerNoteIconWidth);
  });

  it('words wider than a note are broken by character', () => {
    const url = 'https://example.com/a/very/long/path/that/does/not/fit/in/a/sticky/note/at/all';
    const inner = METRICS.noteWidth - METRICS.notePadding * 2;
    const lines = wrapNoteText(`See ${url} for details`);
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(estimateTextWidth(l, 'noteText')).toBeLessThanOrEqual(inner);
    expect(lines.join('').replace(/\s/g, '')).toBe(`See${url}fordetails`);
    const note = { content: url } as Parameters<typeof measureNote>[0];
    expect(measureNote(note).height).toBeGreaterThan(METRICS.noteMinHeight - 1);
  });
});

describe('collapsed nodes', () => {
  it('report the detail level they were measured at', () => {
    const m = compile(`Table users {\n  id int [pk]\n  name varchar\n}\nTable b {\n  id int\n}`);
    const saved = {
      nodes: { 'public.users': { collapsed: true } },
    } as unknown as LayoutOptions['saved'];
    const g = layoutDiagramSync(m, { saved });
    expect(g.nodes['public.users']!.height).toBe(METRICS.headerHeight);
    expect(g.nodes['public.users']!.detailLevel).toBe('names');
    expect(g.nodes['public.b']!.detailLevel).toBeUndefined();
  });
});

describe('aspect-aware packing', () => {
  const src = Array.from({ length: 6 }, (_, i) => `Table t${i} {\n  id int\n}`).join('\n');
  it('wide viewports get wide pictures, tall viewports tall ones', () => {
    const m = compile(src);
    const wide = layoutDiagramSync(m, { aspectRatio: 3 }).bounds;
    const tall = layoutDiagramSync(m, { aspectRatio: 0.5 }).bounds;
    expect(wide.width / wide.height).toBeGreaterThan(1.5);
    expect(tall.width / tall.height).toBeLessThan(1);
  });
  it('sticky notes pack beside a component when the viewport is wide', async () => {
    const m = exampleModels().find(([n]) => n === '07-sticky-notes.dbml')![1];
    const b = (await layoutDiagram(m, { aspectRatio: 2.2 })).bounds;
    expect(b.width / b.height).toBeGreaterThan(1.2);
  });
});
