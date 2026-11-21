// Coexistence gate: relvista next to mermaid, live code blocks and a site's own CodeBlock wrapper,
// on a site with a strongly customised Infima theme, in light and dark mode. build/site has
// relvista; build/baseline is the same site without it (see scripts/build.mjs).
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';

const BASELINE = process.env.RELVISTA_COMPAT_BASELINE_URL!;
const SHOTS = process.env.RELVISTA_SHOTS ?? join(process.cwd(), 'build', 'screenshots');
mkdirSync(SHOTS, { recursive: true });

type Mode = 'light' | 'dark';

/** Opens a page in a colour mode (Docusaurus reads the stored choice before the first paint). */
async function open(page: Page, url: string, mode: Mode): Promise<void> {
  await page.addInitScript((m) => window.localStorage.setItem('theme', m), mode);
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
}

/** Waits until a diagram has its final layout and returns its viewer root. */
async function settled(diagram: Locator): Promise<Locator> {
  const viewer = diagram.locator('.rv-viewer');
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute('data-rv-layout', 'done');
  return viewer;
}

/**
 * The diagram draws its ref lines: row handles exist and every ref has an edge. This site has no
 * `browserslist`, so Docusaurus transpiles relvista loosely (`[...set]` becomes `[].concat(set)`);
 * code that spreads a Set or a string would lose the handles and with them every line.
 */
async function expectRefLines(viewer: Locator, refs: number): Promise<void> {
  await expect(viewer.locator('.react-flow__edge')).toHaveCount(refs);
  expect(await viewer.locator('.react-flow__handle').count()).toBeGreaterThanOrEqual(refs * 2);
  await expect(viewer.locator('.react-flow__edge path').first()).toHaveAttribute('d', /\d/);
}

/** A colour as the browser computes it, read through a probe inside `el`. */
function computedColor(el: Locator, css: string): Promise<string> {
  return el.evaluate((node, value) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    node.appendChild(probe);
    const out = getComputedStyle(probe).color;
    probe.remove();
    return out;
  }, css);
}

