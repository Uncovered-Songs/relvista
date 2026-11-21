// Deep links in the editor (docs/design/phase3-v1.md §6.10): a link with target keys opens at the
// same view, table and zoom; the hash mirrors the state while working; a reload restores it.
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { EXAMPLES_DIR } from './fixtures.js';
import { diagramReady, openEditor } from './helpers.js';

const VIEWS = readFileSync(join(EXAMPLES_DIR, '08-diagram-views.dbml'), 'utf8');
const LARGE = readFileSync(join(EXAMPLES_DIR, '14-large.dbml'), 'utf8');

const share = (text: string) => `#dbml=${deflateRawSync(Buffer.from(text)).toString('base64url')}`;

/** The canvas viewport as drawn (React Flow's transform). */
async function viewport(page: Page): Promise<{ x: number; y: number; zoom: number }> {
  const t = await page
    .locator('.ed-diagram .react-flow__viewport')
    .evaluate((el) => (el as HTMLElement).style.transform);
  const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\) scale\(([\d.]+)\)/.exec(t);
  if (!m) throw new Error(`no viewport transform: ${t}`);
  return { x: Number(m[1]), y: Number(m[2]), zoom: Number(m[3]) };
}

const node = (page: Page, id: string) =>
  page.locator(`.ed-diagram .react-flow__node[data-id="${id}"]`);

test('a share link with view, table and vp opens there; the hash mirrors; reload restores', async ({
  page,
}) => {
  await openEditor(page, `${share(VIEWS)}&view=sales_view&table=orders&vp=40,-20.5,0.8`);
  await diagramReady(page);
  await expect(page.getByRole('button', { name: 'View: sales_view' })).toBeVisible();
  await expect(node(page, 'public.orders').locator('.rv-node')).toHaveClass(/rv-highlighted/);
  await expect.poll(async () => (await viewport(page)).zoom, { timeout: 5000 }).toBeCloseTo(0.8, 2);
  const vp = await viewport(page);
  expect(vp.x).toBeCloseTo(40, 0);
  expect(vp.y).toBeCloseTo(-20.5, 0);
  // The share payload left the URL; the target keys stay (mirrored).
  await expect
    .poll(() => new URL(page.url()).hash)
    .toBe('#view=sales_view&table=orders&vp=40,-20.5,0.8');

  // Navigation: another table, then a zoom: the hash follows.
  await node(page, 'public.products').click();
  await expect.poll(() => new URL(page.url()).hash).toContain('table=products');
  await page.locator('.ed-diagram').getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(() => new URL(page.url()).hash).not.toContain('vp=40,-20.5,0.8');
  const hash = new URL(page.url()).hash;
  expect(hash).toMatch(/^#view=sales_view&table=products&vp=-?[\d.]+,-?[\d.]+,[\d.]+$/);
  expect(hash).not.toContain('dbml=');
  const zoom = Number(/vp=[^,]+,[^,]+,([\d.]+)/.exec(hash)![1]);

  // Reload: the session comes back and the hash is applied again.
  await page.waitForTimeout(800); // autosave debounce
  await page.reload();
  await expect(page.locator('.ed-app[data-ready="true"]')).toBeVisible();
  await diagramReady(page);
  await expect(page.getByRole('button', { name: 'View: sales_view' })).toBeVisible();
  await expect(node(page, 'public.products').locator('.rv-node')).toHaveClass(/rv-highlighted/);
  await expect
    .poll(async () => (await viewport(page)).zoom, { timeout: 5000 })
    .toBeCloseTo(zoom, 2);
});

test('hops open focus mode with the chip; Esc and the chip exit it', async ({ page }) => {
  await openEditor(page, `${share(LARGE)}&table=invoices&hops=1`);
  await diagramReady(page);
  const chip = page.getByRole('group', { name: 'Focus on invoices' });
  await expect(chip).toContainText('Related to invoices · 1 hop');
  await expect(page.locator('.ed-diagram .rv-canvas')).toHaveAttribute('data-rv-focus', 'true');
  const shown = await page.locator('.ed-diagram .react-flow__node-rvTable').count();
  expect(shown).toBeLessThan(20);
  await chip.getByRole('button', { name: 'More hops' }).click();
  await expect(chip).toContainText('2 hops');
  await expect.poll(() => new URL(page.url()).hash).toContain('table=invoices&hops=2');
  await expect
    .poll(() => page.locator('.ed-diagram .react-flow__node-rvTable').count())
    .toBeGreaterThan(shown);
  await chip.getByRole('button', { name: 'Exit focus' }).click();
  await expect(chip).toHaveCount(0);
  await expect.poll(() => page.locator('.ed-diagram .react-flow__node-rvTable').count()).toBe(61);
  await expect.poll(() => new URL(page.url()).hash).toBe('#table=invoices');

  // Esc on the diagram: one layer per press (the lit table, then focus mode).
  await page.evaluate(() => {
    location.hash = 'table=invoices&hops=1';
  });
  await expect(chip).toBeVisible();
  await node(page, 'public.invoices').focus();
  await page.keyboard.press('Escape');
  await expect(node(page, 'public.invoices').locator('.rv-node')).not.toHaveClass(/rv-highlighted/);
  await expect(chip).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(chip).toHaveCount(0);
});

test('a deep link to an unknown table opens the document and says so', async ({ page }) => {
  await openEditor(page, `${share(VIEWS)}&table=nowhere`);
  await diagramReady(page);
  await expect(page.locator('.ed-toast')).toContainText('No table “nowhere” in this schema');
  await expect(node(page, 'public.users')).toBeVisible();
});

test('a target-only hash typed into a running editor moves the diagram', async ({ page }) => {
  await openEditor(page, share(LARGE));
  await diagramReady(page);
  await page.evaluate(() => {
    location.hash = 'table=invoices&detail=names';
  });
  await expect(node(page, 'public.invoices').locator('.rv-node')).toHaveClass(/rv-highlighted/);
  // Detail from a link is display-only: the switch shows it, the layout is not written.
  await expect(
    page.getByRole('radiogroup', { name: /Detail level/ }).getByRole('radio', { name: 'Names' }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.ed-diagram .rv-column')).toHaveCount(0);
});
