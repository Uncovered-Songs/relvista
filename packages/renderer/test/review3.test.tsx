// @vitest-environment jsdom
// Review round 3 regressions: small diagrams open whole (or fill one axis), group labels stay
// legible in dark mode, the editor can clear the canvas selection. The minimap hold is covered by
// the editor's e2e tests (jsdom cannot draw React Flow's minimap).
import { compileDbml, emptyLayout, type Box, type Layout } from '@relvista/core';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DiagramCanvas, type DiagramCanvasHandle } from '../src/canvas/DiagramCanvas.js';
import { GroupSvg } from '../src/svg/GroupSvg.js';
import { ColorContext } from '../src/svg/context.js';
import { PALETTES, colorResolver, contrastRatio, parseHex, withContrast } from '../src/theme.js';
import { initialViewport, type Padding } from '../src/viewer/initialView.js';

const PAD: Padding = { top: 56, right: 24, bottom: 56, left: 24 };

function screen(b: Box, vp: { x: number; y: number; zoom: number }): Box {
  return {
    x: vp.x + b.x * vp.zoom,
    y: vp.y + b.y * vp.zoom,
    width: b.width * vp.zoom,
    height: b.height * vp.zoom,
  };
}

describe('initialViewport fit floor', () => {
  // Seven tables in one row: 2700 wide, fit ≈ 0.31 at 860 px.
  const nodes: Box[] = Array.from({ length: 7 }, (_, i) => ({
    x: i * 400,
    y: 0,
    width: 300,
    height: 200,
  }));
  const bounds = { x: 0, y: 0, width: 2700, height: 200 };
  const base = { bounds, nodes, height: 800, padding: PAD, maxZoom: 1.25, minZoom: 0.85 };

  it('fits a diagram whose fit is above the floor, even below the readable zoom', () => {
    const vp = initialViewport({ ...base, width: 1500, fitFloor: 0.45 })!;
    expect(vp.zoom).toBeLessThan(0.85);
    expect(vp.zoom).toBeCloseTo((1500 - 48) / 2700);
    for (const n of nodes) {
      const s = screen(n, vp);
      expect(s.x).toBeGreaterThanOrEqual(PAD.left - 0.01);
      expect(s.x + s.width).toBeLessThanOrEqual(1500 - PAD.right + 0.01);
    }
  });

  it('keeps the readable zoom when the fit is below the floor', () => {
    expect(initialViewport({ ...base, width: 860, fitFloor: 0.45 })!.zoom).toBe(0.85);
  });

  it('fills one axis between the floor and the readable zoom instead of leaving empty bands', () => {
    // A tall grid: at 0.85 it overflows both ways; filling the width (≈ 0.7) leaves only a pan
    // down.
    const grid: Box[] = [];
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 3; c++) grid.push({ x: c * 400, y: r * 300, width: 300, height: 200 });
    const vp = initialViewport({
      ...base,
      nodes: grid,
      bounds: { x: 0, y: 0, width: 1100, height: 2300 },
      width: 818,
      fitFloor: 0.55,
    })!;
    expect(vp.zoom).toBeCloseTo((818 - 48) / 1100);
    for (const n of grid.slice(0, 3)) {
      const s = screen(n, vp);
      expect(s.x).toBeGreaterThanOrEqual(PAD.left - 0.01);
      expect(s.x + s.width).toBeLessThanOrEqual(818 - PAD.right + 0.01);
    }
  });
});

