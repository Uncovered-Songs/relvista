import { expect, test } from '@playwright/test';
import { diagramReady, openEditor, pasteAtEnd } from './helpers.js';

test('390 px: tabs switch panes, overflow menu, no horizontal scroll', async ({ page }) => {
  await openEditor(page);
  await expect(page.getByRole('tab', { name: 'Code' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await expect(page.locator('#ed-pane-diagram')).toBeVisible();
  await expect(page.locator('#ed-pane-code')).toBeHidden();
  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Export' })).toBeVisible();
  await page.keyboard.press('Escape');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('390 px: the hidden diagram never shows through the code tab', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'New' }).click();
  await page.getByRole('menuitem', { name: 'From example' }).click();
  await page.getByRole('menuitem', { name: /E-commerce/ }).click();
  await diagramReady(page);
  await expect(page.getByRole('tab', { name: 'Code' })).toHaveAttribute('aria-selected', 'true');
  const nodes = page.locator('.react-flow__node-rvTable');
  await expect(nodes).toHaveCount(13);
  for (const node of await nodes.all()) await expect(node).toBeHidden();
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await expect(nodes.first()).toBeVisible();
  await expect(page.locator('.monaco-editor').first()).toBeHidden();
  await page.getByRole('tab', { name: 'Code' }).click();
  await expect(page.locator('.monaco-editor').first()).toBeVisible();
  for (const node of await nodes.all()) await expect(node).toBeHidden();
});

test('390 px: touch targets are 44 px and the share link field is readable', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('tab', { name: 'Diagram' }).click();
  for (const name of ['Save', 'Share', 'More actions', 'Zoom in', 'Fit diagram']) {
    const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.height, name).toBeGreaterThanOrEqual(44);
    expect(box.width, name).toBeGreaterThanOrEqual(44);
  }
  const diag = (await page.locator('.ed-status__diag').boundingBox())!;
  expect(diag.height).toBeGreaterThanOrEqual(36);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const field = (await page.locator('#ed-share-link').boundingBox())!;
  expect(field.height).toBeGreaterThanOrEqual(36);
  expect(await page.locator('#ed-share-link').evaluate((el) => getComputedStyle(el).fontSize)).toBe(
    '14px',
  );
});

test('390 px: code wraps and the gutter is only line numbers', async ({ page }) => {
  await openEditor(page);
  await pasteAtEnd(page, `// ${'wrap '.repeat(80)}end`);
  const editor = page.locator('.monaco-editor').first();
  // One line of text, drawn on several screen rows, and no horizontal scrollbar.
  await expect.poll(() => editor.locator('.view-line').count()).toBeGreaterThan(3);
  expect(
    await editor.locator('.view-lines').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  // No glyph margin, no folding arrows: the gutter is the line numbers (2 digits) and a little gap.
  await expect(editor.locator('.cldr.codicon-folding-expanded, .folding')).toHaveCount(0);
  const gutter = (await editor.locator('.margin').boundingBox())!;
  expect(gutter.width).toBeLessThan(40);
});
