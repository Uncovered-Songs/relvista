/**
 * Canvas text edits (design phase3 §6.1) over every example: each edit compiles without new
 * diagnostics, changes only the bytes inside the ranges it reports (and only inside the element it
 * targets), and create + remove of a sticky note gives the original bytes back.
 */
import { compileDbml, type DiagramModel, type Diagnostic, type SourceSpan } from '@relvista/core';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyToTexts,
  canEdit,
  chainEdits,
  combineEdits,
  createStickyNote,
  diffEdits,
  normalizeColor,
  removeStickyNote,
  setSetting,
  setStickyNoteText,
  syncViews,
  uniqueNoteName,
  type EditInput,
  type FileEdit,
} from '../src/edits/dbmlEdits.js';
import { lineStarts, positionAt, toRanges } from '../src/edits/applyEdits.js';
import { EXAMPLES_DIR } from './helpers.js';

interface Workspace {
  name: string;
  input: EditInput;
}

function workspaces(): Workspace[] {
  const out: Workspace[] = [];
  for (const n of readdirSync(EXAMPLES_DIR).sort()) {
    const p = join(EXAMPLES_DIR, n);
    if (statSync(p).isDirectory()) {
      const files: Record<string, string> = {};
      const walk = (dir: string) => {
        for (const f of readdirSync(dir).sort()) {
          const q = join(dir, f);
          if (statSync(q).isDirectory()) walk(q);
          else if (f.endsWith('.dbml'))
            files[relative(p, q).split('\\').join('/')] = readFileSync(q, 'utf8');
        }
      };
      walk(p);
      out.push({ name: n, input: { files, entry: 'main.dbml' } });
    } else if (n.endsWith('.dbml')) {
      out.push({ name: n, input: { files: { [n]: readFileSync(p, 'utf8') }, entry: n } });
    }
  }
  return out;
}

const WORKSPACES = workspaces();

const compiled = new WeakMap<Record<string, string>, ReturnType<typeof compileDbml>>();

function compile(files: Record<string, string>, entry: string) {
  let r = compiled.get(files);
  if (!r) {
    r = compileDbml({ files, entry });
    compiled.set(files, r);
  }
  return r;
}

const diagKey = (d: Diagnostic) => `${d.severity}|${d.code ?? ''}|${d.message}`;

/** Applies `edits` and checks the result; returns the new input and model. */
function check(
  ws: Workspace,
  before: EditInput,
  edits: FileEdit[],
  opts: { within?: SourceSpan } = {},
): { input: EditInput; model: DiagramModel } {
  expect(edits.length).toBeGreaterThan(0);
  const after = applyToTexts(before.files, edits);
  // Only the reported ranges changed: every byte before the first and after the last edit of a
  // file is identical, and files without edits are untouched.
  for (const [file, text] of Object.entries(before.files)) {
    const list = edits.filter((e) => e.file === file).sort((a, b) => a.start - b.start);
    if (list.length === 0) {
      expect(after[file]).toBe(text);
      continue;
    }
    // Rebuild from the original text outside the ranges and the new text inside them.
    let rebuilt = '';
    let at = 0;
    for (const e of list) {
      expect(e.start).toBeGreaterThanOrEqual(at);
      rebuilt += text.slice(at, e.start) + e.newText;
      at = e.end;
    }
    rebuilt += text.slice(at);
    expect(after[file]).toBe(rebuilt);
    if (opts.within && opts.within.file === file) {
      for (const e of list) {
        expect(e.start).toBeGreaterThanOrEqual(opts.within.start.offset);
        expect(e.end).toBeLessThanOrEqual(opts.within.end.offset);
      }
    }
  }
  const was = compile(before.files, before.entry);
  const now = compile(after, before.entry);
  expect(now.model, `${ws.name}: ${now.diagnostics.map((d) => d.message).join('; ')}`).not.toBe(
    null,
  );
  const old = new Map<string, number>();
  for (const d of was.diagnostics) old.set(diagKey(d), (old.get(diagKey(d)) ?? 0) + 1);
  for (const d of now.diagnostics) {
    const k = diagKey(d);
    const n = old.get(k) ?? 0;
    expect(n, `${ws.name}: new diagnostic ${k}`).toBeGreaterThan(0);
    old.set(k, n - 1);
  }
  return { input: { files: after, entry: before.entry }, model: now.model! };
}

