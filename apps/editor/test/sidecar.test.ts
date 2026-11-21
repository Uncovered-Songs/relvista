import { emptyLayout, serializeLayout } from '@relvista/core';
import { describe, expect, it } from 'vitest';
import { dbmlKeyOfSidecar, pairSidecars, parseSidecar, sidecarKey } from '../src/files/sidecar.js';

describe('sidecar naming', () => {
  it('names', () => {
    expect(sidecarKey('schema.dbml')).toBe('schema.dbml.layout.json');
    expect(sidecarKey('db/main.dbml')).toBe('db/main.dbml.layout.json');
    expect(dbmlKeyOfSidecar('schema.dbml.layout.json')).toBe('schema.dbml');
    expect(dbmlKeyOfSidecar('schema.layout.json')).toBeNull();
    expect(dbmlKeyOfSidecar('x.json')).toBeNull();
  });
  it('pairs picked files', () => {
    const r = pairSidecars(['a.dbml', 'a.dbml.layout.json', 'b.dbml', 'c.dbml.layout.json']);
    expect(r.dbml).toEqual(['a.dbml', 'b.dbml']);
    expect([...r.sidecarOf]).toEqual([['a.dbml', 'a.dbml.layout.json']]);
    expect(r.orphans).toEqual(['c.dbml.layout.json']);
  });
  it('matches the .dbml extension in any case, the sidecar suffix as written', () => {
    expect(dbmlKeyOfSidecar('Schema.DBML.layout.json')).toBe('Schema.DBML');
    expect(sidecarKey('Schema.DBML')).toBe('Schema.DBML.layout.json');
    expect(dbmlKeyOfSidecar('Schema.dbml.LAYOUT.JSON')).toBeNull();
    const r = pairSidecars(['p/Schema.DBML', 'p/Schema.DBML.layout.json']);
    expect(r.dbml).toEqual(['p/Schema.DBML']);
    expect([...r.sidecarOf]).toEqual([['p/Schema.DBML', 'p/Schema.DBML.layout.json']]);
    expect(r.orphans).toEqual([]);
  });
  it('parses valid and reports invalid', () => {
    const ok = parseSidecar(serializeLayout(emptyLayout()));
    expect(ok.ok).toBe(true);
    const bad = parseSidecar('{"version": 2, "views": {}}');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/version|\(root\)/);
    const notJson = parseSidecar('{');
    expect(notJson.ok).toBe(false);
    if (!notJson.ok) expect(notJson.error).toMatch(/not valid JSON/);
  });
});
