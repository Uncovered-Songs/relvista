/**
 * Text edits made from the canvas (design phase3 §6.1): sticky notes, colours, inactive refs and
 * DiagramViews. Pure: every edit comes from an `@dbml/parse` transform helper run against the file
 * that declares the element, over a `MemoryProjectLayout` holding every workspace file at
 * `/<key>`, so the rest of each file stays byte-identical (the compatibility promise).
 *
 * A helper that cannot target an element (an inline ref has no settings list of its own, a ref
 * injected by a TablePartial, two refs with the same endpoints) returns `[]`; `canEdit` lets the UI
 * disable the item ("Edit this ref in code") instead of rewriting text by hand.
 */
import {
  BlockExpressionNode,
  Compiler,
  ElementDeclarationNode,
  Filepath,
  FunctionApplicationNode,
  MemoryProjectLayout,
  MetadataKind,
  SymbolKind,
  WildcardNode,
  splitQualifiedIdentifier,
  type DiagramViewSyncOperation,
  type ElementIdentifier,
  type EndpointRef,
  type TextEdit,
} from '@dbml/parse';
import { compileDbml, type DiagramModel, type Ref, type Table } from '@relvista/core';

export interface FileEdit {
  /** EditorFile key. */
  file: string;
  /** UTF-16 offset into the Monaco text (LF), as `TextEdit`. */
  start: number;
  end: number;
  newText: string;
}

export interface EditInput {
  /** Monaco texts (LF, no BOM), by EditorFile key. */
  files: Record<string, string>;
  entry: string;
  /**
   * The model compiled from exactly these files, when the caller has it (saves a compile). Never
   * pass a model of other texts: spans would point at the wrong bytes.
   */
  model?: DiagramModel | null;
}

export type ElementTarget =
  | { kind: 'table'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'note'; id: string }
  | { kind: 'ref'; id: string };

export type SettingName = 'headercolor' | 'color' | 'inactive';

export interface ViewOp {
  op: 'create' | 'update' | 'delete';
  name: string;
  newName?: string;
  /** Table ids, or `'*'` for every table. Omitted on update: unchanged. `[]`: none. */
  tables?: string[] | '*';
  /** Sticky note ids (`note:<name>`) or names, or `'*'`. Omitted on update: unchanged. */
  notes?: string[] | '*';
  /** TableGroup ids (`group:<name>`) or names. */
  groups?: string[];
  /** Schema names. */
  schemas?: string[];
}

// ---------------------------------------------------------------------------------------------
// Plumbing

const pathOf = (key: string): Filepath => Filepath.from(`/${key.replace(/^\/+/, '')}`);

const compilerCache = new WeakMap<EditInput, Compiler>();

/** One Compiler per input (its parse results are cached per file; the texts never change). */
function compilerFor(input: EditInput): Compiler {
  const cached = compilerCache.get(input);
  if (cached) return cached;
  const files: Record<string, string> = {};
  for (const [k, text] of Object.entries(input.files)) files[pathOf(k).absolute] = text;
  const compiler = new Compiler(new MemoryProjectLayout(files));
  compilerCache.set(input, compiler);
  return compiler;
}

const modelCache = new WeakMap<EditInput, DiagramModel | null>();

/** The model of `input` (compiled once per input object). */
export function modelOf(input: EditInput): DiagramModel | null {
  if (input.model !== undefined) return input.model;
  if (modelCache.has(input)) return modelCache.get(input)!;
  const model = compileDbml({ files: input.files, entry: input.entry }).model;
  modelCache.set(input, model);
  return model;
}

/** Runs one helper against `file`; any parser exception means "no edit". */
function run(
  input: EditInput,
  file: string,
  fn: (c: Compiler, fp: Filepath) => TextEdit[],
  compiler = compilerFor(input),
): FileEdit[] {
  if (!(file in input.files)) return [];
  try {
    return fn(compiler, pathOf(file)).map((e) => ({ file, ...e }));
  } catch {
    return [];
  }
}

/** The texts after `edits` (edits of one file must not overlap). */
export function applyToTexts(
  files: Record<string, string>,
  edits: FileEdit[],
): Record<string, string> {
  const out = { ...files };
  const byFile = new Map<string, FileEdit[]>();
  for (const e of edits) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e]);
  for (const [file, list] of byFile) {
    let text = out[file] ?? '';
    for (const e of [...list].sort((a, b) => b.start - a.start || b.end - a.end)) {
      text = text.slice(0, e.start) + e.newText + text.slice(e.end);
    }
    out[file] = text;
  }
  return out;
}

