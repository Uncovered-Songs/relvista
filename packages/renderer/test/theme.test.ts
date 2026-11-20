import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PALETTES,
  contrastText,
  cssVarName,
  parseHex,
  safeColor,
  type PaletteKey,
} from '../src/theme.js';

const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

function block(selectorStart: string): string {
  const i = css.indexOf(selectorStart);
  expect(i).toBeGreaterThanOrEqual(0);
  const open = css.indexOf('{', i);
  return css.slice(open + 1, css.indexOf('}', open));
}

const norm = (v: string) =>
  v
    .replace(/\s+/g, '')
    .replace(/0\.10\)/, '0.1)')
    .toLowerCase();

describe('styles.css palettes match theme.ts', () => {
  it.each([
    ['light', '.rv-viewer,'],
    ['dark', "[data-rv-color-mode='dark'] {"],
  ] as const)('%s', (mode, selector) => {
    const body = block(selector);
    for (const key of Object.keys(PALETTES[mode]) as PaletteKey[]) {
      const m = new RegExp(`${cssVarName(key)}:\\s*([^;]+);`).exec(body);
      expect(m, `${mode} ${cssVarName(key)}`).not.toBeNull();
      expect(norm(m![1]!)).toBe(norm(PALETTES[mode][key]));
    }
  });
});

describe('colour helpers', () => {
  it('parses hex colours', () => {
    expect(parseHex('#fff')).toEqual({ r: 255, g: 255, b: 255 });
    expect(parseHex('#3498DB')).toEqual({ r: 52, g: 152, b: 219 });
    expect(parseHex('red')).toBeNull();
  });
  it('picks readable text', () => {
    expect(contrastText({ r: 255, g: 255, b: 0 })).toBe('#1b2230');
    expect(contrastText({ r: 20, g: 40, b: 90 })).toBe('#ffffff');
  });
  it('rejects unsafe colour strings', () => {
    expect(safeColor('#abc')).toBe('#abc');
    expect(safeColor('red')).toBe('red');
    expect(safeColor('red;} svg{display:none')).toBeNull();
    expect(safeColor('url(#x)')).toBeNull();
  });
});
