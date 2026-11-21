import { compileDbml, type DiagramModel } from '@relvista/core';
import { describe, expect, it } from 'vitest';
import { dottedNameAt, fallbackHover } from '../src/monaco/hover.js';

const SRC = `Table users {
  id int [pk]
}

Table auth.users {
  id uuid [pk]
}

Table user_links {
  user_id integer [pk, ref: - users.id]
  auth_user_id uuid [ref: > auth.users.id]
}
`;

const model = compileDbml({ files: { 'main.dbml': SRC }, entry: 'main.dbml' })
  .model as DiagramModel;
const lines = SRC.split('\n');

/** Hover at the first occurrence of `word` (after `after`) on 1-based `line`. */
function hover(line: number, word: string, after = 0): string | null {
  const text = lines[line - 1]!;
  const col = text.indexOf(word, after) + 1;
  expect(col).toBeGreaterThan(0);
  return fallbackHover(model, 'main.dbml', line, text, col);
}

describe('dottedNameAt', () => {
  it('splits a dotted name and finds the hovered part', () => {
    expect(dottedNameAt('[ref: > auth.users.id]', 13)).toEqual({
      parts: ['auth', 'users', 'id'],
      hovered: 1,
    });
    expect(dottedNameAt('a."b.c".d e', 3)).toEqual({ parts: ['a', 'b.c', 'd'], hovered: 1 });
    expect(dottedNameAt('a  b', 2)).toBeNull();
  });
});

describe('fallbackHover', () => {
  it('a column name shows that column', () => {
    expect(hover(10, 'user_id')).toMatch(/^\*\*public\\\.user\\_links\.user\\_id\*\*/);
  });
  it('a ref target shows the target, not the column declared on the line', () => {
    expect(hover(10, 'users', 20)).toMatch(/^\*\*public\\\.users\*\*/);
    expect(hover(10, 'id', 30)).toMatch(/^\*\*public\\\.users\.id\*\* int/);
    expect(hover(11, 'auth', 15)).toBeNull(); // a schema alone
    expect(hover(11, 'users', 15)).toMatch(/^\*\*auth\\\.users\*\*/);
    expect(hover(11, 'id', 30)).toMatch(/^\*\*auth\\\.users\.id\*\* uuid/);
  });
  it('other words on a column line show nothing', () => {
    expect(hover(10, 'integer')).toBeNull();
    expect(hover(10, 'pk')).toBeNull();
  });
});
