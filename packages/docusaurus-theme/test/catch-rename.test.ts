import { transformSync } from '@babel/core';
import { describe, expect, it } from 'vitest';
import { renameShadowingCatchParams } from '../src/loaders/catch-rename.js';

const transform = (code: string) =>
  transformSync(code, { babelrc: false, configFile: false, plugins: [renameShadowingCatchParams] })!
    .code!;

describe('renameShadowingCatchParams', () => {
  it('renames a catch parameter that shadows an outer binding, with its references', () => {
    const out = transform(`function f(e) {
  let t = () => e;
  try { g(); } catch (t) { if (!(t instanceof Error)) throw t; }
  return t();
}`);
    expect(out).toMatch(/catch \(_t\d*\)/);
    expect(out).toMatch(/_t\d* instanceof Error/);
    expect(out).toMatch(/throw _t\d*;/);
    expect(out).toContain('return t();');
  });

  it('leaves other catch parameters alone', () => {
    const out = transform(`function f() { try { g(); } catch (err) { return err; } }`);
    expect(out).toContain('catch (err)');
  });

  it('keeps behaviour', () => {
    const code = `function f() {
  let t = () => 'made';
  try { throw new Error('x'); } catch (t) { if (!(t instanceof Error)) throw t; }
  return t();
}
f();`;
    expect(eval(transform(code))).toBe('made');
  });
});
