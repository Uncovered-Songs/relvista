/**
 * The combined Pages site: docs at /, the editor at /editor/. Docs pages link to
 * the editor, and "Open in editor" on a docs diagram lands in the editor with that diagram.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLES_DIR } from './fixtures.js';
import { diagramReady, documentText, needsDocsSite, trackErrors } from './helpers.js';

test.beforeEach(() => needsDocsSite());

const example = (name: string) => readFileSync(join(EXAMPLES_DIR, name), 'utf8');

async function editorReady(page: Page): Promise<void> {
  await expect(page.locator('.ed-app[data-ready="true"]')).toBeVisible();
  await diagramReady(page);
}

test('the docs navbar links to the editor', async ({ page }) => {
  await page.goto('/');
  const link = page.locator('.navbar').getByRole('link', { name: 'Editor', exact: true });
  await expect(link).toHaveAttribute('href', '/editor/');
  await link.click();
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('.ed-app[data-ready="true"]')).toBeVisible();
});

test('the deployed Help dialog never shows the 0.0.0 placeholder version', async ({ page }) => {
  await page.goto('/editor/');
  await expect(page.locator('.ed-app[data-ready="true"]')).toBeVisible();
  await page.getByRole('button', { name: 'Help and shortcuts' }).click();
  const brand = page.locator('.ed-help__brand');
  await expect(brand).toContainText(/editor( \d+\.\d+\.\d+\S*)?$/);
  await expect(brand).not.toContainText('0.0.0');
});

test('/editor (no slash) redirects to the editor, like GitHub Pages', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/editor');
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('.ed-app[data-ready="true"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('landing page: "Open the editor" CTA', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Open the editor' }).click();
  await expect(page).toHaveURL(/\/editor\/$/);
  await expect(page.locator('.ed-app[data-ready="true"]')).toBeVisible();
});

test('landing page: "Edit this example in the editor" opens the blog example', async ({ page }) => {
  await page.goto('/');
  const link = page.getByTestId('edit-in-editor');
  await expect(link).toHaveAttribute('href', /^\/editor\/#dbml=[A-Za-z0-9_-]+$/);
  await link.click();
  await editorReady(page);
  await expect(page.locator('.react-flow__node-rvTable')).toHaveCount(2);
  expect(await documentText(page)).toContain('author_id integer [ref: > users.id]');
});

test('gallery "Open in editor" lands in the editor with that DBML', async ({ page, context }) => {
  await page.goto('/docs/gallery/02-ecommerce');
  const viewer = page.locator('.relvista-diagram .rv-viewer').first();
  await expect(viewer).toHaveAttribute('data-rv-layout', 'done');
  const open = viewer.getByRole('link', { name: 'Open in editor' });
  await expect(open).toHaveAttribute('href', /^\/editor\/#dbml=/);
  const [editor] = await Promise.all([context.waitForEvent('page'), open.click()]);
  await editorReady(editor);
  await expect(editor.locator('.react-flow__node-rvTable')).toHaveCount(13);
  expect(await documentText(editor)).toBe(example('02-ecommerce.dbml'));
  expect(new URL(editor.url()).hash).toBe('');
});

test('gallery view diagram opens the editor in that view', async ({ page, context }) => {
  await page.goto('/docs/gallery/08-diagram-views');
  // The second diagram on the page is the featured DiagramView.
  const viewed = page.locator('.relvista-diagram').nth(1);
  await viewed.scrollIntoViewIfNeeded();
  const view = await viewed.getAttribute('data-rv-view');
  expect(view && view !== '*').toBeTruthy();
  const viewer = viewed.locator('.rv-viewer');
  await expect(viewer).toHaveAttribute('data-rv-layout', 'done');
  const [editor] = await Promise.all([
    context.waitForEvent('page'),
    viewer.getByRole('link', { name: 'Open in editor' }).click(),
  ]);
  await editorReady(editor);
  await expect(editor.getByRole('button', { name: `View: ${view!}` })).toBeVisible();
});

test('the theme choice is shared between the docs and the editor', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/editor/');
  await expect(page.locator('.ed-app[data-ready="true"]')).toBeVisible();
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));
  await page.goto('/docs/getting-started');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
