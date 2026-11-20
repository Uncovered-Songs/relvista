// @vitest-environment jsdom
import { compileDbml } from '@relvista/core';
import { describe, expect, it } from 'vitest';
import { clampScale } from '../src/export/png.js';
import { printDocument } from '../src/export/print.js';
import { renderDiagramSvgString } from '../src/export/svgString.js';
import { fileSlug } from '../src/export/download.js';
import { layoutSync } from '../src/geometry.js';
import { loadExamples } from './examples.js';

describe.each(loadExamples())('renderDiagramSvgString: %s', (_name, input) => {
  const { model } = compileDbml(input);
  if (!model) throw new Error('example does not compile');
  const geometry = layoutSync(model);

  it.each(['light', 'dark'] as const)('is a valid standalone SVG document (%s)', (colorMode) => {
    const svg = renderDiagramSvgString(model, geometry, { colorMode, title: 'A & B <test>' });
    expect(svg.startsWith('<?xml')).toBe(true);
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.getElementsByTagName('parsererror')).toHaveLength(0);
    const root = doc.documentElement;
    expect(root.tagName).toBe('svg');
    expect(root.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
    expect(root.getElementsByTagName('style')).toHaveLength(1);
    expect(root.getElementsByTagName('title')[0]!.textContent).toBe('A & B <test>');
    // Literal colours: readable without CSS variable support.
    expect(svg).not.toContain('var(--');
    expect(svg).not.toMatch(/NaN|Infinity/);
  });
});

describe('export options', () => {
  const { model } = compileDbml('Table a { id int [pk] }\nTable b { a_id int [ref: > a.id] }');
  if (!model) throw new Error('no model');
  const geometry = layoutSync(model);

  it('embeds the palette variables and fonts for the mode', () => {
    const dark = renderDiagramSvgString(model, geometry, { colorMode: 'dark' });
    expect(dark).toContain('--rv-canvas-bg: #0f1217;');
    expect(dark).toContain('font-family:Inter');
    expect(dark).toContain('#0f1217');
  });

  it('supports transparent and custom backgrounds, padding and scale', () => {
    const none = renderDiagramSvgString(model, geometry, { background: false });
    expect(none).not.toContain('class="rv-canvas"');
    const custom = renderDiagramSvgString(model, geometry, { background: '#123456', padding: 0 });
    expect(custom).toContain('#123456');
    const w = geometry.bounds.width;
    expect(custom).toContain(`width="${w}"`);
    const scaled = renderDiagramSvgString(model, geometry, { scale: 2, padding: 0 });
    expect(scaled).toContain(`width="${w * 2}"`);
  });

  it('builds a landscape print document fitted to the page', () => {
    const html = printDocument(model, geometry, { title: 'Schema' });
    expect(html).toContain('@page { size: landscape;');
    expect(html).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(html).toContain('<h1>Schema</h1>');
    expect(html).not.toContain('<?xml');
    const auto = printDocument(
      model,
      { ...geometry, bounds: { x: 0, y: 0, width: 10, height: 100 } },
      {
        orientation: 'auto',
      },
    );
    expect(auto).toContain('size: portrait');
  });

  it('clamps the PNG scale to canvas limits', () => {
    expect(clampScale(1000, 500, 2)).toBe(2);
    expect(clampScale(20000, 100, 2)).toBeCloseTo(16384 / 20000);
    const s = clampScale(10000, 10000, 4);
    expect(10000 * s * 10000 * s).toBeLessThanOrEqual(16_777_216 + 1);
  });

  it('slugs file names', () => {
    expect(fileSlug('My Shop DB!')).toBe('my-shop-db');
    expect(fileSlug('')).toBe('diagram');
  });
});
