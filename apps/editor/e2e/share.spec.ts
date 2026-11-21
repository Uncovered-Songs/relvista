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
  expect(new URL(other.url()).hash).toBe('');
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
