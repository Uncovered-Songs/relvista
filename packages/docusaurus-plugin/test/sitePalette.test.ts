import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { contrastRatio, mix, parseHex, toHex, withContrast } from '@relvista/renderer';
import { SITE_CANVAS_BG, siteAccents } from '../src/sitePalette.js';

const css = readFileSync(new URL('../src/client/site-palette.css', import.meta.url), 'utf8');
const WHITE = { r: 255, g: 255, b: 255 };

/** siteAccents with the page's colours given directly (what the browser would compute). */
function accents(mode: 'light' | 'dark', family: string[], canvas: string) {
  return siteAccents({} as Element, mode, {
    resolveColors: (_el, values) =>
      values.map((v) => {
        if (v === SITE_CANVAS_BG) return canvas;
        const i = ['', '-dark', '-darker', '-darkest'].findIndex(
          (s) => v === `var(--ifm-color-primary${s})`,
        );
        return family[i] ?? null;
      }),
    parseHex,
    contrastRatio,
    withContrast,
    toHex,
    mix,
  });
}

describe('site palette', () => {
  it('maps every diagram and UI variable to the site, with zero specificity', () => {
    expect(css).toMatch(/:where\(\.rv-viewer\.rv-palette-site\)\s*\{/);
    for (const v of ['--rv-canvas-bg', '--rv-header-bg', '--rv-ref-highlight', '--rv-ui-text'])
      expect(css).toContain(`${v}:`);
    expect(css).toContain('--rv-font: var(--ifm-font-family-base)');
    expect(css).toContain('--rv-mono: var(--ifm-font-family-monospace)');
    // The canvas colour the accent is checked against is the one the CSS draws.
    const canvas = /--rv-canvas-bg:\s*([^;]+);/.exec(css)![1]!.replace(/\s+/g, ' ');
    expect(canvas.replace(/\( /g, '(').replace(/ \)/g, ')')).toBe(SITE_CANVAS_BG);
  });

  it('uses the primary itself for the header when white text reads on it', () => {
    const a = accents('light', ['#2e8555', '#29784c', '#277148', '#205d3b'], '#f6f7f8')!;
    expect(a['--rv-site-header-bg']).toBe('#2e8555');
    expect(a['--rv-site-header-text']).toBe('#ffffff');
  });

  it('steps down the primary family for white text at 4.5:1 in light mode', () => {
    const b = accents('light', ['#ff7aa8', '#ff5c93', '#e0306b', '#b4235a'], '#f6f7f8')!;
    expect(b['--rv-site-header-bg']).toBe('#b4235a');
    // No member is dark enough: the primary, darkened.
    const c = accents('light', ['#25c2a0'], '#f6f7f8')!;
    expect(contrastRatio(parseHex(c['--rv-site-header-bg'])!, WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('tones the bright dark-mode primary down, keeping its hue and white text', () => {
    // Docusaurus' dark-mode default teal.
    const a = accents('dark', ['#25c2a0', '#21af90', '#1fa588', '#1a8870'], '#1e2023')!;
    const header = parseHex(a['--rv-site-header-bg'])!;
    expect(a['--rv-site-header-text']).toBe('#ffffff');
    expect(contrastRatio(header, WHITE)).toBeGreaterThanOrEqual(4.5);
    expect(header.g).toBeGreaterThan(header.r);
    expect(header.g).toBeGreaterThan(header.b);
  });

  it('keeps a very light primary with dark text in light mode', () => {
    const a = accents('light', ['#ffe066', '#ffd633', '#ffd11a', '#e6b800'], '#f6f7f8')!;
    expect(a['--rv-site-header-bg']).toBe('#ffe066');
    expect(a['--rv-site-header-text']).toBe('#1b2230');
  });

  it('makes the accent stand out 3:1 from the canvas', () => {
    const a = accents('dark', ['#1e3a8a'], '#1e2023')!;
    expect(
      contrastRatio(parseHex(a['--rv-site-accent'])!, parseHex('#1e2023')!),
    ).toBeGreaterThanOrEqual(3);
  });

  it('is null when the site has no primary colour', () => {
    expect(accents('light', [], '#ffffff')).toBeNull();
  });
});
