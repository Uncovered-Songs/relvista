import type {
  Check as ParserCheck,
  Column as ParserColumn,
  Index as ParserIndex,
  Table as ParserTable,
  TablePartial as ParserTablePartial,
} from '@dbml/parse';

export interface Sourced<T> {
  item: T;
  fromPartial: string | null;
}

export interface ExpandedTable {
  fields: Sourced<ParserColumn>[];
  indexes: Sourced<ParserIndex>[];
  checks: Sourced<ParserCheck>[];
  note: string | null;
  headerColor: string | null;
}

/**
 * Merges `~partial` injections into a table. `@dbml/parse` only records the injection
 * (`{ name, order }`); this is a port of `@dbml/core`'s `Table.processPartials` so the result
 * matches what dbdiagram.io shows:
 *
 * - `order` is the injection's index among the table body's fields and injections;
 * - the table's own fields always win; among partials, the later injection wins;
 * - `note` / `headerColor` come from the latest partial that sets them unless the table sets them;
 * - partial indexes and checks are appended (later partials first, as `@dbml/core` does), and
 *   named partial checks are prefixed with `<table>.`.
 */
export function expandPartials(
  table: ParserTable,
  findPartial: (name: string) => ParserTablePartial | undefined,
): ExpandedTable {
  type Slot = Sourced<ParserColumn> | { placeholder: true };
  const slots: Slot[] = table.fields.map((item) => ({ item, fromPartial: null }));
  const indexes: Sourced<ParserIndex>[] = table.indexes.map((item) => ({
    item,
    fromPartial: null,
  }));
  const checks: Sourced<ParserCheck>[] = table.checks.map((item) => ({ item, fromPartial: null }));
  let note = table.note?.value ?? null;
  let headerColor = colorOrNull(table.headerColor);

  if (table.partials.length > 0) {
    const taken = new Set(table.fields.map((f) => f.name));
    let noteSet = note !== null;
    let colorSet = headerColor !== null;
    const ascending = [...table.partials].sort((a, b) => a.order - b.order);
    for (const injection of ascending) slots.splice(injection.order, 0, { placeholder: true });

    for (const injection of [...ascending].reverse()) {
      const partial = findPartial(injection.name);
      const injected: Sourced<ParserColumn>[] = [];
      if (partial) {
        for (const field of partial.fields) {
          if (taken.has(field.name)) continue;
          taken.add(field.name);
          injected.push({ item: field, fromPartial: partial.name });
        }
      }
      slots.splice(injection.order, 1, ...injected);
      if (!partial) continue;
      if (!noteSet && partial.note?.value !== undefined) {
        note = partial.note.value;
        noteSet = true;
      }
      const partialColor = colorOrNull(partial.headerColor);
      if (!colorSet && partialColor !== null) {
        headerColor = partialColor;
        colorSet = true;
      }
      for (const index of partial.indexes) indexes.push({ item: index, fromPartial: partial.name });
      for (const check of partial.checks) {
        const named =
          check.name !== undefined ? { ...check, name: `${table.name}.${check.name}` } : check;
        checks.push({ item: named, fromPartial: partial.name });
      }
    }
  }

  const fields = slots.filter((s): s is Sourced<ParserColumn> => !('placeholder' in s));
  return { fields, indexes, checks, note, headerColor };
}

/** `@dbml/parse` uses the literal `none` for an explicitly removed colour. */
export function colorOrNull(color: string | undefined): string | null {
  return color === undefined || color === 'none' ? null : color;
}
