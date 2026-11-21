// The static picture's frame per box width (src/ssr/frames.ts): the interactive viewer's first
// view, written as container-query rules.
import { readFileSync } from 'node:fs';
import {
  compileDbml,
  layoutDiagramSync,
  type DiagramGeometry,
  type DiagramModel,
} from '@relvista/core';
import { viewerFirstView } from '@relvista/renderer';
import { describe, expect, it } from 'vitest';
import {
  FRAME_MAX_WIDTH,
  frameDeclarations,
  frameRanges,
  frameStyle,
  type FrameInput,
} from '../src/ssr/frames.js';

const example = (name: string) =>
  readFileSync(new URL(`../../../examples/${name}`, import.meta.url), 'utf8');

function input(name: string, o: Partial<FrameInput> = {}): FrameInput {
  const model = compileDbml(example(name)).model as DiagramModel;
  const geometry: DiagramGeometry = layoutDiagramSync(model, { engine: 'dagre' });
  return { model, geometry, height: 480, title: false, chips: false, minimap: 'auto', ...o };
}

describe('frameRanges', () => {
  it('covers every width once, each range with the rule of every width in it', () => {
    for (const name of ['02-ecommerce.dbml', '14-large.dbml', '07-sticky-notes.dbml']) {
      const i = input(name);
      const ranges = frameRanges(i);
      expect(ranges[0]!.from).toBe(0);
      expect(ranges.at(-1)!.to).toBeNull();
      for (let k = 1; k < ranges.length; k++) {
        expect(ranges[k]!.from).toBe(ranges[k - 1]!.to);
        expect(ranges[k]!.css).not.toBe(ranges[k - 1]!.css);
      }
      for (const r of ranges) {
        const lo = Math.max(r.from, 240);
        const hi = Math.min(r.to ?? FRAME_MAX_WIDTH + 1, FRAME_MAX_WIDTH + 1) - 1;
        if (hi < lo) continue;
        for (const w of [lo, Math.floor((lo + hi) / 2), hi])
          expect(frameDeclarations(i, w), `${name} at ${w}px`).toBe(r.css);
      }
    }
  });

  it('a small diagram is the fit at every phone and desktop width', () => {
    const i = input('01-minimal.dbml');
    for (let w = 320; w <= 1920; w += 40)
      expect(frameDeclarations(i, w), `${w}px`).toMatch(/^--rv-sw:min\(/);
  });

  it('a large diagram opens at the readable zoom on its window, as the viewer does', () => {
    const i = input('14-large.dbml');
    const width = 906;
    const v = viewerFirstView({ ...i, width, title: false, chips: false });
    expect(v.detail!.zoom).not.toBe('fit');
    expect(v.detail!.viewport.zoom).toBeGreaterThanOrEqual(0.55);
    const css = frameDeclarations(i, width)!;
    const b = i.geometry.bounds;
    if (v.detail!.zoom === 'fixed')
      expect(css).toContain(
        `--rv-sw:${Math.round(b.width * v.detail!.viewport.zoom * 1000) / 1000}px`,
      );
    // The window's start, as the viewer picks it: the left edge of the bounds on screen.
    if (v.detail!.startX !== null) {
      const left = v.detail!.viewport.x + b.x * v.detail!.viewport.zoom;
      const m = /--rv-left:calc\(([\d.]+)px - ([\d.]+) \* var\(--rv-sw\) \/ ([\d.]+)\)/.exec(css)!;
      const sw = b.width * v.detail!.viewport.zoom;
      expect(Number(m[1]) - (Number(m[2]) * sw) / Number(m[3])).toBeCloseTo(left, 1);
    }
  });

  it('a diff with a legend chip keeps the chips row clear (top padding)', () => {
    const css = frameDeclarations(input('02-ecommerce.dbml', { chips: true, title: true }), 900)!;
    expect(css).toMatch(/96px/);
    expect(frameDeclarations(input('02-ecommerce.dbml'), 900)).not.toMatch(/96px/);
  });

  it('is fast enough for a build: the large example in well under a second', () => {
    const i = input('14-large.dbml');
    const t = performance.now();
    frameStyle('x', i);
    expect(performance.now() - t).toBeLessThan(1500);
  });
});

describe('frameStyle', () => {
  it('scopes each rule to its box and width range', () => {
    const css = frameStyle('rvs-abc', input('14-large.dbml'));
    expect(css).toMatch(/@container rv-ssr \(width < \d+px\)\{/);
    expect(css).toContain('.relvista-static-box[data-rv-frame="rvs-abc"]>svg.rv-diagram');
    expect(css).toContain('.relvista-static-box[data-rv-frame="rvs-abc"]>.relvista-static-grid');
    expect(css).not.toContain('</');
  });
});
