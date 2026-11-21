// Build-time static diagrams (docs/design/phase3-v1.md §5.1): every gallery diagram is in the
// page's HTML as an SVG (no JavaScript needed), and with JavaScript the interactive canvas takes
// its place without a layout engine in the browser and without moving.
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { examplePages } from './examples.js';

const pages = examplePages();

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Tables of the static SVG: id → screen box relative to the diagram's wrapper. */
async function staticTables(diagram: Locator): Promise<Record<string, Box>> {
  return diagram.evaluate((el) => {
    const o = el.getBoundingClientRect();
    const out: Record<string, Box> = {};
    for (const g of Array.from(el.querySelectorAll('.relvista-static g.rv-table'))) {
      const r = g.querySelector('rect')!.getBoundingClientRect();
      out[g.getAttribute('data-rv-table')!] = {
        x: r.x - o.x,
        y: r.y - o.y,
        width: r.width,
        height: r.height,
      };
    }
    return out;
  });
}

/** Tables of the interactive canvas: id → screen box relative to the diagram's wrapper. */
async function liveTables(diagram: Locator): Promise<Record<string, Box>> {
  return diagram.evaluate((el) => {
    const o = el.getBoundingClientRect();
    const out: Record<string, Box> = {};
    for (const n of Array.from(el.querySelectorAll('.react-flow__node-rvTable'))) {
      const r = n.getBoundingClientRect();
      out[n.getAttribute('data-id')!] = {
        x: r.x - o.x,
        y: r.y - o.y,
        width: r.width,
        height: r.height,
      };
    }
    return out;
  });
}

/** World positions of the interactive canvas's tables (React Flow node transforms). */
async function liveWorld(diagram: Locator): Promise<Record<string, { x: number; y: number }>> {
  return diagram.evaluate((el) => {
    const out: Record<string, { x: number; y: number }> = {};
    for (const n of Array.from(el.querySelectorAll<HTMLElement>('.react-flow__node-rvTable'))) {
      const m = /translate\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(n.style.transform);
      if (m) out[n.getAttribute('data-id')!] = { x: Number(m[1]), y: Number(m[2]) };
    }
    return out;
  });
}

/** Build-time positions from the diagram's JSON script. */
async function ssrPositions(diagram: Locator): Promise<Record<string, { x: number; y: number }>> {
  const json = await diagram.locator('script[data-rv-ssr]').textContent();
  return (JSON.parse(json!) as { positions: Record<string, { x: number; y: number }> }).positions;
}

/** Three tables spread over the diagram: first, middle, last. */
function sample(ids: string[]): string[] {
  const sorted = [...ids].sort();
  return Array.from(new Set([sorted[0]!, sorted[Math.floor(sorted.length / 2)]!, sorted.at(-1)!]));
}

async function settledAll(page: Page): Promise<number> {
  const diagrams = page.locator('.relvista-diagram');
  await expect(diagrams.first()).toBeVisible();
  const count = await diagrams.count();
  for (let i = 0; i < count; i++) {
    const d = diagrams.nth(i);
    await d.scrollIntoViewIfNeeded();
    await expect(d.locator('.rv-viewer')).toHaveAttribute('data-rv-layout', 'done');
    // The static layer goes once the canvas has its final layout.
    await expect(d.locator('.relvista-static')).toBeHidden();
  }
  return count;
}

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  for (const example of pages) {
    test(`gallery ${example.slug}: the static SVG shows every table`, async ({ page }) => {
      await page.goto(`docs/gallery/${example.slug}`);
      const diagrams = page.locator('.relvista-diagram');
      const count = await diagrams.count();
      expect(count).toBeGreaterThanOrEqual(1);
      for (let i = 0; i < count; i++) {
        const d = diagrams.nth(i);
        const view = (await d.getAttribute('data-rv-view')) ?? '*';
        const svg = d.locator('.relvista-static svg.rv-diagram');
        await expect(svg).toBeVisible();
        await expect(svg.locator('g.rv-table')).toHaveCount(example.tables[view]!);
        await expect(d.locator('.relvista-placeholder')).toHaveCount(0);
        // A real picture, framed in its box like the viewer's first view: the whole diagram, or
        // (too big to fit) a window of it at a readable zoom, with whole tables in the box.
        const box = (await d.locator('.relvista-static-box').boundingBox())!;
        const pic = (await svg.boundingBox())!;
        expect(pic.width).toBeGreaterThan(100);
        const tables = await svg
          .locator('g.rv-table > rect:first-of-type')
          .evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as Box));
        const inside = tables.filter(
          (t) =>
            t.x >= box.x &&
            t.y >= box.y &&
            t.x + t.width <= box.x + box.width + 1 &&
            t.y + t.height <= box.y + box.height + 1,
        );
        expect(inside.length).toBeGreaterThanOrEqual(1);
        if (pic.width <= box.width && pic.height <= box.height) {
          expect(pic.x).toBeGreaterThanOrEqual(box.x);
          expect(pic.y).toBeGreaterThanOrEqual(box.y);
        }
      }
      // Nothing else in the diagram box: no viewer, no spinner.
      await expect(page.locator('.rv-viewer')).toHaveCount(0);
    });
  }

  test('a phone: the static box scrolls inside, the page never sideways', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('docs/gallery/14-large');
    await expect(page.locator('.relvista-static svg.rv-diagram').first()).toBeVisible();
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(390);
  });
});

