import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PALETTES,
  colorResolver,
  contrastRatio,
  contrastText,
  cssVarName,
  groupColors,
  paletteCss,
  parseHex,
  safeColor,
  type PaletteKey,
} from '../src/theme.js';
import { normalizeComputedColor } from '../src/themeDom.js';

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
    ['light', ':where(.rv-viewer,'],
    ['dark', ":where([data-rv-color-mode='dark'])"],
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

describe('palette overrides and computed colours', () => {
  it('normalizes the colours browsers compute', () => {
    expect(normalizeComputedColor('rgb(61, 90, 128)')).toBe('#3d5a80');
    expect(normalizeComputedColor('rgba(16, 24, 40, 0.1)')).toBe('rgba(16, 24, 40, 0.1)');
    expect(normalizeComputedColor('color(srgb 1 0.5 0)')).toBe('#ff8000');
    expect(normalizeComputedColor('color(srgb 0 0 0 / 0.45)')).toBe('rgba(0, 0, 0, 0.45)');
    expect(normalizeComputedColor('rgb(0 0 0 / 50%)')).toBe('rgba(0, 0, 0, 0.5)');
    expect(normalizeComputedColor('var(--x)')).toBeNull();
  });

  it('parses rgb() colours', () => {
    expect(parseHex('rgb(52, 152, 219)')).toEqual({ r: 52, g: 152, b: 219 });
    expect(parseHex('rgba(52 152 219 / 0.5)')).toEqual({ r: 52, g: 152, b: 219 });
  });

  it('spells overrides as literal colours or as variable fallbacks, fonts included', () => {
    const o = { headerBg: '#b4235a', font: 'Georgia, serif' };
    const lit = colorResolver('light', true, o);
    expect(lit.c('headerBg')).toBe('#b4235a');
    expect(lit.c('tableBg')).toBe(PALETTES.light.tableBg);
    expect(lit.font).toBe('Georgia, serif');
    const vars = colorResolver('dark', false, o);
    expect(vars.c('headerBg')).toBe('var(--rv-header-bg, #b4235a)');
    expect(vars.value('canvasBg')).toBe(PALETTES.dark.canvasBg);
    expect(vars.font).toBe('var(--rv-font, Georgia, serif)');
    expect(paletteCss('light', o)).toContain('--rv-header-bg: #b4235a;');
  });

  it('keeps group colours readable on either canvas', () => {
    for (const mode of ['light', 'dark'] as const) {
      const bg = parseHex(PALETTES[mode].canvasBg)!;
      for (const color of ['#1e3a8a', '#f1e05a', '#3498db', '#000000', '#ffffff']) {
        const g = groupColors(color, PALETTES[mode].canvasBg);
        expect(contrastRatio(parseHex(g.text)!, bg), `${mode} ${color}`).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
    // Colours that are not hex or rgb() are used as given.
    expect(groupColors('teal', '#000000')).toEqual({ fill: 'teal', stroke: 'teal', text: 'teal' });
  });
});