const TRICKY = "First line\nIt's a \"quoted\" ''' triple ''' note\n\n  indented\\backslash";

describe('pure helpers', () => {
  it('normalizes colours to #rrggbb lowercase', () => {
    expect(normalizeColor('#ABC')).toBe('#aabbcc');
    expect(normalizeColor('#A1B2C3')).toBe('#a1b2c3');
    expect(normalizeColor('red')).toBeNull();
    expect(normalizeColor('#12345')).toBeNull();
  });

  it('picks the first free note name', () => {
    const model = compileDbml("Note note_1 { 'a' }\nNote NOTE_2 { 'b' }").model;
    expect(uniqueNoteName(model)).toBe('note_3');
    expect(uniqueNoteName(null)).toBe('note_1');
    expect(uniqueNoteName(model, 'memo')).toBe('memo_1');
    expect(uniqueNoteName(model, 'note', ['note_3', 'Note_4'])).toBe('note_5');
  });

  it('converts LF offsets to Monaco positions', () => {
    const text = 'ab\ncd\n\nef';
    const starts = lineStarts(text);
    expect(positionAt(starts, 0)).toEqual({ lineNumber: 1, column: 1 });
    expect(positionAt(starts, 2)).toEqual({ lineNumber: 1, column: 3 });
    expect(positionAt(starts, 3)).toEqual({ lineNumber: 2, column: 1 });
    expect(positionAt(starts, 7)).toEqual({ lineNumber: 4, column: 1 });
    expect(positionAt(starts, 9)).toEqual({ lineNumber: 4, column: 3 });
    expect(toRanges(text, [{ file: 'a', start: 4, end: 8, newText: 'X' }])).toEqual([
      { range: { startLineNumber: 2, startColumn: 2, endLineNumber: 4, endColumn: 2 }, text: 'X' },
    ]);
  });

  it('diffEdits gives one minimal edit; chainEdits keeps separate ranges apart', () => {
    expect(diffEdits({ a: 'hello world' }, { a: 'hello brave world' })).toEqual([
      { file: 'a', start: 6, end: 6, newText: 'brave ' },
    ]);
    const input: EditInput = {
      files: { 's.dbml': 'Table a {\n  id int\n}\nTable b {\n  id int\n}\n' },
      entry: 's.dbml',
    };
    const edits = chainEdits(input, [
      (i) => setSetting(i, { kind: 'table', id: 'public.a' }, 'headercolor', '#FF0000'),
      (i) => setSetting(i, { kind: 'table', id: 'public.b' }, 'headercolor', '#00ff00'),
    ]);
    expect(edits).toHaveLength(2);
    expect(edits[0]!.end).toBeLessThan(edits[1]!.start);
    const out = applyToTexts(input.files, edits)['s.dbml']!;
    expect(out).toContain('Table a [headercolor: #ff0000] {');
    expect(out).toContain('Table b [headercolor: #00ff00] {');
  });

  it('rejects invalid colours and settings that do not apply to a kind', () => {
    const input: EditInput = { files: { 's.dbml': 'Table a {\n  id int\n}\n' }, entry: 's.dbml' };
    expect(setSetting(input, { kind: 'table', id: 'public.a' }, 'headercolor', 'red')).toEqual([]);
    expect(setSetting(input, { kind: 'table', id: 'public.a' }, 'color', '#ffffff')).toEqual([]);
    expect(canEdit(input, { kind: 'table', id: 'public.a' }, 'inactive')).toBe(false);
    expect(canEdit(input, { kind: 'table', id: 'public.nope' }, 'headercolor')).toBe(false);
    expect(createStickyNote(input, 's.dbml', 'n', 'x', 'nope')).toEqual([]);
    expect(createStickyNote(input, 'missing.dbml', 'n', 'x')).toEqual([]);
  });
});

