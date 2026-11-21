import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLES_DIR } from './fixtures.js';
import { diagramReady, documentText, openEditor } from './helpers.js';

test('Share → copy → the link opens the same text and view', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openEditor(page);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'From example' }).click();
  await page.getByRole('menuitem', { name: /Diagram views/ }).click();
  await diagramReady(page);
  await page.getByRole('button', { name: /^View: / }).click();
  const options = await page.getByRole('menuitemradio').allTextContents();
  await page.getByRole('menuitemradio').nth(3).click();
  await expect(page.getByRole('button', { name: `View: ${options[3]!}` })).toBeVisible();
  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByRole('dialog', { name: 'Share a link' })).toBeVisible();
  await expect(page.getByLabel('Include layout')).toBeChecked();
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  // The link field holds what Copy wrote (the system clipboard is shared by parallel tests).
  const link = await page.getByLabel('Share link').inputValue();
  expect(link).toMatch(/#dbml=[A-Za-z0-9_-]+&layout=[A-Za-z0-9_-]+&view=/);

  const other = await context.newPage();
  await other.goto(link);
  await expect(other.locator('.ed-app[data-ready="true"]')).toBeVisible();
  await diagramReady(other);
  await expect(other.getByRole('button', { name: `View: ${options[3]!}` })).toBeVisible();
  // The share payload leaves the URL; the hash mirrors the view (design phase3 §6.10).
  await expect.poll(() => new URL(other.url()).hash).toBe(`#view=${options[3]!}`);
  // Same text, byte for byte, and the same table positions.
  const original = readFileSync(join(EXAMPLES_DIR, '08-diagram-views.dbml'), 'utf8');
  expect(await documentText(other)).toBe(original);
  const positions = (p: typeof page) =>
    p
      .locator('.react-flow__node-rvTable')
      .evaluateAll((els) =>
        Object.fromEntries(
          els.map((el) => [el.getAttribute('data-id'), (el as HTMLElement).style.transform]),
        ),
      );
  expect(await positions(other)).toEqual(await positions(page));
});

test('share link without layout or view: text only', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openEditor(page);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'From example' }).click();
  await page.getByRole('menuitem', { name: /E-commerce/ }).click();
  await diagramReady(page);
  await page.getByRole('button', { name: 'Share' }).click();
  // The auto-layout result may reach the document just after the diagram settles.
  await expect(page.getByLabel('Include layout')).toBeChecked();
  await page.getByLabel('Include layout').uncheck();
  await expect(page.getByLabel('Share link')).not.toHaveValue(/layout=|Building/);
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  // The link field holds what Copy wrote (the system clipboard is shared by parallel tests).
  const link = await page.getByLabel('Share link').inputValue();
  expect(link).toMatch(/#dbml=[A-Za-z0-9_-]+$/);
  const other = await context.newPage();
  await other.goto(link);
  await diagramReady(other);
  await expect(other.locator('.react-flow__node-rvTable')).toHaveCount(13);
  expect(await documentText(other)).toBe(
    readFileSync(join(EXAMPLES_DIR, '02-ecommerce.dbml'), 'utf8'),
  );
});

test('a phase-1 link (#dbml=<uri-encoded>) opens', async ({ page }) => {
  await openEditor(page, `#dbml=${encodeURIComponent('Table legacy {\n  id int\n}')}`);
  await expect(page.locator('.react-flow__node[data-id="public.legacy"]')).toBeVisible();
});

test('Include position: the link opens at the same view, table and zoom', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await openEditor(page);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'From example' }).click();
  await page.getByRole('menuitem', { name: /E-commerce/ }).click();
  await diagramReady(page);
  // Select a table, zoom in.
  await page.locator('.ed-diagram .react-flow__node[data-id="public.orders"]').click();
  await page.locator('.ed-diagram').getByRole('button', { name: 'Zoom in' }).click();
  await page.waitForTimeout(400);
  const zoomOf = (p: typeof page) =>
    p
      .locator('.ed-diagram .react-flow__viewport')
      .evaluate((el) => Number(/scale\(([\d.]+)\)/.exec((el as HTMLElement).style.transform)![1]));
  const zoom = await zoomOf(page);
  await page.getByRole('button', { name: 'Share' }).click();
  const position = page.getByLabel('Include position');
  await expect(position).not.toBeChecked();
  await expect(page.getByLabel('Share link')).not.toHaveValue(/table=|Building/);
  await position.check();
  await expect(page.getByLabel('Share link')).toHaveValue(
    /#dbml=[\w-]+(&layout=[\w-]+)?&table=orders&vp=/,
  );
  const link = await page.getByLabel('Share link').inputValue();

  const other = await context.newPage();
  await other.goto(link);
  await diagramReady(other);
  await expect(
    other.locator('.ed-diagram .react-flow__node[data-id="public.orders"] .rv-node'),
  ).toHaveClass(/rv-highlighted/);
  // ±0.01: the link carries the zoom with two decimals.
  await expect
    .poll(async () => Math.abs((await zoomOf(other)) - zoom), { timeout: 5000 })
    .toBeLessThanOrEqual(0.01);
  expect(await documentText(other)).toBe(
    readFileSync(join(EXAMPLES_DIR, '02-ecommerce.dbml'), 'utf8'),
  );
});
