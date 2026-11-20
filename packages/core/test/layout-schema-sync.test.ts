import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { layoutSchema } from '../src/layout/index.js';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const canonical = read('../../../schemas/layout.schema.json');

describe('layout schema copies (run `pnpm -C packages/core sync-schema` if this fails)', () => {
  it('packages/core/layout.schema.json is byte-identical to schemas/layout.schema.json', () => {
    expect(read('../layout.schema.json')).toBe(canonical);
  });

  it('the embedded TS schema equals the canonical schema', () => {
    expect(layoutSchema).toEqual(JSON.parse(canonical));
  });
});
