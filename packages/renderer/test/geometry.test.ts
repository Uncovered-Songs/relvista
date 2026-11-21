// Renderer-side geometry helpers with phase-3 core geometry (wave-1 integration).
import { describe, expect, it } from 'vitest';
import {
  METRICS,
  compileDbml,
  layoutDiagramSync,
  type DiagramModel,
  type NodeLayout,
} from '@relvista/core';
import { gridLayout, moveNodes } from '../src/geometry.js';

const SOURCE = `
Table a { id int [pk] }
Table b { id int [pk]
  a_id int [ref: > a.id] }
Table c { id int [pk]
  b_id int [ref: > b.id] }
TableGroup g { b
  c }
Note n { 'hello' }
`;

/** Saved entries without positions (the layout file may omit x/y; the type requires them). */
const entries = (nodes: Record<string, Partial<NodeLayout>>) => nodes as Record<string, NodeLayout>;

function model(): DiagramModel {
  const r = compileDbml(SOURCE);
  if (!r.model) throw new Error(JSON.stringify(r.diagnostics));
  return r.model;
}

describe('moveNodes with a collapsed group', () => {
  const m = model();
  const groupId = m.groups[0]!.id;
  const base = layoutDiagramSync(m, {
    engine: 'dagre',
    saved: { nodes: entries({ [groupId]: { collapsed: true } }) },
  });

  it('keeps the collapsed box when a plain table moves', () => {
    expect(base.groups[groupId]?.collapsed).toBe(true);
    const a = base.nodes[m.tables[0]!.id]!;
    const g = moveNodes(m, base, new Map([[a.id, { x: a.x + 40, y: a.y }]]));
    expect(g.groups[groupId]).toEqual(base.groups[groupId]);
    expect(g.nodes[a.id]!.x).toBe(a.x + 40);
  });

  it('moves the collapsed box by its own id', () => {
    const box = base.groups[groupId]!;
    const g = moveNodes(m, base, new Map([[groupId, { x: box.x + 10, y: box.y + 20 }]]));
    expect(g.groups[groupId]).toMatchObject({ x: box.x + 10, y: box.y + 20, collapsed: true });
    expect(g.bounds).not.toEqual(base.bounds);
  });
});

describe('gridLayout notes', () => {
  it('clamps a saved note width like core', () => {
    const m = model();
    const noteId = m.stickyNotes[0]!.id;
    const g = gridLayout(m, { saved: { nodes: entries({ [noteId]: { w: 10 } }) } });
    expect(g.nodes[noteId]!.width).toBe(METRICS.noteMinWidth);
    const core = layoutDiagramSync(m, {
      engine: 'grid',
      saved: { nodes: entries({ [noteId]: { w: 10 } }) },
    });
    expect(g.nodes[noteId]!.width).toBe(core.nodes[noteId]!.width);
  });
});
