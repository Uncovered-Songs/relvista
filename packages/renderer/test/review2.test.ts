// Review round 2 regressions: readable initial view framing, and one cardinality marker per line
// when refs share a port.
import { readFileSync } from 'node:fs';
import { METRICS, compileDbml, layoutDiagram, type Box, type DiagramModel } from '@relvista/core';
import { describe, expect, it } from 'vitest';
import { fanOffsets, routeAll, type RefRoute } from '../src/svg/routing.js';
import { shrunkenRestore } from '../src/canvas/DiagramCanvas.js';
import { fitViewport, initialViewport, type Padding } from '../src/viewer/initialView.js';

const PAD: Padding = { top: 64, right: 28, bottom: 28, left: 28 };

function compile(src: string): DiagramModel {
  const r = compileDbml(src);
  if (!r.model) throw new Error(JSON.stringify(r.diagnostics));
  return r.model;
}

const example = (name: string) =>
  readFileSync(new URL(`../../../examples/${name}`, import.meta.url), 'utf8');

/** Screen box of a world box under a viewport. */
function screen(b: Box, vp: { x: number; y: number; zoom: number }): Box {
  return {
    x: vp.x + b.x * vp.zoom,
    y: vp.y + b.y * vp.zoom,
    width: b.width * vp.zoom,
    height: b.height * vp.zoom,
  };
}

describe('fitViewport', () => {
  it('centres a small diagram in the whole viewer, not just the padded area', () => {
    const bounds = { x: 100, y: 50, width: 400, height: 200 };
    const vp = fitViewport({ bounds, width: 1000, height: 600, padding: PAD, maxZoom: 1.25 })!;
    expect(vp.zoom).toBe(1.25);
    const s = screen(bounds, vp);
    // Equal margins on both axes: a tall title band does not push the diagram down.
    expect(s.x).toBeCloseTo(1000 - (s.x + s.width));
    expect(s.y).toBeCloseTo(600 - (s.y + s.height));
  });

  it('keeps a diagram that fills an axis out of the padding', () => {
    const bounds = { x: 0, y: 0, width: 400, height: 400 };
    const vp = fitViewport({ bounds, width: 1000, height: 600, padding: PAD, maxZoom: 2 })!;
    const s = screen(bounds, vp);
    expect(s.y).toBeCloseTo(PAD.top);
    expect(s.y + s.height).toBeCloseTo(600 - PAD.bottom);
    expect(s.x).toBeCloseTo(1000 - (s.x + s.width));
  });

  it('centres in the whole viewer only as far as the padding allows', () => {
    // 600 - 64 - 28 = 508 free; a 480 px tall diagram centred in 600 would start at 60 < 64.
    const bounds = { x: 0, y: 0, width: 100, height: 480 };
    const vp = fitViewport({ bounds, width: 1000, height: 600, padding: PAD, maxZoom: 1 })!;
    const s = screen(bounds, vp);
    expect(s.y).toBeCloseTo(PAD.top);
  });

  it('is null without a size', () => {
    const bounds = { x: 0, y: 0, width: 0, height: 0 };
    expect(fitViewport({ bounds, width: 800, height: 600, padding: PAD, maxZoom: 1 })).toBeNull();
  });
});