describe.each(WORKSPACES)('$name', { timeout: 120_000 }, (ws) => {
  const base = ws.input;
  const model = compile(base.files, base.entry).model!;

  it('compiles as is', () => {
    expect(model).not.toBeNull();
  });

  it('creates a note at the end, sets its text, removes it: original bytes', () => {
    const name = uniqueNoteName(model);
    const created = check(ws, base, createStickyNote(base, base.entry, name, 'New note'));
    const edit = createStickyNote(base, base.entry, name, 'New note')[0]!;
    expect(edit.start).toBe(base.files[base.entry]!.length);
    expect(created.model.stickyNotes.find((n) => n.name === name)?.content).toBe('New note');

    const texted = check(
      ws,
      created.input,
      setStickyNoteText(created.input, `note:${name}`, TRICKY),
    );
    expect(texted.model.stickyNotes.find((n) => n.name === name)?.content).toBe(TRICKY);

    const single = check(ws, texted.input, setStickyNoteText(texted.input, name, "it's one line"));
    expect(single.model.stickyNotes.find((n) => n.name === name)?.content).toBe("it's one line");

    const removed = check(ws, single.input, removeStickyNote(single.input, name));
    expect(removed.input.files).toEqual(base.files);

    // With a colour, straight from create to remove.
    const coloured = check(ws, base, createStickyNote(base, base.entry, name, TRICKY, '#F4D03F'));
    const note = coloured.model.stickyNotes.find((n) => n.name === name)!;
    expect(note.color?.toLowerCase()).toBe('#f4d03f');
    expect(applyToTexts(coloured.input.files, removeStickyNote(coloured.input, name))).toEqual(
      base.files,
    );
  });

  it('edits the text and colour of every existing note in its own file', () => {
    for (const n of model.stickyNotes) {
      const r = check(ws, base, setStickyNoteText(base, n.name, TRICKY), { within: n.span });
      expect(r.model.stickyNotes.find((x) => x.id === n.id)?.content).toBe(TRICKY);
      const target = { kind: 'note' as const, id: n.id };
      expect(canEdit(base, target, 'color')).toBe(true);
      const c = check(ws, base, setSetting(base, target, 'color', '#ABCDEF'), { within: n.span });
      expect(c.model.stickyNotes.find((x) => x.id === n.id)?.color).toBe('#abcdef');
      const cleared = setSetting(c.input, target, 'color', null);
      const d = check(ws, c.input, cleared);
      expect(d.model.stickyNotes.find((x) => x.id === n.id)?.color).toBeNull();
      const removal = removeStickyNote(base, n.id);
      if (removal.length) {
        const removed = check(ws, base, removal);
        expect(removed.model.stickyNotes.some((x) => x.id === n.id)).toBe(false);
        // Views that listed it now list the others.
        for (const v of model.views.filter((x) => !x.allNotes && x.noteIds.includes(n.id)))
          expect(removed.model.views.find((x) => x.name === v.name)?.noteIds).toEqual(
            v.noteIds.filter((x) => x !== n.id),
          );
      } else {
        // Refused only when other text names the note (Metadata block, `use` import).
        const named = Object.values(base.files).some(
          (t) =>
            new RegExp(`Metadata\\s+Note\\s+${n.name}\\b`).test(t) ||
            new RegExp(`note\\s+${n.name}\\b`).test(t.replace(/^Note[^\\n]*$/gm, '')),
        );
        expect(named, n.id).toBe(true);
      }
    }
  });

  it('sets and clears the header colour of every table', () => {
    // Every table on its own: the edit stays inside the table's declaration.
    for (const t of model.tables) {
      const target = { kind: 'table' as const, id: t.id };
      expect(canEdit(base, target, 'headercolor'), t.id).toBe(true);
      for (const e of setSetting(base, target, 'headercolor', '#12AB9F')) {
        expect(e.file).toBe(t.span.file);
        expect(e.start).toBeGreaterThanOrEqual(t.span.start.offset);
        expect(e.end).toBeLessThanOrEqual(t.span.end.offset);
      }
    }
    // All of them at once (one compile), then all cleared.
    const targets = model.tables.map((t) => ({ kind: 'table' as const, id: t.id }));
    const set = check(
      ws,
      base,
      combineEdits(
        base,
        targets.map((target) => (i: EditInput) => setSetting(i, target, 'headercolor', '#12AB9F')),
      ),
    );
    for (const t of set.model.tables) expect(t.headerColor, t.id).toBe('#12ab9f');
    const cleared = check(
      ws,
      set.input,
      combineEdits(
        set.input,
        targets.map((target) => (i: EditInput) => setSetting(i, target, 'headercolor', null)),
      ),
    );
    for (const t of model.tables) {
      // A TablePartial's header colour shows through once the table's own one is gone.
      const after = cleared.model.tables.find((x) => x.id === t.id)?.headerColor ?? null;
      if (t.partials.length === 0) expect(after, t.id).toBeNull();
      else expect(after, t.id).not.toBe('#12ab9f');
    }
    // One by one with a full check, on the first tables (the batch above covers the rest).
    for (const t of model.tables.slice(0, 12)) {
      const target = { kind: 'table' as const, id: t.id };
      const one = check(ws, base, setSetting(base, target, 'headercolor', '#12AB9F'), {
        within: t.span,
      });
      expect(one.model.tables.find((x) => x.id === t.id)?.headerColor).toBe('#12ab9f');
      // Only this table changed colour.
      for (const o of one.model.tables)
        if (o.id !== t.id)
          expect(o.headerColor, o.id).toBe(model.tables.find((x) => x.id === o.id)?.headerColor);
    }
    for (const t of model.tables) {
      const target = { kind: 'table' as const, id: t.id };
      const edits = setSetting(base, target, 'headercolor', null);
      if (t.headerColor === null) expect(edits, t.id).toEqual([]);
      else if (edits.length) {
        const c = check(ws, base, edits, { within: t.span });
        expect(c.model.tables.find((x) => x.id === t.id)?.headerColor).not.toBe(t.headerColor);
      } else {
        // Only a colour the table sets itself can be removed (a partial's stays the partial's).
        expect(t.partials.length, t.id).toBeGreaterThan(0);
      }
    }
  });

  it('sets and clears the colour of every group', () => {
    for (const g of model.groups) {
      const target = { kind: 'group' as const, id: g.id };
      expect(canEdit(base, target, 'color'), g.id).toBe(true);
      // A `Metadata TableGroup` block holds the colour outside the group's own text.
      const meta = /^Metadata\s+TableGroup\b/m.test(base.files[g.span.file] ?? '');
      const set = check(ws, base, setSetting(base, target, 'color', '#3498DB'), {
        ...(meta ? {} : { within: g.span }),
      });
      expect(set.model.groups.find((x) => x.id === g.id)?.color).toBe('#3498db');
      const cleared = check(ws, set.input, setSetting(set.input, target, 'color', null));
      expect(cleared.model.groups.find((x) => x.id === g.id)?.color).toBeNull();
    }
  });

  it('sets colour and inactive on every ref that has its own settings, refuses the others', () => {
    for (const r of model.refs) {
      const target = { kind: 'ref' as const, id: r.id };
      const editable = canEdit(base, target, 'color');
      expect(canEdit(base, target, 'inactive'), r.id).toBe(editable);
      if (!editable) {
        expect(setSetting(base, target, 'color', '#ff0000'), r.id).toEqual([]);
        expect(setSetting(base, target, 'inactive', 'true'), r.id).toEqual([]);
        continue;
      }
      const set = check(ws, base, setSetting(base, target, 'color', '#FF8800'), { within: r.span });
      expect(set.model.refs.find((x) => x.id === r.id)?.color).toBe('#ff8800');
      for (const o of set.model.refs)
        if (o.id !== r.id) expect(o.color, o.id).toBe(model.refs.find((x) => x.id === o.id)?.color);
      const cleared = check(ws, set.input, setSetting(set.input, target, 'color', null));
      expect(cleared.model.refs.find((x) => x.id === r.id)?.color).toBeNull();

      const flip = r.inactive ? null : 'true';
      const inactive = check(ws, base, setSetting(base, target, 'inactive', flip), {
        within: r.span,
      });
      expect(inactive.model.refs.find((x) => x.id === r.id)?.inactive).toBe(!r.inactive);
      for (const o of inactive.model.refs)
        if (o.id !== r.id)
          expect(o.inactive, o.id).toBe(model.refs.find((x) => x.id === o.id)?.inactive);
      const back = check(
        ws,
        inactive.input,
        setSetting(inactive.input, target, 'inactive', r.inactive ? 'true' : null),
      );
      expect(back.model.refs.find((x) => x.id === r.id)?.inactive).toBe(r.inactive);
    }
  });

  it('creates, renames, updates and deletes views', () => {
    const tables = model.tables.slice(0, 2).map((t) => t.id);
    const name = 'rv_test_view';
    const created = check(
      ws,
      base,
      syncViews(base, [{ op: 'create', name, tables, notes: model.stickyNotes.length ? '*' : [] }]),
    );
    const view = created.model.views.find((v) => v.name === name)!;
    expect(view.tableIds).toEqual(
      model.tables.filter((t) => tables.includes(t.id)).map((t) => t.id),
    );
    expect(view.allNotes).toBe(model.stickyNotes.length > 0);
    // Create then delete: the original bytes.
    expect(
      applyToTexts(created.input.files, syncViews(created.input, [{ op: 'delete', name }])),
    ).toEqual(base.files);

    const all = check(
      ws,
      created.input,
      syncViews(created.input, [{ op: 'update', name, tables: '*' }]),
    );
    const v2 = all.model.views.find((v) => v.name === name)!;
    expect(v2.allTables).toBe(true);
    expect(v2.allNotes).toBe(view.allNotes);

    for (const v of model.views) {
      const renamed = check(
        ws,
        base,
        syncViews(base, [{ op: 'update', name: v.name, newName: `${v.name}_renamed` }]),
        { within: v.span },
      );
      const r = renamed.model.views.find((x) => x.name === `${v.name}_renamed`);
      expect(r, v.name).toBeDefined();
      expect(renamed.model.views.some((x) => x.name === v.name)).toBe(false);
      expect({ ...r!, span: null, name: v.name }).toEqual({ ...v, span: null });

      const first = model.tables[0]!.id;
      const updated = check(
        ws,
        base,
        syncViews(base, [{ op: 'update', name: v.name, tables: [first] }]),
        {
          within: v.span,
        },
      );
      expect(updated.model.views.find((x) => x.name === v.name)?.tableIds).toContain(first);

      const deleted = check(ws, base, syncViews(base, [{ op: 'delete', name: v.name }]));
      expect(deleted.model.views.some((x) => x.name === v.name)).toBe(false);
      expect(deleted.model.views).toHaveLength(model.views.length - 1);
    }
    // Ops on unknown views, or creating one that exists, change nothing.
    expect(syncViews(base, [{ op: 'delete', name: 'nope_view' }])).toEqual([]);
    if (model.views[0])
      expect(syncViews(base, [{ op: 'create', name: model.views[0].name }])).toEqual([]);
  });
});

describe('coverage across the examples', { timeout: 120_000 }, () => {
  it('finds editable standalone refs and refuses inline ones', () => {
    let editable = 0;
    let refused = 0;
    for (const ws of WORKSPACES) {
      const model = compile(ws.input.files, ws.input.entry).model!;
      for (const r of model.refs) {
        if (canEdit(ws.input, { kind: 'ref', id: r.id }, 'color')) editable++;
        else refused++;
      }
    }
    expect(editable).toBeGreaterThan(10);
    expect(refused).toBeGreaterThan(10);
  });

  it('edits a table declared in another file of a multi-file workspace', () => {
    const ws = WORKSPACES.find((w) => w.name === '12-modules')!;
    const edits = setSetting(
      ws.input,
      { kind: 'table', id: 'public.billing_users' },
      'headercolor',
      '#ffaa00',
    );
    expect(edits.map((e) => e.file)).toEqual(['billing.dbml']);
    const note = setStickyNoteText(ws.input, 'auth_readme', 'x');
    expect(note.map((e) => e.file)).toEqual(['auth.dbml']);
  });
});