describe('dark-mode group colours', () => {
  const bg = parseHex(PALETTES.dark.canvasBg)!;

  it('withContrast lightens a dark colour just enough and keeps a legible one', () => {
    const navy = parseHex('#2c3e50')!;
    expect(contrastRatio(navy, bg)).toBeLessThan(2);
    const text = withContrast(navy, bg, 4.5);
    expect(contrastRatio(text, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(text, bg)).toBeLessThan(5);
    // Hue kept: still bluish.
    expect(text.b).toBeGreaterThan(text.r);
    const light = parseHex('#9ad0ff')!;
    expect(withContrast(light, bg, 4.5)).toBe(light);
  });

  it('GroupSvg adjusts a dark group colour (tint, border, label) to the dark canvas only', () => {
    const group = { id: 'group:t', name: 'tenancy', tableIds: [], color: '#2c3e50' };
    const draw = (mode: 'light' | 'dark') =>
      renderToStaticMarkup(
        <ColorContext.Provider value={colorResolver(mode)}>
          <svg>
            <GroupSvg
              group={group as never}
              box={{ id: 'group:t', kind: 'group', x: 0, y: 0, width: 400, height: 300 } as never}
            />
          </svg>
        </ColorContext.Provider>,
      );
    const light = draw('light');
    expect(light).not.toMatch(/fill:#(?!2c3e50)/i);
    const dark = draw('dark');
    const textFill = /<text[^>]*style="fill:(#[0-9a-f]{6})/i.exec(dark)![1]!;
    expect(contrastRatio(parseHex(textFill)!, bg)).toBeGreaterThanOrEqual(4.5);
    // The tint too: a raw #2c3e50 at 7% would not show on the dark canvas.
    const [, fill, stroke] = /<rect[^>]*style="fill:(#[0-9a-f]{6});stroke:(#[0-9a-f]{6})/i.exec(
      dark,
    )!;
    expect(contrastRatio(parseHex(fill)!, bg)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(parseHex(stroke)!, bg)).toBeGreaterThan(
      contrastRatio(parseHex(fill)!, bg),
    );
    // Hue kept: still the slate blue.
    expect(parseHex(fill)!.b).toBeGreaterThan(parseHex(fill)!.r);
  });

  it('GroupSvg darkens a pale group label on the light canvas, and uses the canvas it is drawn on', () => {
    const group = { id: 'group:y', name: 'pale', tableIds: [], color: '#f1e05a' };
    const box = { id: 'group:y', kind: 'group', x: 0, y: 0, width: 400, height: 300 } as never;
    const draw = (mode: 'light' | 'dark', canvasBg?: string) =>
      renderToStaticMarkup(
        <ColorContext.Provider value={colorResolver(mode, false, canvasBg ? { canvasBg } : null)}>
          <svg>
            <GroupSvg group={group as never} box={box} />
          </svg>
        </ColorContext.Provider>,
      );
    const label = (svg: string) => parseHex(/<text[^>]*style="fill:(#[0-9a-f]{6})/i.exec(svg)![1])!;
    const lightBg = parseHex(PALETTES.light.canvasBg)!;
    expect(contrastRatio(label(draw('light')), lightBg)).toBeGreaterThanOrEqual(4.5);
    // The tint keeps the colour on a light canvas.
    expect(draw('light')).toMatch(/<rect[^>]*style="fill:#f1e05a;/i);
    // A site palette's darker canvas (resolved from the page) is what the label is checked against.
    const siteBg = '#3b2f4a';
    expect(contrastRatio(label(draw('dark', siteBg)), parseHex(siteBg)!)).toBeGreaterThanOrEqual(
      4.5,
    );
  });
});

// --- canvas -------------------------------------------------------------------------------------

beforeAll(() => {
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', RO);
  if (!('DOMMatrixReadOnly' in globalThis)) {
    class M {
      m22 = 1;
      constructor(_t?: string) {}
    }
    vi.stubGlobal('DOMMatrixReadOnly', M);
  }
});

afterEach(() => cleanup());

async function flush(ms = 30) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

describe('DiagramCanvas selection handle', () => {
  it('setSelection([]) clears what a click selected', async () => {
    const model = compileDbml('Table a {\n id int\n}\nTable b {\n id int\n}\n').model!;
    const layout: Layout = {
      ...emptyLayout(),
      views: { '*': { nodes: { 'public.a': { x: 0, y: 0 }, 'public.b': { x: 400, y: 0 } } } },
    };
    const ref = createRef<DiagramCanvasHandle>();
    const { container } = render(
      <div style={{ width: 800, height: 600 }}>
        <DiagramCanvas ref={ref} model={model} layout={layout} editable />
      </div>,
    );
    for (let i = 0; i < 100 && !container.querySelector('[data-rv-layout="done"]'); i++)
      await flush(20);
    fireEvent.click(container.querySelector('.react-flow__node[data-id="public.a"]')!);
    await flush();
    expect(ref.current!.getSelection()).toEqual(['public.a']);
    act(() => ref.current!.setSelection([]));
    await flush();
    expect(ref.current!.getSelection()).toEqual([]);
    expect(container.querySelector('.rv-selected')).toBeNull();
    act(() => ref.current!.setSelection(['public.b']));
    await flush();
    expect(ref.current!.getSelection()).toEqual(['public.b']);
  });
});
