import { describe, expect, it } from 'vitest';
import { CONTRAST_CHECKED, TOKEN_COLORS, contrastRatio, themeData } from '../src/monaco/themes.js';

describe('themes', () => {
  for (const mode of ['light', 'dark'] as const) {
    it(`${mode}: every token colour ≥ 4.5:1 on the background`, () => {
      const c = TOKEN_COLORS[mode];
      for (const k of CONTRAST_CHECKED) {
        expect(contrastRatio(c[k], c.background), `${mode} ${k} ${c[k]}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    });
    it(`${mode}: theme rules cover the grammar's token types`, () => {
      const tokens = themeData(mode).rules.map((r) => r.token);
      for (const t of [
        'keyword',
        'identifier',
        'string',
        'string.escape',
        'comment',
        'number',
        'number.hex',
        'operators',
        'delimiter',
        'keyword.wildcard',
        '@bracket',
      ]) {
        expect(tokens).toContain(`${t}.dbml`);
      }
    });
  }
  it('backgrounds match the renderer UI solid colour', () => {
    expect(TOKEN_COLORS.light.background).toBe('#ffffff');
    expect(TOKEN_COLORS.dark.background).toBe('#1a1f28');
  });
});
