import { compileDbml, type DiagramModel } from '@relvista/core';
import { describe, expect, it } from 'vitest';
import { nodeAtPosition, rangeToSpan, spanToRange } from '../src/monaco/positions.js';

const SRC = `TablePartial base {
  created_at timestamp
}

Table users {
  id int [pk]
  ~base
}

TableGroup core {
  users
}

Note todo {
  'later'
}
`;

describe('positions', () => {
  const model = compileDbml({ files: { 'main.dbml': SRC }, entry: 'main.dbml' })
    .model as DiagramModel;
  it('span ↔ range', () => {
    const t = model.tables[0]!;
    const r = spanToRange(t.span);
    expect(r.startLineNumber).toBe(5);
    expect(r.startColumn).toBe(1);
    expect(rangeToSpan('main.dbml', r).start.line).toBe(5);
  });
  it('finds the table, note and group around a position', () => {
    expect(nodeAtPosition(model, 'main.dbml', { lineNumber: 6, column: 5 })).toBe('public.users');
    expect(nodeAtPosition(model, 'main.dbml', { lineNumber: 5, column: 1 })).toBe('public.users');
    expect(nodeAtPosition(model, 'main.dbml', { lineNumber: 11, column: 3 })).toBe('group:core');
    expect(nodeAtPosition(model, 'main.dbml', { lineNumber: 15, column: 3 })).toBe('note:todo');
  });
  it('partial blocks and blank lines are not a node', () => {
    expect(nodeAtPosition(model, 'main.dbml', { lineNumber: 2, column: 3 })).toBeNull();
    expect(nodeAtPosition(model, 'main.dbml', { lineNumber: 4, column: 1 })).toBeNull();
  });
  it('multi-file: only the file of the span', () => {
    const r = compileDbml({
      files: {
        'main.dbml': "use * from './b'\n\nTable a {\n  id int\n}\n",
        'b.dbml': 'Table b {\n  id int\n}\n',
      },
      entry: 'main.dbml',
    });
    expect(r.model).not.toBeNull();
    expect(nodeAtPosition(r.model, 'b.dbml', { lineNumber: 2, column: 3 })).toBe('public.b');
    expect(nodeAtPosition(r.model, 'main.dbml', { lineNumber: 2, column: 1 })).toBeNull();
    expect(nodeAtPosition(r.model, 'main.dbml', { lineNumber: 4, column: 1 })).toBe('public.a');
  });
  it('null model', () => {
    expect(nodeAtPosition(null, 'x', { lineNumber: 1, column: 1 })).toBeNull();
  });
});