test.describe('with JavaScript', () => {
  for (const example of pages) {
    test(`gallery ${example.slug}: hydrates cleanly, no ELK, same positions`, async ({ page }) => {
      const problems: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text());
      });
      page.on('pageerror', (e) => problems.push(e.message));
      const elk: string[] = [];
      page.on('request', (r) => {
        if (/elk-worker/.test(r.url())) elk.push(r.url());
      });

      await page.goto(`docs/gallery/${example.slug}`);
      const count = await settledAll(page);
      const diagrams = page.locator('.relvista-diagram');
      for (let i = 0; i < count; i++) {
        const d = diagrams.nth(i);
        await expect(d.locator('.relvista-live .rv-viewer')).toBeVisible();
        const ssr = await ssrPositions(d);
        const world = await liveWorld(d);
        for (const id of sample(Object.keys(world))) {
          expect(ssr[id], `${id} has a build-time position`).toBeDefined();
          expect(Math.abs(world[id]!.x - ssr[id]!.x), `${id} x`).toBeLessThanOrEqual(1);
          expect(Math.abs(world[id]!.y - ssr[id]!.y), `${id} y`).toBeLessThanOrEqual(1);
        }
      }
      expect(elk, 'no ELK worker request').toEqual([]);
      expect(problems.filter((p) => /hydrat|Minified React error|#418|#423|#425/i.test(p))).toEqual(
        [],
      );
      expect(problems).toEqual([]);
    });
  }
});

/** Every table of every diagram of a page: static (no JS) and live (hydrated) screen boxes. */
async function swapDelta(
  browser: Browser,
  path: string,
  viewport: { width: number; height: number },
): Promise<{ id: string; k: string; delta: number; diagram: number }[]> {
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport });
  const before = await noJs.newPage();
  await before.goto(path);
  const statics: Record<string, Box>[] = [];
  const sd = before.locator('.relvista-diagram');
  for (let i = 0; i < (await sd.count()); i++) statics.push(await staticTables(sd.nth(i)));
  await noJs.close();

  const js = await browser.newContext({ viewport });
  const page = await js.newPage();
  await page.goto(path);
  const count = await settledAll(page);
  expect(count, path).toBe(statics.length);
  // Let the first views apply.
  await page.waitForTimeout(400);
  const out: { id: string; k: string; delta: number; diagram: number }[] = [];
  const diagrams = page.locator('.relvista-diagram');
  for (let i = 0; i < count; i++) {
    const live = await liveTables(diagrams.nth(i));
    const shown = statics[i]!;
    expect(Object.keys(live).length, `${path} #${i} live tables`).toBeGreaterThan(0);
    for (const id of Object.keys(live)) {
      expect(shown[id], `${path} #${i}: ${id} drawn statically`).toBeDefined();
      for (const k of ['x', 'y', 'width', 'height'] as const)
        out.push({ id, k, delta: Math.abs(live[id]![k] - shown[id]![k]), diagram: i });
    }
  }
  await js.close();
  return out;
}

test.describe('the swap does not move', () => {
  // Every table of every diagram, at a desktop and a phone width: the static picture is framed
  // like the viewer's first view (fit, or the readable-zoom window of a big diagram).
  const paths = ['', ...pages.map((p) => `docs/gallery/${p.slug}`), 'docs/diff', 'docs/views'];
  for (const viewport of [
    { width: 1360, height: 900 },
    { width: 390, height: 844 },
  ]) {
    for (const path of paths) {
      test(`${viewport.width}px ${path || 'home'}: tables stay where the static SVG drew them`, async ({
        browser,
      }) => {
        const deltas = await swapDelta(browser, path, viewport);
        const worst = deltas.sort((a, b) => b.delta - a.delta).slice(0, 3);
        expect(
          worst[0]?.delta ?? 0,
          worst.map((w) => `#${w.diagram} ${w.id} ${w.k} ${w.delta.toFixed(1)}`).join(', '),
        ).toBeLessThanOrEqual(2);
      });
    }
  }
});

test('print shows the static picture, not the canvas', async ({ page }) => {
  await page.goto('docs/gallery/02-ecommerce');
  await settledAll(page);
  const d = page.locator('.relvista-diagram').first();
  await page.emulateMedia({ media: 'print' });
  await expect(d.locator('.relvista-static svg.rv-diagram')).toBeVisible();
  await expect(d.locator('.relvista-live')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await expect(d.locator('.relvista-static')).toBeHidden();
  await expect(d.locator('.relvista-live .rv-viewer')).toBeVisible();
});

test('the static picture follows the dark theme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark', media: 'print' });
  await page.goto('docs/gallery/01-minimal');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const box = page.locator('.relvista-static-box').first();
  await expect(box).toBeVisible();
  const bg = await box.evaluate((el) => getComputedStyle(el).backgroundColor);
  const [r, g, b] = (bg.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number) as [number, number, number];
  const scale = bg.startsWith('color(') ? 255 : 1;
  expect(Math.max(r, g, b) * scale).toBeLessThan(80);
});