/** One edit per changed file covering exactly the bytes that differ (common prefix/suffix kept). */
export function diffEdits(
  before: Record<string, string>,
  after: Record<string, string>,
): FileEdit[] {
  const out: FileEdit[] = [];
  for (const [file, a] of Object.entries(after)) {
    const b = before[file];
    if (b === undefined || a === b) continue;
    let start = 0;
    const max = Math.min(a.length, b.length);
    while (start < max && a.charCodeAt(start) === b.charCodeAt(start)) start++;
    let endA = a.length;
    let endB = b.length;
    while (endA > start && endB > start && a.charCodeAt(endA - 1) === b.charCodeAt(endB - 1)) {
      endA--;
      endB--;
    }
    out.push({ file, start, end: endB, newText: a.slice(start, endA) });
  }
  return out;
}

/**
 * `second` (offsets into the texts after `first`) expressed over the original texts, merged with
 * `first`: separate ranges stay separate (one Monaco operation each, markers elsewhere kept). A
 * file whose two edit sets touch or overlap falls back to one minimal edit (`diffEdits`).
 */
export function composeEdits(
  files: Record<string, string>,
  first: FileEdit[],
  second: FileEdit[],
): FileEdit[] {
  const out: FileEdit[] = [];
  const keys = new Set([...first, ...second].map((e) => e.file));
  for (const file of keys) {
    const a = first.filter((e) => e.file === file).sort((x, y) => x.start - y.start);
    const b = second.filter((e) => e.file === file).sort((x, y) => x.start - y.start);
    // Where each first edit's new text sits in the intermediate text.
    let delta = 0;
    const placed = a.map((e) => {
      const s = e.start + delta;
      delta += e.newText.length - (e.end - e.start);
      return { s, end: s + e.newText.length, shift: delta };
    });
    const mapped: FileEdit[] = [];
    let clash = false;
    for (const e of b) {
      let shift = 0;
      for (const p of placed) {
        if (e.end < p.s) break;
        if (e.start <= p.end) {
          clash = true;
          break;
        }
        shift = p.shift;
      }
      if (clash) break;
      mapped.push({ ...e, start: e.start - shift, end: e.end - shift });
    }
    if (clash) {
      const before = { [file]: files[file] ?? '' };
      const mid = applyToTexts(before, a);
      out.push(...diffEdits(before, applyToTexts(mid, b)));
    } else out.push(...a, ...mapped);
  }
  return out.sort((x, y) => (x.file < y.file ? -1 : x.file > y.file ? 1 : x.start - y.start));
}

/**
 * Runs several edit steps one after the other (each sees the texts of the previous ones) and
 * returns edits over the original texts: one undo stop per file for a multi-selection.
 */
export function chainEdits(
  input: EditInput,
  steps: Array<(input: EditInput) => FileEdit[]>,
): FileEdit[] {
  let current: EditInput = input;
  let total: FileEdit[] = [];
  for (const step of steps) {
    const edits = step(current);
    if (edits.length === 0) continue;
    total = composeEdits(input.files, total, edits);
    current = { files: applyToTexts(input.files, total), entry: input.entry };
  }
  return total;
}

/** Edits of each file are disjoint (sorted, none overlapping or inserting at the same point). */
function disjoint(edits: FileEdit[]): boolean {
  const sorted = [...edits].sort((a, b) =>
    a.file < b.file ? -1 : a.file > b.file ? 1 : a.start - b.start || a.end - b.end,
  );
  for (let i = 1; i < sorted.length; i++) {
    const p = sorted[i - 1]!;
    const e = sorted[i]!;
    if (
      p.file === e.file &&
      e.start <= p.end &&
      !(e.start === p.end && p.start < p.end && e.start < e.end)
    )
      return false;
  }
  return true;
}

/**
 * Several independent edit steps (one per selected element) as one edit set over the original
 * texts: each step runs on the original input (one compile for all) when their edits are
 * disjoint, else one after the other (`chainEdits`).
 */
export function combineEdits(
  input: EditInput,
  steps: Array<(input: EditInput) => FileEdit[]>,
): FileEdit[] {
  const all = steps.flatMap((step) => step(input));
  return disjoint(all) ? all : chainEdits(input, steps);
}