describe('initialViewport', () => {
  // A row of 6 tables 300 wide, 100 apart: 2100 wide in total.
  const nodes: Box[] = Array.from({ length: 6 }, (_, i) => ({
    x: i * 400,
    y: 0,
    width: 300,
    height: 200,
  }));
  const bounds = { x: 0, y: 0, width: 2300, height: 200 };
  const base = { bounds, nodes, width: 1000, height: 500, padding: PAD, maxZoom: 1.25 };

  it('fits when the fit is readable', () => {
    const vp = initialViewport({ ...base, width: 3000, minZoom: 0.85 })!;
    expect(vp).toEqual(fitViewport({ ...base, width: 3000 }));
  });

  it('opens a too-big diagram at the floor zoom, top-left, with no table sliced', () => {
    const vp = initialViewport({ ...base, minZoom: 0.85 })!;
    expect(vp.zoom).toBe(0.85);
    const left = PAD.left;
    const right = 1000 - PAD.right;
    for (const n of nodes) {
      const s = screen(n, vp);
      const inside = s.x >= left - 0.01 && s.x + s.width <= right + 0.01;
      const outside = s.x + s.width <= left + 0.01 || s.x >= right - 0.01;
      expect(inside || outside).toBe(true);
    }
    // The first table starts at the left padding: the reader starts top-left.
    expect(screen(nodes[0]!, vp).x).toBeCloseTo(left);
  });

  it('never puts content above the top padding (under the toolbar)', () => {
    const tall: Box[] = Array.from({ length: 5 }, (_, i) => ({
      x: 0,
      y: i * 300,
      width: 300,
      height: 250,
    }));
    const vp = initialViewport({
      ...base,
      nodes: tall,
      bounds: { x: 0, y: 0, width: 300, height: 1450 },
      minZoom: 0.85,
    })!;
    for (const n of tall) {
      const s = screen(n, vp);
      if (s.y + s.height > PAD.top) expect(s.y).toBeGreaterThanOrEqual(PAD.top - 0.01);
    }
  });

  it('never skips the first column to show one more whole table', () => {
    // Column 0 holds one table, columns 1-3 two each. Starting at column 1 would show six whole
    // tables instead of five, but hide the first one (its refs would run off the left edge).
    const grid: Box[] = [{ x: 0, y: 0, width: 300, height: 200 }];
    for (let c = 1; c <= 3; c++)
      for (const y of [0, 250]) grid.push({ x: c * 400, y, width: 300, height: 200 });
    const vp = initialViewport({
      ...base,
      nodes: grid,
      bounds: { x: 0, y: 0, width: 1500, height: 450 },
      minZoom: 0.85,
    })!;
    expect(screen(grid[0]!, vp).x).toBeCloseTo(PAD.left);
  });

  it('shows the first declared table whole when the window can hold it', () => {
    // A 6 × 6 grid; the anchor sits in the middle, the densest window would start top-left.
    const grid: Box[] = [];
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 6; c++) grid.push({ x: c * 400, y: r * 300, width: 300, height: 200 });
    const anchor = grid[3 * 6 + 3]!;
    const vp = initialViewport({
      ...base,
      nodes: grid,
      anchor,
      bounds: { x: 0, y: 0, width: 2300, height: 1700 },
      minZoom: 0.85,
    })!;
    const s = screen(anchor, vp);
    expect(s.x).toBeGreaterThanOrEqual(PAD.left - 0.01);
    expect(s.x + s.width).toBeLessThanOrEqual(1000 - PAD.right + 0.01);
    expect(s.y).toBeGreaterThanOrEqual(PAD.top - 0.01);
    expect(s.y + s.height).toBeLessThanOrEqual(500 - PAD.bottom + 0.01);
  });

  it('prefers the dense region over empty corridors', () => {
    // A sparse table far top-left, a cluster of four bottom-right.
    const cluster: Box[] = [
      { x: 2000, y: 1500, width: 250, height: 200 },
      { x: 2300, y: 1500, width: 250, height: 200 },
      { x: 2000, y: 1750, width: 250, height: 150 },
      { x: 2300, y: 1750, width: 250, height: 150 },
    ];
    const lone = { x: 0, y: 0, width: 250, height: 150 };
    const vp = initialViewport({
      ...base,
      nodes: [lone, ...cluster],
      bounds: { x: 0, y: 0, width: 2550, height: 1900 },
      minZoom: 0.85,
    })!;
    for (const n of cluster) {
      const s = screen(n, vp);
      expect(s.x).toBeGreaterThanOrEqual(PAD.left - 0.01);
      expect(s.x + s.width).toBeLessThanOrEqual(1000 - PAD.right + 0.01);
      expect(s.y).toBeGreaterThanOrEqual(PAD.top - 0.01);
      expect(s.y + s.height).toBeLessThanOrEqual(500 - PAD.bottom + 0.01);
    }
  });
});

describe('initialViewport overlays', () => {
  it('moves whole tables out from under an obstacle such as the minimap', () => {
    // Two rows of tables under a ref band (bounds start at 0): from the very top, the lower row
    // would end just above the bottom edge, under the minimap.
    const nodes: Box[] = [];
    for (const y of [60, 380])
      for (let c = 0; c < 3; c++) nodes.push({ x: c * 400, y, width: 300, height: 200 });
    const bounds = { x: 0, y: 0, width: 1100, height: 660 };
    const minimap = { x: 1000 - 12 - 120, y: 600 - 12 - 80, width: 120, height: 80 };
    const base = {
      bounds,
      nodes,
      width: 1000,
      height: 600,
      padding: PAD,
      maxZoom: 1.25,
      minZoom: 0.85,
    };
    /** Area of whole (padded-window) tables under the minimap. */
    const covered = (vp: { x: number; y: number; zoom: number }) => {
      let sum = 0;
      for (const n of nodes) {
        const s = screen(n, vp);
        const whole = s.y >= PAD.top - 0.01 && s.y + s.height <= 600 - PAD.bottom + 0.01;
        const cx = Math.min(s.x + s.width, minimap.x + minimap.width) - Math.max(s.x, minimap.x);
        const cy = Math.min(s.y + s.height, minimap.y + minimap.height) - Math.max(s.y, minimap.y);
        if (whole && cx > 0 && cy > 0) sum += cx * cy;
      }
      return sum;
    };
    const without = initialViewport(base)!;
    const withMinimap = initialViewport({ ...base, obstacles: [minimap] })!;
    expect(covered(without)).toBeGreaterThan(0);
    expect(covered(withMinimap)).toBe(0);
  });
});

