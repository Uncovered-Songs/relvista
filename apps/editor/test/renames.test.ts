import { compileDbml, type DiagramModel } from '@relvista/core';
import { describe, expect, it } from 'vitest';
import { detectRenames } from '../src/state/renames.js';

const model = (src: string): DiagramModel => {
  const r = compileDbml(src);
  if (!r.model) throw new Error(JSON.stringify(r.diagnostics));
  return r.model;
};

describe('detectRenames', () => {
  it('pairs a renamed table by declaration line', () => {
    const a = model('Table users {\n  id int\n}\nTable posts {\n  id int\n}\n');
    const b = model('Table members {\n  id int\n}\nTable posts {\n  id int\n}\n');
    expect(detectRenames(a, b)).toEqual([['public.users', 'public.members']]);
  });
  it('pairs by column list when the line moved', () => {
    const a = model('Table users {\n  id int\n  email text\n}\n');
    const b = model('// moved\n\nTable members {\n  id int\n  email text\n}\n');
    expect(detectRenames(a, b)).toEqual([['public.users', 'public.members']]);
  });
  it('ambiguous column lists are not renames', () => {
    const a = model('Table a {\n  id int\n}\nTable b {\n  id int\n}\n');
    const b = model('\n\n\n\n\n\nTable c {\n  id int\n}\nTable d {\n  id int\n}\n');
    expect(detectRenames(a, b)).toEqual([]);
  });
  it('typing a name char by char keeps pairing step to step', () => {
    let prev = model('Table u {\n  id int\n}\n');
    let id = 'public.u';
    for (const name of ['us', 'use', 'user', 'users']) {
      const next = model(`Table ${name} {\n  id int\n}\n`);
      const pairs = detectRenames(prev, next);
      expect(pairs).toEqual([[id, `public.${name}`]]);
      id = `public.${name}`;
      prev = next;
    }
  });
  it('notes and groups', () => {
    const a = model("Table t {\n  id int\n}\nTableGroup g1 {\n  t\n}\nNote n1 {\n  'hi'\n}\n");
    const b = model("Table t {\n  id int\n}\nTableGroup g2 {\n  t\n}\nNote n2 {\n  'hi'\n}\n");
    expect(detectRenames(a, b)).toEqual([
      ['note:n1', 'note:n2'],
      ['group:g1', 'group:g2'],
    ]);
  });
  it('no previous model → nothing', () => {
    expect(detectRenames(null, model('Table a {\n id int\n}'))).toEqual([]);
  });
});