/** `#abc` / `#AABBCC` → `#aabbcc`; anything else → null. */
export function normalizeColor(value: string): string | null {
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(v)) return v;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
  return short ? `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}` : null;
}

/**
 * A deletion that reaches the end of the file takes the blank lines the helpers write before a new
 * block (`\n\n<block>\n`) with it, so creating a block and removing it again gives the original
 * bytes back. One line break stays when anything is left (the file keeps ending with a newline).
 */
export function trimEofRemoval(text: string, edit: FileEdit): FileEdit {
  if (edit.newText !== '' || text.slice(edit.end).trim() !== '') return edit;
  let block = edit.start;
  while (block < edit.end && /\s/.test(text[block]!)) block++;
  let k = 0;
  while (block - k - 1 >= 0 && text[block - k - 1] === '\n') k++;
  const start = block - k;
  if (start > edit.start) return edit;
  return {
    ...edit,
    start,
    end: text.length,
    newText: start === 0 ? '' : '\n'.repeat(Math.max(1, k - 2)),
  };
}

/** Edits that all lie inside `[start, end)` of `file` (the element's own text). */
function inside(edits: FileEdit[], file: string, start: number, end: number): boolean {
  return edits.every((e) => e.file === file && e.start >= start && e.end <= end);
}

/** The element declaration starting at (or containing) `offset` in `file`. */
function declarationAt(
  compiler: Compiler,
  file: string,
  offset: number,
): ElementDeclarationNode | undefined {
  const ast = compiler.parse.ast(pathOf(file));
  const decls = ast.body.filter(
    (n): n is ElementDeclarationNode => n instanceof ElementDeclarationNode,
  );
  return (
    decls.find((d) => d.start === offset) ?? decls.find((d) => d.start <= offset && offset < d.end)
  );
}

/** Name parts of a declaration as written in its own file (`["core", "users"]`). */
function declaredName(compiler: Compiler, file: string, offset: number): string[] | null {
  const decl = declarationAt(compiler, file, offset);
  if (!decl?.name) return null;
  const source = compiler.parse.source(pathOf(file));
  const parts = splitQualifiedIdentifier(source.slice(decl.name.start, decl.name.end));
  return parts.length ? parts : null;
}

function findTable(model: DiagramModel, id: string): Table | undefined {
  return model.tables.find((t) => t.id === id);
}

const stripPrefix = (id: string, prefix: string) =>
  id.startsWith(prefix) ? id.slice(prefix.length) : id;

// ---------------------------------------------------------------------------------------------
// Sticky notes

/**
 * `note_1`, `note_2`, … (or `<base>_<n>`): the first name no sticky note of the model has (any
 * case), nor any of `alsoTaken`.
 */