/** `rgb(…)` or `color(srgb …)` (how Chrome computes `color-mix()`) → 0-255 channels. */
function channels(color: string): [number, number, number] {
  const n = (color.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  const scale = color.startsWith('color(') ? 255 : 1;
  return n.map((v) => Math.round(v * scale)) as [number, number, number];
}

const hex = (color: string): string =>
  '#' +
  channels(color)
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');

function luminance(color: string): number {
  const [r, g, b] = channels(color).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

for (const mode of ['light', 'dark'] as const) {
  test.describe(`${mode} mode`, () => {
    test('every fence type renders, each by its own plugin', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await open(page, '', mode);

      // DBML: a relvista diagram (not code), in the site's colour mode.
      const diagram = page.locator('.relvista-diagram');
      await expect(diagram).toHaveCount(1);
      const viewer = await settled(diagram);
      await expect(viewer).toHaveAttribute('data-rv-color-mode', mode);
      await expect(viewer.locator('.react-flow__node-rvTable')).toHaveCount(2);
      await expectRefLines(viewer, 1);
      await expect(viewer.getByText('shop.dbml')).toBeVisible();

      // Mermaid: rendered to SVG by @docusaurus/theme-mermaid.
      const mermaid = page.locator('.docusaurus-mermaid-container svg');
      await expect(mermaid).toBeVisible();
      await expect(mermaid.getByText('Diagrams')).toBeVisible();

      // Live code: the playground runs the code; the preview reacts to clicks.
      const live = page.locator('[class*="playgroundContainer"]');
      await expect(live).toHaveCount(1);
      const button = live.locator('.live-counter');
      await expect(button).toHaveText('Clicked 0 times');
      await button.click();
      await expect(button).toHaveText('Clicked 1 times');
      // ...inside the site's own CodeBlock wrapper.
      await expect(
        page.locator('[data-compat-codeblock] [class*="playgroundContainer"]'),
      ).toHaveCount(1);

      // Plain code and ```dbml static: highlighted code blocks, through the site's wrapper.
      const wrapped = page.locator('[data-compat-codeblock="wrapped"]');
      await expect(wrapped).toHaveCount(3);
      const js = wrapped.filter({ hasText: 'export function hello' });
      await expect(js.locator('pre .token-line').first()).toBeVisible();
      await expect(js.locator('pre span.token.keyword').first()).toHaveText('export');
      await expect(js.getByText('hello.js')).toBeVisible();
      const staticDbml = wrapped.filter({ hasText: 'Table tags' });
      await expect(staticDbml.locator('pre')).toBeVisible();
      // relvista's Prism grammar highlights DBML code.
      await expect(staticDbml.locator('span.token.keyword').first()).toHaveText('Table');

      expect(errors).toEqual([]);
      await page.screenshot({ path: join(SHOTS, `compat-${mode}.png`), fullPage: true });
    });

    test("the diagram follows the site's palette and fonts", async ({ page }) => {
      await open(page, '', mode);
      const viewer = await settled(page.locator('.relvista-diagram'));
      await expect(viewer).toHaveClass(/rv-palette-site/);
      await expect(viewer).toHaveAttribute('style', /--rv-site-header-bg/);

      const header = await computedColor(viewer, 'var(--rv-header-bg)');
      const headerText = await computedColor(viewer, 'var(--rv-header-text)');
      expect(contrast(header, headerText)).toBeGreaterThanOrEqual(4.5);
      // Light mode: the site's own primary (#b4235a carries white text). Dark mode: the bright
      // dark-mode primary toned down, still in its hue (more red than green or blue).
      if (mode === 'light') expect(header).toBe('rgb(180, 35, 90)');
      else {
        const [r, g, b] = channels(header);
        expect(r).toBeGreaterThan(g);
        expect(r).toBeGreaterThan(b);
      }
      // The fixture's own surfaces apply (not Infima's stock ones), so the check below is real.
      expect(hex(await computedColor(viewer, 'var(--ifm-background-surface-color)'))).toBe(
        mode === 'light' ? '#fff3e3' : '#221a2e',
      );
      // Surfaces from the site: table cards on the site's surface colour.
      expect(await computedColor(viewer, 'var(--rv-table-bg)')).toBe(
        await computedColor(viewer, 'var(--ifm-background-surface-color)'),
      );
      // The accent stands out from the canvas.
      const canvas = await computedColor(viewer, 'var(--rv-canvas-bg)');
      expect(
        contrast(await computedColor(viewer, 'var(--rv-ref-highlight)'), canvas),
      ).toBeGreaterThanOrEqual(3);

      // Fonts: names in the site's serif, column types in its monospace.
      const name = viewer.locator('.rv-table-name').first();
      expect(await name.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Georgia/);
      const type = viewer.locator('.rv-column text[text-anchor="end"]').first();
      expect(await type.evaluate((el) => getComputedStyle(el).fontFamily)).toMatch(/Courier/);

      // The explicit group colour (#1e3a8a, dark blue) stays blue; on the dark canvas it is
      // lightened until its label reads.
      const label = viewer.locator('.rv-group text').first();
      const fill = await label.evaluate((el) => getComputedStyle(el).fill);
      const [r, g, b] = channels(fill);
      expect(b).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(g);
      expect(contrast(fill, canvas)).toBeGreaterThanOrEqual(4.5);
    });

    test("the site's own styles are the same with and without relvista", async ({
      page,
      browser,
    }) => {
      await open(page, '', mode);
      await settled(page.locator('.relvista-diagram'));
      const withRelvista = await page.evaluate(styleProbe);

      const context = await browser.newContext();
      const baseline = await context.newPage();
      await open(baseline, BASELINE, mode);
      await expect(baseline.locator('.relvista-diagram')).toHaveCount(0);
      const withoutRelvista = await baseline.evaluate(styleProbe);
      await context.close();

      expect(withRelvista.navbar).not.toBeNull();
      expect(withRelvista.code).not.toBeNull();
      expect(withRelvista.ifm['--ifm-font-family-base']).toMatch(/Georgia/);
      expect(withRelvista).toEqual(withoutRelvista);
    });
  });
}

/** Computed styles of the site's own elements and Infima variables (runs in the page). */
function styleProbe() {
  const pick = (sel: string, props: string[]) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const s = getComputedStyle(el);
    return Object.fromEntries(props.map((p) => [p, s.getPropertyValue(p)]));
  };
  const root = getComputedStyle(document.documentElement);
  const ifm = Object.fromEntries(
    [
      '--ifm-color-primary',
      '--ifm-font-family-base',
      '--ifm-font-family-monospace',
      '--ifm-navbar-background-color',
      '--ifm-background-color',
      '--ifm-background-surface-color',
      '--ifm-code-border-radius',
      '--ifm-font-color-base',
    ].map((v) => [v, root.getPropertyValue(v).trim()]),
  );
  return {
    ifm,
    body: pick('body', ['font-family', 'color', 'background-color', 'font-size']),
    navbar: pick('.navbar', ['background-color', 'color', 'font-family', 'height']),
    title: pick('.navbar__title', ['font-family', 'letter-spacing', 'text-transform', 'color']),
    link: pick('.navbar__link--active', ['color', 'font-family']),
    h1: pick('article h1', ['font-family', 'font-size', 'font-weight', 'color']),
    p: pick('article p', ['font-family', 'font-size', 'line-height', 'color']),
    // Not the active one: which heading is active depends on how long the page is.
    toc: pick('.table-of-contents__link:not(.table-of-contents__link--active)', [
      'color',
      'font-family',
    ]),
    // The js fence: the same block on both builds (the DBML fence is code only in the baseline).
    code: pick('[data-compat-codeblock]:has(.token.keyword) pre[class*="language-js"]', [
      'font-family',
      'background-color',
      'border-radius',
      'font-size',
    ]),
    wrapper: pick('[data-compat-codeblock]', ['border-left-color', 'padding-left']),
  };
}

test('the Markdown page renders its fences too', async ({ page }) => {
  await open(page, 'markdown', 'light');
  const viewer = await settled(page.locator('.relvista-diagram'));
  await expect(viewer.locator('.react-flow__node-rvTable')).toHaveCount(2);
  await expectRefLines(viewer, 1);
  await expect(page.locator('[data-compat-codeblock="wrapped"]')).toHaveCount(1);
  await expect(page.locator('[data-compat-codeblock] pre')).toContainText('const answer = 42;');
});

test('an SVG export has the colours and fonts the page shows', async ({ page }) => {
  for (const mode of ['light', 'dark'] as const) {
    await open(page, '', mode);
    const viewer = await settled(page.locator('.relvista-diagram'));
    const shown = {
      header: await computedColor(viewer, 'var(--rv-header-bg)'),
      table: await computedColor(viewer, 'var(--rv-table-bg)'),
      canvas: await computedColor(viewer, 'var(--rv-canvas-bg)'),
    };
    await viewer.getByRole('button', { name: 'Export' }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      viewer.getByRole('menuitem', { name: /SVG/ }).click(),
    ]);
    const svg = readFileSync((await download.path())!, 'utf8');
    for (const color of Object.values(shown)) expect(svg).toContain(hex(color));
    expect(svg).toContain('Georgia');
    expect(svg).toContain('Courier New');
  }
});
