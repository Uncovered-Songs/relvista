/**
 * Rename detection between two good models, so a renamed table keeps its saved position
 * (design §4.2). Pure.
 *
 * Per kind (table / note / group): ids that disappeared and ids that appeared in the same compile.
 * A pair is made when exactly one candidate shares `span.file` and `span.start.line`; otherwise
 * when exactly one shares the same column-name list (tables). Anything else is not a rename.
 */
import type { DiagramModel, SourceSpan } from '@relvista/core';

interface Node {
  id: string;
  span: SourceSpan;
  columns?: string;
}

function nodesOf(model: DiagramModel): Record<'table' | 'note' | 'group', Node[]> {
  return {
    table: model.tables.map((t) => ({
      id: t.id,
      span: t.span,
      columns: t.columns
        .filter((c) => c.fromPartial === null)
        .map((c) => c.name)
        .join('\u0000'),
    })),
    note: model.stickyNotes.map((n) => ({ id: n.id, span: n.span })),
    group: model.groups.map((g) => ({ id: g.id, span: g.span })),
  };
}

function pairKind(prev: Node[], next: Node[]): Array<[string, string]> {
  const nextIds = new Set(next.map((n) => n.id));
  const prevIds = new Set(prev.map((n) => n.id));
  const gone = prev.filter((n) => !nextIds.has(n.id));
  const added = next.filter((n) => !prevIds.has(n.id));
  if (gone.length === 0 || added.length === 0) return [];
  const pairs: Array<[string, string]> = [];
  const usedAdded = new Set<string>();
  const usedGone = new Set<string>();
  const sameLine = (a: Node, b: Node) =>
    a.span.file === b.span.file && a.span.start.line === b.span.start.line;
  for (const g of gone) {
    const cands = added.filter((a) => sameLine(g, a));
    if (cands.length !== 1) continue;
    const a = cands[0]!;
    // The candidate must also be unambiguous from its side.
    if (gone.filter((x) => sameLine(x, a)).length !== 1) continue;
    pairs.push([g.id, a.id]);
    usedAdded.add(a.id);
    usedGone.add(g.id);
  }
  for (const g of gone) {
    if (usedGone.has(g.id) || g.columns === undefined || g.columns === '') continue;
    const cands = added.filter((a) => !usedAdded.has(a.id) && a.columns === g.columns);
    if (cands.length !== 1) continue;
    const a = cands[0]!;
    if (gone.filter((x) => !usedGone.has(x.id) && x.columns === a.columns).length !== 1) continue;
    pairs.push([g.id, a.id]);
    usedAdded.add(a.id);
    usedGone.add(g.id);
  }
  return pairs;
}

/** `[oldId, newId]` pairs, tables first, then notes, then groups. */
export function detectRenames(
  prev: DiagramModel | null,
  next: DiagramModel | null,
): Array<[string, string]> {
  if (!prev || !next) return [];
  const a = nodesOf(prev);
  const b = nodesOf(next);
  return [
    ...pairKind(a.table, b.table),
    ...pairKind(a.note, b.note),
    ...pairKind(a.group, b.group),
  ];
}
