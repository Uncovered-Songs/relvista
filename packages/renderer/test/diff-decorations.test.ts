import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileDbml, diffModels, mergeForDiff, type DiagramModel } from '@relvista/core';
import { describe, expect, it } from 'vitest';
import { diffBadge, diffDecorations, diffLegend } from '../src/diff/index.js';
import { renderDiagramSvgString } from '../src/export/svgString.js';
import { layoutSync } from '../src/geometry.js';
import { loadExamples } from './examples.js';

const examplesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../examples');
const example = (name: string) => readFileSync(join(examplesDir, name), 'utf8');

function model(text: string): DiagramModel {
  const { model: m, diagnostics } = compileDbml(text);
  if (!m) throw new Error(`does not compile: ${JSON.stringify(diagnostics)}`);
  return m;
}

/** Applies a text edit and checks it happened. */
function edit(text: string, from: string | RegExp, to: string): string {
  const out = text.replace(from, to);
  if (out === text) throw new Error(`edit did not apply: ${String(from)}`);
  return out;
}

function diffOf(before: string, after: string) {
  const b = model(before);
  const a = model(after);
  const diff = diffModels(b, a);
  return { diff, decorations: diffDecorations(diff), merged: mergeForDiff(b, a, diff) };
}

describe('diffDecorations', () => {
  it.each(loadExamples())('an identity diff decorates nothing: %s', (_name, input) => {
    const { model: m } = compileDbml(input);
    if (!m) throw new Error('example does not compile');
    const diff = diffModels(m, m);
    expect(diffDecorations(diff)).toEqual({});
    expect(diffLegend(diff)).toEqual([]);
  });

  const ecommerce = example('02-ecommerce.dbml');

  it('column add / drop / type change: column tones, a changed table and its badge', () => {
    let after = edit(ecommerce, '  bio text\n', '  bio varchar(500)\n  website varchar(200)\n');
    after = edit(after, '  avatar_url varchar(500)\n', '');
    after = edit(after, '  continent_name varchar(50)\n', '  continent_name varchar(80)\n');
    const { diff, decorations } = diffOf(ecommerce, after);
    expect(decorations).toEqual({
      nodes: { 'public.countries': 'changed', 'public.user_profiles': 'changed' },
      columns: {
        'public.countries': { continent_name: 'changed' },
        'public.user_profiles': { bio: 'changed', website: 'added', avatar_url: 'removed' },
      },
      badges: { 'public.countries': '~1', 'public.user_profiles': '+1 −1 ~1' },
    });
    expect(diffLegend(diff)).toEqual([{ tone: 'changed', label: 'Changed', count: 2 }]);
  });

  it('added and removed tables with their refs', () => {
    let after = edit(
      ecommerce,
      'Table countries {',
      'Table invoices {\n  id integer [pk]\n  user_id integer [ref: > users.id]\n}\n\nTable countries {',
    );
    after = edit(after, /Table categories \{[\s\S]*?\n\}\n/, '');
    // products.category_id may reference categories elsewhere; drop such refs so it compiles.
    after = after.replace(/^Ref[^\n]*categories[^\n]*\n/gm, '');
    const { diff, decorations, merged } = diffOf(ecommerce, after);
    expect(decorations.nodes?.['public.invoices']).toBe('added');
    expect(decorations.nodes?.['public.categories']).toBe('removed');
    // Added / removed tables are toned as a whole: no column tints, no badge.
    expect(decorations.columns?.['public.invoices']).toBeUndefined();
    expect(decorations.columns?.['public.categories']).toBeUndefined();
    expect(decorations.badges ?? {}).toEqual({});
    const addedRefs = Object.entries(decorations.refs ?? {}).filter(([, t]) => t === 'added');
    const removedRefs = Object.entries(decorations.refs ?? {}).filter(([, t]) => t === 'removed');
    expect(addedRefs.map(([id]) => id)).toEqual([expect.stringContaining('public.invoices')]);
    expect(removedRefs.length).toBeGreaterThanOrEqual(1);
    for (const [id] of removedRefs) expect(id).toContain('public.categories');
    // Every decorated id exists in the merged model the diff is drawn on.
    const ids = new Set([...merged.tables.map((t) => t.id)]);
    for (const id of Object.keys(decorations.nodes ?? {})) expect(ids.has(id)).toBe(true);
    const refIds = new Set(merged.refs.map((r) => r.id));
    for (const id of Object.keys(decorations.refs ?? {})) expect(refIds.has(id)).toBe(true);
    expect(diffLegend(diff)).toEqual([
      { tone: 'added', label: 'Added', count: diff.summary.added },
      { tone: 'removed', label: 'Removed', count: diff.summary.removed },
    ]);
    expect(diff.summary.added).toBe(2); // table + ref
  });

  it('a renamed table is one changed node under its new id', () => {
    const after = edit(ecommerce, 'Table countries {', 'Table nations {').replace(
      /countries\.code/g,
      'nations.code',
    );
    const { diff, decorations } = diffOf(ecommerce, after);
    const t = diff.tables.find((x) => x.id === 'public.nations');
    expect(t?.renamedFrom).toBe('public.countries');
    expect(decorations.nodes?.['public.nations']).toBe('changed');
    expect(decorations.nodes?.['public.countries']).toBeUndefined();
    expect(decorations.badges?.['public.nations']).toMatch(/^~\d+$/);
  });

  it('toggling a ref inactive tones the ref changed', () => {
    const before = 'Table a { id int [pk] }\nTable b { a_id int }\nRef: b.a_id > a.id\n';
    const after = 'Table a { id int [pk] }\nTable b { a_id int }\nRef: b.a_id > a.id [inactive]\n';
    const { diff, decorations } = diffOf(before, after);
    expect(decorations).toEqual({ refs: { [diff.refs[0]!.id]: 'changed' } });
    expect(diffLegend(diff)).toEqual([{ tone: 'changed', label: 'Changed', count: 1 }]);
  });

  it('group colour and sticky notes are toned by their node ids', () => {
    const groups = example('05-table-groups.dbml');
    const after = edit(groups, '[color: #79AD51]', '[color: #FF0000]');
    const { decorations } = diffOf(groups, after);
    expect(decorations.nodes).toEqual({ 'group:catalog': 'changed' });

    const notes = example('07-sticky-notes.dbml');
    const removed = edit(notes, /Note reminder[^{]*\{[\s\S]*?\n\}\n/, '');
    const added = `${removed}\nNote fresh {\n  'new note'\n}\n`;
    const d = diffOf(notes, added).decorations;
    expect(d.nodes).toEqual({ 'note:reminder': 'removed', 'note:fresh': 'added' });
  });

  it('draws the decorations on the merged model', () => {
    const after = edit(ecommerce, '  bio text\n', '');
    const { decorations, merged } = diffOf(ecommerce, after);
    const svg = renderDiagramSvgString(merged, layoutSync(merged), { decorations });
    expect(svg).toMatch(/data-rv-table="public.user_profiles"[^>]*data-rv-tone="changed"/);
    expect(svg).toMatch(/data-rv-column="bio"[^>]*data-rv-tone="removed"/);
    expect(svg).toContain('data-rv-node-badge="−1"');
  });
});

describe('diffBadge', () => {
  const base = { id: 't', status: 'changed' as const, changes: [], indexes: [], checks: [] };
  it('leaves out zero parts and counts table-level, index and check changes as ~', () => {
    expect(diffBadge({ ...base, columns: [] })).toBe('');
    expect(
      diffBadge({
        ...base,
        columns: [
          { name: 'a', status: 'added', changes: [] },
          { name: 'b', status: 'added', changes: [] },
          { name: 'c', status: 'removed', changes: [] },
          { name: 'd', status: 'changed', changes: [] },
        ],
        changes: [{ field: 'note', before: null, after: 'x' }],
        indexes: [{ status: 'added', label: '(a)' }],
      }),
    ).toBe('+2 −1 ~3');
  });
});