export function uniqueNoteName(
  model: DiagramModel | null,
  base = 'note',
  alsoTaken: Iterable<string> = [],
): string {
  const taken = new Set((model?.stickyNotes ?? []).map((n) => n.name.toLowerCase()));
  for (const t of alsoTaken) taken.add(t.toLowerCase());
  for (let i = 1; ; i++) {
    const name = `${base}_${i}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
}

/** Appends `Note name [color: …] { '…' }` at the end of `file`. */
export function createStickyNote(
  input: EditInput,
  file: string,
  name: string,
  text: string,
  color?: string,
): FileEdit[] {
  let c: string | undefined;
  if (color !== undefined) {
    const n = normalizeColor(color);
    if (n === null) return [];
    c = n;
  }
  return run(input, file, (compiler, fp) => compiler.createStickyNoteEdit(fp, name, text, c));
}

function noteTarget(input: EditInput, noteName: string): { file: string; name: string } | null {
  const model = modelOf(input);
  const name = stripPrefix(noteName, 'note:');
  const note = model?.stickyNotes.find((n) => n.name === name);
  if (!note) return null;
  const compiler = compilerFor(input);
  const declared = declaredName(compiler, note.span.file, note.span.start.offset);
  return { file: note.span.file, name: declared?.join('.') ?? note.name };
}

/** Replaces the text of a sticky note (by name or `note:<name>` id), in the file declaring it. */
export function setStickyNoteText(input: EditInput, noteName: string, text: string): FileEdit[] {
  const t = noteTarget(input, noteName);
  if (!t) return [];
  return run(input, t.file, (c, fp) => c.setStickyNoteTextEdit(fp, t.name, text));
}

/**
 * Removes a sticky note with its whole lines, and from the DiagramViews that list it by name.
 * `[]` when other text still names it (a `Metadata Note` block, a `use { note … }` import): the
 * file would no longer compile, so that note is deleted in code.
 */
export function removeStickyNote(input: EditInput, noteName: string): FileEdit[] {
  const t = noteTarget(input, noteName);
  const model = modelOf(input);
  if (!t || !model) return [];
  const own = removeOwn(input, t);
  if (own.length === 0) return [];
  const id = `note:${stripPrefix(noteName, 'note:')}`;
  const views: ViewOp[] = model.views
    .filter((v) => !v.allNotes && v.noteIds.includes(id))
    .map((v) => ({ op: 'update', name: v.name, notes: v.noteIds.filter((n) => n !== id) }));
  const all = views.length
    ? chainEdits(input, [(i) => syncViews(i, views), (i) => removeOwn(i, t)])
    : own;
  const errors = (files: Record<string, string>) =>
    compileDbml({ files, entry: input.entry }).diagnostics.filter((d) => d.severity === 'error')
      .length;
  if (errors(applyToTexts(input.files, all)) > errors(input.files)) return [];
  return all;
}

function removeOwn(input: EditInput, t: { file: string; name: string }): FileEdit[] {
  const text = input.files[t.file] ?? '';
  return run(input, t.file, (c, fp) => c.removeStickyNoteEdit(fp, t.name)).map((e) =>
    trimEofRemoval(text, e),
  );
}

// ---------------------------------------------------------------------------------------------
// Settings: headercolor (tables), color (groups, notes, refs), inactive (refs)

const SETTINGS_BY_KIND: Record<ElementTarget['kind'], SettingName[]> = {
  table: ['headercolor'],
  group: ['color'],
  note: ['color'],
  ref: ['color', 'inactive'],
};

interface ResolvedTarget {
  file: string;
  /** Offsets of the element's own text: every edit must stay inside (no conversions). */
  start: number;
  end: number;
  /** Identifiers to try, in order (refs: endpoint spellings as seen from the ref's file). */
  identifiers: ElementIdentifier[];
  ref?: Ref;
}

function resolveTarget(input: EditInput, target: ElementTarget): ResolvedTarget | null {
  const model = modelOf(input);
  if (!model) return null;
  const compiler = compilerFor(input);
  if (target.kind === 'table') {
    const t = findTable(model, target.id);
    if (!t) return null;
    const parts = declaredName(compiler, t.span.file, t.span.start.offset) ?? [t.schema, t.name];
    const table = parts[parts.length - 1]!;
    const schema = parts.length > 1 ? parts[parts.length - 2] : undefined;
    return {
      file: t.span.file,
      start: t.span.start.offset,
      end: t.span.end.offset,
      identifiers: [{ kind: SymbolKind.Table, table, ...(schema ? { schema } : {}) }],
    };
  }
  if (target.kind === 'group') {
    const g = model.groups.find((x) => x.id === target.id || x.name === target.id);
    if (!g) return null;
    const parts = declaredName(compiler, g.span.file, g.span.start.offset) ?? [g.name];
    const name = parts[parts.length - 1]!;
    const schema = parts.length > 1 ? parts[parts.length - 2] : undefined;
    return {
      file: g.span.file,
      start: g.span.start.offset,
      end: g.span.end.offset,
      identifiers: [{ kind: SymbolKind.TableGroup, name, ...(schema ? { schema } : {}) }],
    };
  }
  if (target.kind === 'note') {
    const name = stripPrefix(target.id, 'note:');
    const n = model.stickyNotes.find((x) => x.name === name);
    if (!n) return null;
    const parts = declaredName(compiler, n.span.file, n.span.start.offset) ?? [n.name];
    return {
      file: n.span.file,
      start: n.span.start.offset,
      end: n.span.end.offset,
      identifiers: [{ kind: SymbolKind.StickyNote, name: parts.join('.') }],
    };
  }
  const ref = model.refs.find((r) => r.id === target.id);
  // Partial refs have no declaration of their own; `#<n>` ids share their endpoints with another
  // ref, so the helper could change the wrong one.
  if (!ref || ref.fromPartial !== null || ref.id.includes('#')) return null;
  // An inline ref (`[ref: > users.id]`) sits inside its table's declaration: no settings list.
  const decl = declarationAt(compiler, ref.span.file, ref.span.start.offset);
  if (decl?.type?.value.toLowerCase() !== 'ref') return null;
  const spellings = (tableId: string): EndpointRef[] => {
    const t = findTable(model, tableId);
    if (!t) return [];
    const out: EndpointRef[] = [{ schemaName: t.schema, tableName: t.name }];
    const parts = declaredName(compiler, t.span.file, t.span.start.offset);
    if (parts) {
      const name = parts[parts.length - 1]!;
      const schema = parts.length > 1 ? parts[parts.length - 2]! : t.schema;
      if (name !== t.name || schema !== t.schema) out.push({ schemaName: schema, tableName: name });
    }
    return out;
  };
  const identifiers: ElementIdentifier[] = [];
  for (const a of spellings(ref.from.tableId)) {
    for (const b of spellings(ref.to.tableId)) {
      identifiers.push({
        kind: MetadataKind.Ref,
        endpoints: [
          { ...a, fieldNames: ref.from.columns },
          { ...b, fieldNames: ref.to.columns },
        ],
      });
    }
  }
  return {
    file: ref.span.file,
    start: ref.span.start.offset,
    end: ref.span.end.offset,
    identifiers,
    ref,
  };
}

/** The parser value for a setting: `undefined` writes a bare flag (`[inactive]`). */
function settingValue(setting: SettingName, value: string | null): string | null | undefined {
  if (value === null) return null;
  if (setting === 'inactive') return undefined;
  return normalizeColor(value) ?? null;
}

/** The value the diagram shows for a setting (after partials and Metadata blocks), as written. */
function effectiveOf(
  model: DiagramModel | null,
  target: ElementTarget,
  setting: SettingName,
): string | boolean | null | undefined {
  if (!model) return undefined;
  if (target.kind === 'table') return findTable(model, target.id)?.headerColor;
  if (target.kind === 'group')
    return model.groups.find((g) => g.id === target.id || g.name === target.id)?.color;
  if (target.kind === 'note') {
    const name = stripPrefix(target.id, 'note:');
    return model.stickyNotes.find((n) => n.name === name)?.color;
  }
  const ref = model.refs.find((r) => r.id === target.id);
  if (!ref) return undefined;
  return setting === 'inactive' ? ref.inactive : ref.color;
}

/** Removing a Metadata entry leaves its indentation behind: take the blank line with it. */
function wholeBlankLine(text: string, e: FileEdit): FileEdit {
  if (e.newText !== '') return e;
  const lineStart = text.lastIndexOf('\n', e.start - 1) + 1;
  const nl = text.indexOf('\n', e.end);
  const lineEnd = nl === -1 ? text.length : nl;
  if (text.slice(lineStart, e.start).trim() !== '' || text.slice(e.end, lineEnd).trim() !== '')
    return e;
  return { ...e, start: lineStart, end: nl === -1 ? lineEnd : nl + 1 };
}

function rawSettingEdits(
  input: EditInput,
  target: ElementTarget,
  setting: SettingName,
  value: string | null,
  verify: boolean,
): FileEdit[] {
  if (!SETTINGS_BY_KIND[target.kind].includes(setting)) return [];
  if (value !== null && setting !== 'inactive' && normalizeColor(value) === null) return [];
  const resolved = resolveTarget(input, target);
  if (!resolved) return [];
  const v = settingValue(setting, value);
  const compiler = compilerFor(input);
  const want = setting === 'inactive' ? value !== null : (v ?? null);
  let before: ReturnType<typeof effectiveOf>;
  const shown = (edits: FileEdit[]) =>
    effectiveOf(
      compileDbml({ files: applyToTexts(input.files, edits), entry: input.entry }).model,
      target,
      setting,
    );
  for (const id of resolved.identifiers) {
    let own = run(
      input,
      resolved.file,
      (c, fp) => c.updateElementSettingEdit(fp, id, setting, v),
      compiler,
    );
    // An inline ref has no settings list: the helper would move it out into a new `Ref:` line.
    if (!inside(own, resolved.file, resolved.start, resolved.end)) own = [];
    if (!verify) {
      if (own.length) return own;
      continue;
    }
    // A `Metadata` block in the same file sets the value over the element's own settings.
    let meta: FileEdit[] = [];
    let both: FileEdit[] = [];
    if (setting !== 'inactive' && hasMetadata(compiler, resolved.file, id)) {
      const metaOf = (files: Record<string, string>) => {
        const text = files[resolved.file] ?? '';
        return run({ files, entry: input.entry }, resolved.file, (c, fp) =>
          c.updateElementMetadataEdit(
            fp,
            id,
            setting,
            v == null ? null : ({ value: v, type: 'color' } as never),
          ),
        ).map((e) => wholeBlankLine(text, e));
      };
      meta = metaOf(input.files);
      if (own.length) {
        const second = metaOf(applyToTexts(input.files, own));
        if (second.length) both = composeEdits(input.files, own, second);
      }
    } else if (resolved.ref === undefined && own.length) {
      // Tables, groups and notes are found by their own declaration: nothing to verify.
      return own;
    }
    const candidates = [own, meta, both].filter((c) => c.length > 0);
    if (candidates.length === 0) continue;
    before ??= effectiveOf(modelOf(input), target, setting);
    const results = candidates.map((c) => ({ c, now: shown(c) }));
    // Set: the diagram shows the value. Remove: it shows no value, or at least another one (a
    // TablePartial's colour shows through).
    const hit =
      results.find((r) => r.now === want) ??
      (value === null && setting !== 'inactive'
        ? results.find((r) => r.now !== undefined && r.now !== before)
        : undefined);
    if (hit) return hit.c;
  }
  return [];
}

function hasMetadata(compiler: Compiler, file: string, id: ElementIdentifier): boolean {
  try {
    return compiler.findMetadataBlock(pathOf(file), id) !== undefined;
  } catch {
    return false;
  }
}

/**
 * Sets (`value`) or removes (`null`) `headercolor` on a table, `color` on a group, note or ref, or
 * `inactive` on a ref (any non-null value marks it inactive). Colours are written `#rrggbb`
 * lowercase. `[]` when the element cannot be edited this way (see `canEdit`) or nothing changes.
 */
export function setSetting(
  input: EditInput,
  target: ElementTarget,
  setting: SettingName,
  value: string | null,
): FileEdit[] {
  return rawSettingEdits(input, target, setting, value, true);
}

/** Whether `setSetting` can change this setting of this element (menus disable the item if not). */
export function canEdit(input: EditInput, target: ElementTarget, setting: SettingName): boolean {
  if (!SETTINGS_BY_KIND[target.kind].includes(setting)) return false;
  const probe = setting === 'inactive' ? 'true' : '#010203';
  if (rawSettingEdits(input, target, setting, probe, false).length > 0) return true;
  // Already set to the probe value (or inactive already): removing must work then.
  return rawSettingEdits(input, target, setting, null, false).length > 0;
}

/** The setting name a colour change uses for an element kind. */
export function colorSettingOf(kind: ElementTarget['kind']): 'headercolor' | 'color' {
  return kind === 'table' ? 'headercolor' : 'color';
}

// ---------------------------------------------------------------------------------------------
// DiagramViews

type Entities = NonNullable<DiagramViewSyncOperation['visibleEntities']>;

/** The `Tables { … }` entries of a view as written (import aliases kept), or null. */
function writtenTables(
  compiler: Compiler,
  file: string,
  offset: number,
): Array<{ name: string; schemaName: string }> | null {
  const decl = declarationAt(compiler, file, offset);
  if (!(decl?.body instanceof BlockExpressionNode)) return null;
  const source = compiler.parse.source(pathOf(file));
  const out: Array<{ name: string; schemaName: string }> = [];
  for (const sub of decl.body.body) {
    if (!(sub instanceof ElementDeclarationNode)) continue;
    if (sub.type?.value.toLowerCase() !== 'tables') continue;
    if (!(sub.body instanceof BlockExpressionNode)) continue;
    for (const entry of sub.body.body) {
      if (!(entry instanceof FunctionApplicationNode) || !entry.callee) return null;
      if (entry.callee instanceof WildcardNode) continue;
      const parts = splitQualifiedIdentifier(source.slice(entry.callee.start, entry.callee.end));
      if (parts.length === 1) out.push({ name: parts[0]!, schemaName: 'public' });
      else if (parts.length === 2) out.push({ name: parts[1]!, schemaName: parts[0]! });
      else return null;
    }
  }
  return out;
}

/** The view's visible entities as the parser reads them (tri-state: null none, [] all). */
function currentEntities(compiler: Compiler, file: string, name: string): Entities | null {
  try {
    const db = compiler.interpretFile(pathOf(file)).getValue();
    const view = db?.diagramViews.find((v) => v.name === name);
    if (!view) return null;
    const ve = view.visibleEntities;
    let tables = ve.tables
      ? ve.tables.map((t) => ({ name: t.name, schemaName: t.schemaName }))
      : null;
    if (tables && tables.length > 0) {
      const written = writtenTables(compiler, file, view.token.start.offset);
      if (written && written.length === tables.length) tables = written;
    }
    const out: Entities = {
      tables,
      stickyNotes: ve.stickyNotes ? ve.stickyNotes.map((n) => ({ name: n.name })) : null,
      tableGroups: ve.tableGroups ? ve.tableGroups.map((g) => ({ name: g.name })) : null,
      schemas: ve.schemas ? ve.schemas.map((s) => ({ name: s.name })) : null,
    };
    // Tables, TableGroups and Schemas are one dimension: once one of them lists items, the
    // parser reports the others as `[]`, which then means "nothing", not "all".
    const dim = [out.tables, out.tableGroups, out.schemas];
    if (dim.some((d) => d !== null && d !== undefined && d.length > 0)) {
      if (out.tables?.length === 0) out.tables = null;
      if (out.tableGroups?.length === 0) out.tableGroups = null;
      if (out.schemas?.length === 0) out.schemas = null;
    }
    return out;
  } catch {
    return null;
  }
}

function tableEntry(model: DiagramModel, id: string): { name: string; schemaName: string } | null {
  const t = findTable(model, id);
  return t ? { name: t.name, schemaName: t.schema } : null;
}

/** ViewOp lists → parser entities (only the fields the op sets). */
function opEntities(model: DiagramModel, op: ViewOp): Partial<Entities> {
  const out: Partial<Entities> = {};
  const list = <T>(items: T[]): T[] | null => (items.length ? items : null);
  if (op.tables !== undefined) {
    out.tables =
      op.tables === '*'
        ? []
        : list(op.tables.map((id) => tableEntry(model, id)).filter((x) => x !== null));
  }
  if (op.notes !== undefined) {
    out.stickyNotes =
      op.notes === '*' ? [] : list(op.notes.map((n) => ({ name: stripPrefix(n, 'note:') })));
  }
  if (op.groups !== undefined)
    out.tableGroups = list(op.groups.map((g) => ({ name: stripPrefix(g, 'group:') })));
  if (op.schemas !== undefined) out.schemas = list(op.schemas.map((s) => ({ name: s })));
  return out;
}

/**
 * The generator writes `Tables { * }` only when tables, groups and schemas are all "all" (`[]`),
 * and an all-tables view shows every table whatever the groups and schemas say.
 */
function normalizeEntities(e: Entities): Entities {
  if (e.tables && e.tables.length === 0) return { ...e, tableGroups: [], schemas: [] };
  return e;
}

/**
 * Creates, updates (rename and/or new contents) or deletes DiagramViews with `syncDiagramView`,
 * in the file declaring each view (new views: the entry file). Fields an update omits keep their
 * current value.
 */
export function syncViews(input: EditInput, ops: ViewOp[]): FileEdit[] {
  const model = modelOf(input);
  if (!model) return [];
  const compiler = compilerFor(input);
  const byFile = new Map<string, DiagramViewSyncOperation[]>();
  for (const op of ops) {
    const existing = model.views.find((v) => v.name === op.name);
    if (op.op !== 'create' && !existing) continue;
    if (op.op === 'create' && existing) continue;
    const file = existing?.span.file ?? input.entry;
    let sync: DiagramViewSyncOperation;
    if (op.op === 'delete') sync = { operation: 'delete', name: op.name };
    else {
      const base: Entities =
        op.op === 'update'
          ? (currentEntities(compiler, file, op.name) ?? {
              tables: null,
              stickyNotes: null,
              tableGroups: null,
              schemas: null,
            })
          : { tables: null, stickyNotes: null, tableGroups: null, schemas: null };
      const visibleEntities = normalizeEntities({ ...base, ...opEntities(model, op) });
      sync = {
        operation: op.op,
        name: op.name,
        ...(op.newName && op.newName !== op.name ? { newName: op.newName } : {}),
        visibleEntities,
      };
    }
    byFile.set(file, [...(byFile.get(file) ?? []), sync]);
  }
  const out: FileEdit[] = [];
  for (const [file, list] of byFile) {
    const text = input.files[file] ?? '';
    const edits = run(input, file, (c, fp) => c.syncDiagramView(fp, list).edits, compiler);
    out.push(...edits.map((e) => trimEofRemoval(text, e)));
  }
  return out;
}