describe('refs sharing a port', () => {
  const src = `
Table products {
  id integer [pk]
}
Table order_items {
  product_id integer
}
Table tags {
  id integer [pk]
}
Ref: order_items.product_id > products.id
Ref: products.id <> tags.id
`;

  /** Ends of all routes keyed by table, row, side. */
  function endsAt(routes: Map<string, RefRoute>, model: DiagramModel) {
    const out = new Map<string, number[]>();
    for (const ref of model.refs) {
      const r = routes.get(ref.id)!;
      for (const end of ['from', 'to'] as const) {
        const e = r[end];
        const key = `${ref[end].tableId}/${e.row}/${e.side}`;
        out.set(key, [...(out.get(key) ?? []), e.y]);
      }
    }
    return out;
  }

  it('gives each end its own line, inside the row', async () => {
    const model = compile(src);
    for (const usePoints of [true, false]) {
      const geometry = await layoutDiagram(model);
      const routes = routeAll({
        model,
        geometry,
        detailLevel: 'all',
        edgeStyle: 'orthogonal',
        usePoints,
      });
      const products = geometry.nodes['public.products']!;
      const rowTop = products.y + METRICS.headerHeight;
      for (const [key, ys] of endsAt(routes, model)) {
        expect(new Set(ys.map((y) => Math.round(y))).size, key).toBe(ys.length);
        if (key.startsWith('public.products/0/'))
          for (const y of ys) {
            expect(y).toBeGreaterThan(rowTop);
            expect(y).toBeLessThan(rowTop + METRICS.rowHeight);
          }
      }
      // Every route stays orthogonal.
      for (const r of routes.values()) {
        for (let i = 1; i < r.points.length; i++) {
          const a = r.points[i - 1]!;
          const b = r.points[i]!;
          expect(Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01).toBe(true);
        }
        expect([0, 180]).toContain(Math.round(Math.abs(r.from.angle)));
        expect([0, 180]).toContain(Math.round(Math.abs(r.to.angle)));
      }
    }
  });

  it('fans markers apart by at least 12px for two ends, within the row', () => {
    expect(fanOffsets(1)).toEqual([0]);
    expect(fanOffsets(2)).toEqual([-6, 6]);
    const three = fanOffsets(3);
    expect(three[2]! - three[0]!).toBeLessThan(METRICS.rowHeight);
  });

  it('leaves the ecommerce example without stacked markers', async () => {
    const model = compile(example('02-ecommerce.dbml'));
    const geometry = await layoutDiagram(model);
    const routes = routeAll({ model, geometry, detailLevel: 'all', edgeStyle: 'orthogonal' });
    const seen = new Set<string>();
    for (const r of routes.values()) {
      for (const e of [r.from, r.to]) {
        const k = `${Math.round(e.x)},${Math.round(e.y)}`;
        // A same-row self ref loops back to its own point; anything else is a stacked marker.
        if (
          r.from !== e &&
          Math.round(r.from.x) === Math.round(e.x) &&
          Math.round(r.from.y) === Math.round(e.y)
        )
          continue;
        expect(seen.has(k), k).toBe(false);
        seen.add(k);
      }
    }
  });
});

describe('initialViewport centring', () => {
  it('centres a wide diagram vertically in the whole viewer when it opens at the readable zoom', () => {
    const nodes = Array.from({ length: 8 }, (_, i) => ({
      x: i * 250,
      y: 0,
      width: 200,
      height: 200,
    }));
    const bounds = { x: 0, y: 0, width: 1950, height: 200 };
    const vp = initialViewport({
      bounds,
      nodes,
      width: 1000,
      height: 600,
      padding: PAD,
      maxZoom: 1.15,
      minZoom: 0.85,
      fitFloor: 0.55,
    })!;
    expect(vp.zoom).toBe(0.85);
    const s = screen(bounds, vp);
    expect(s.y).toBeCloseTo(600 - (s.y + s.height));
    // Horizontally it starts at the padding, on the first table.
    expect(s.x).toBeCloseTo(PAD.left);
  });
});

describe('shrunkenRestore', () => {
  const b = { x: 0, y: 0, width: 1500, height: 400 };
  const size = { width: 1500, height: 1300 };
  it('drops a restored viewport that shows the whole diagram much smaller than the fit', () => {
    // Saved in a 600 px pane at 0.75, restored into a 1500 px one.
    expect(shrunkenRestore({ x: 24, y: 150, zoom: 0.35 }, b, size, PAD)).toBe(true);
  });
  it('keeps one the user zoomed into, or one already near the fit', () => {
    expect(shrunkenRestore({ x: -300, y: 0, zoom: 1.2 }, b, size, PAD)).toBe(false);
    expect(shrunkenRestore({ x: 24, y: 150, zoom: 0.95 }, b, size, PAD)).toBe(false);
  });
});
