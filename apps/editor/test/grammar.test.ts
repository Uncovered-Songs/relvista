// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type * as Monaco from 'monaco-editor/editor/editor.api';

let monaco: typeof Monaco;

beforeAll(async () => {
  // jsdom lacks these two; Monaco's theme service needs them even for tokenize().
  (globalThis as { CSS?: unknown }).CSS ??= {
    escape: (s: string) => s.replace(/[^\w-]/g, (c) => `\\${c}`),
  };
  window.matchMedia ??= (() => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  })) as unknown as typeof window.matchMedia;
  monaco = await import('monaco-editor/editor/editor.api');
  const { registerDbmlLanguage } = await import('../src/monaco/dbmlLanguage.js');
  registerDbmlLanguage(monaco);
}, 60_000);

function tokens(text: string): Array<[string, string]> {
  const lines = text.split('\n');
  return monaco.editor.tokenize(text, 'dbml').flatMap((line, i) =>
    line.map((t, j) => {
      const end = j + 1 < line.length ? line[j + 1]!.offset : lines[i]!.length;
      return [lines[i]!.slice(t.offset, end), t.type] as [string, string];
    }),
  );
}

const typeOf = (text: string, word: string) => tokens(text).find(([w]) => w.includes(word))?.[1];

describe('DBML grammar (official, via Monaco)', () => {
  it('element keywords', () => {
    for (const kw of [
      'Project',
      'Table',
      'Enum',
      'TableGroup',
      'TablePartial',
      'Note',
      'Records',
      'DiagramView',
    ]) {
      expect(typeOf(`${kw} x {\n}`, kw), kw).toBe('keyword.dbml');
    }
    expect(typeOf("use * from './a'", 'use')).toBe('keyword.dbml');
    expect(typeOf('Ref: a.id > b.id', 'Ref')).toBe('keyword.dbml');
  });
  it('comments, strings, backticks, numbers, hex', () => {
    expect(typeOf('// c', '// c')).toBe('comment.dbml');
    expect(typeOf('/* block */', 'block')).toBe('comment.dbml');
    expect(typeOf("Note: 'hi'", "'hi'")).toBe('string.dbml');
    expect(typeOf("Note: '''multi'''", 'multi')).toBe('string.dbml');
    expect(typeOf('id int [default: `now()`]', 'now')).toBe('string.dbml');
    expect(typeOf('x int [default: 42]', '42')).toBe('number.dbml');
    expect(typeOf('Table t [headercolor: #3498DB] {\n}', '#3498DB')).toBe('number.hex.dbml');
  });
  it('settings, operators, wildcard', () => {
    expect(typeOf('id int [pk, increment]', 'pk')).toBe('keyword.dbml');
    expect(typeOf('Ref: a.id > b.id', '>')).toBe('operators.dbml');
    expect(typeOf('DiagramView v {\n  Tables { * }\n}', '*')).toBe('keyword.wildcard.dbml');
  });
});
