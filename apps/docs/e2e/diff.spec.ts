// Schema diffs on the built docs site (docs/design/phase3-v1.md §5.3): with JavaScript the
// interactive viewer shows added / removed / changed tones and its legend; without it the page
// still has the toned static SVG and the change list; both are axe-clean in light and dark.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));

function axeSource(): string {
  const docs = createRequire(join(here, '..', 'package.json'));
  return createRequire(docs.resolve('@axe-core/playwright')).resolve('axe-core/axe.min.js');
}

async function axe(page: Page, include: string[]): Promise<Array<{ id: string; nodes: string[] }>> {
  await page.addScriptTag({ path: axeSource() });
  return page.evaluate(async (sel) => {
    const w = window as unknown as {
      axe: {
        run(
          ctx: unknown,
          opts: unknown,
        ): Promise<{ violations: Array<{ id: string; nodes: Array<{ target: string[] }> }> }>;
      };
    };
    const r = await w.axe.run(
      { include: sel.map((s) => [s]) },
      { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } },
    );
    return r.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target.join(' ')) }));
  }, include);
}

async function settled(diagram: Locator): Promise<Locator> {
  const viewer = diagram.locator('.rv-viewer');
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute('data-rv-layout', 'done');
  return viewer;
}

const TONES = ['added', 'removed', 'changed'] as const;

test('with JavaScript: the viewer draws the diff tones and the legend, no ELK', async ({
  page,
}) => {
  const elk: string[] = [];
  page.on('request', (r) => {
    if (/elk-worker/.test(r.url())) elk.push(r.url());
  });
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));

  await page.goto('docs/diff');
  const diff = page.locator('#accounts-diff');
  const viewer = await settled(diff);
  await expect(viewer).toHaveAttribute('data-rv-diff', 'true');
  for (const tone of TONES)
    await expect(viewer.locator(`.rv-table[data-rv-tone="${tone}"]`).first()).toBeAttached();
  // The removed table is drawn too.
  await expect(viewer.locator('.react-flow__node[data-id="public.sessions"]')).toHaveCount(1);
  await expect(
    viewer.locator('.react-flow__node[data-id="public.order_items"] .rv-table'),
  ).toHaveAttribute('data-rv-tone', 'added');
  // The legend chip, and no editor link for a diff.
  await expect(viewer.getByText(/\+\d/).first()).toBeVisible();
  await expect(viewer.getByRole('link', { name: 'Open in editor' })).toHaveCount(0);
  // The static layer gave way; the change list stays.
  await expect(diff.locator('.relvista-static')).toBeHidden();
  const list = diff.locator('details.relvista-diff-changes');
  await expect(list.locator('summary')).toContainText(/Changes \(\+\d+ −\d+ ~\d+\)/);
  await expect(list.locator('li[data-rv-change="removed"]').first()).toBeAttached();
  // A long list starts closed; its summary opens it.
  await list.locator('summary').click();
  await expect(list.locator('li[data-rv-change="removed"]').first()).toBeVisible();

  // The fence form renders too.
  await settled(page.locator('#orders-status'));
  expect(elk, 'build-time positions: no ELK worker').toEqual([]);
  expect(problems).toEqual([]);
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the static SVG has the tones and the change list is in the page', async ({ page }) => {
    await page.goto('docs/diff');
    const diff = page.locator('#accounts-diff');
    const svg = diff.locator('.relvista-static svg.rv-diagram');
    await expect(svg).toBeVisible();
    for (const tone of TONES)
      await expect(svg.locator(`[data-rv-tone="${tone}"]`).first()).toBeAttached();
    for (const id of ['public.users', 'public.orders', 'public.sessions', 'public.order_items'])
      await expect(svg.locator(`[data-rv-table="${id}"]`)).toHaveCount(1);
    const list = diff.locator('details.relvista-diff-changes');
    await expect(list).toBeVisible();
    await expect(list.locator('summary')).toContainText('Changes (');
    for (const tone of TONES)
      await expect(list.locator(`li[data-rv-change="${tone}"]`).first()).toBeAttached();
    await expect(list).toContainText('table sessions');
    await expect(page.locator('#orders-status .relvista-static svg.rv-diagram')).toBeVisible();
    await expect(page.locator('#orders-status details')).toContainText('Changes (~1)');
  });
});

for (const mode of ['light', 'dark'] as const) {
  test(`axe: the diff and its change list are clean (${mode})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: mode });
    await page.goto('docs/diff');
    await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
    await settled(page.locator('#accounts-diff'));
    expect(await axe(page, ['#accounts-diff', '#orders-status'])).toEqual([]);
  });
}
