import { expect, test, type Page } from '@playwright/test';
import { diagramReady, openEditor, trackErrors } from './helpers.js';

const CORS = { 'access-control-allow-origin': '*' };
const LAYOUT = JSON.stringify({
  version: 1,
  views: { '*': { nodes: { 'public.remote': { x: 1000, y: 40, pinned: true } } } },
});

const FILE = 'https://example.test/db/schema.dbml';

/** Serves the .dbml and (optionally) its sidecar; returns every example.test URL requested. */
async function serveRemote(page: Page, sidecar: boolean): Promise<string[]> {
  const requested: string[] = [];
  await page.route('https://example.test/**', (r) => {
    const url = r.request().url();
    requested.push(url);
    if (url === FILE) return r.fulfill({ body: 'Table remote {\n  id int\n}\n', headers: CORS });
    if (sidecar && url === `${FILE}.layout.json`) return r.fulfill({ body: LAYOUT, headers: CORS });
    return r.fulfill({ status: 404, body: 'no', headers: CORS });
  });
  return requested;
}

test('?url= alone loads the file and asks for nothing else (no 404 noise)', async ({ page }) => {
  const requested = await serveRemote(page, true);
  const errors = trackErrors(page);
  await openEditor(page, `?url=${encodeURIComponent(FILE)}`);
  await expect(page.locator('.ed-filename__name')).toHaveText('schema.dbml');
  await diagramReady(page);
  await expect(page.locator('.react-flow__node[data-id="public.remote"]')).toBeVisible();
  expect(requested).toEqual([FILE]);
  expect(errors).toEqual([]);
  expect(new URL(page.url()).search).toBe('');
});

test('?url=&layout loads the sidecar next to it, then drops both parameters', async ({ page }) => {
  const requested = await serveRemote(page, true);
  await openEditor(page, `?url=${encodeURIComponent(FILE)}&layout`);
  await diagramReady(page);
  const node = page.locator('.react-flow__node[data-id="public.remote"]');
  await expect(node).toBeVisible();
  // The saved position (x 1000) wins over auto-layout.
  expect(await node.evaluate((el) => (el as HTMLElement).style.transform)).toContain('1000px');
  expect(requested).toEqual([FILE, `${FILE}.layout.json`]);
  expect(new URL(page.url()).search).toBe('');
});

test('&layout with no sidecar there opens the file quietly', async ({ page }) => {
  const requested = await serveRemote(page, false);
  await openEditor(page, `?url=${encodeURIComponent(FILE)}&layout=auto`);
  await diagramReady(page);
  await expect(page.locator('.react-flow__node[data-id="public.remote"]')).toBeVisible();
  expect(requested).toEqual([FILE, `${FILE}.layout.json`]);
  await expect(page.locator('.ed-toast')).toHaveCount(0);
});

test('&layout=<url> loads that file; a missing one is reported', async ({ page }) => {
  const requested = await serveRemote(page, false);
  await openEditor(page, `?url=${encodeURIComponent(FILE)}&layout=other.json`);
  await diagramReady(page);
  expect(requested).toEqual([FILE, 'https://example.test/db/other.json']);
  await expect(page.locator('.ed-toast')).toContainText('layout file could not be loaded');
});

test('Open from URL: the layout checkbox asks for the sidecar', async ({ page }) => {
  const requested = await serveRemote(page, true);
  await openEditor(page);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('menuitem', { name: /Open from URL/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Open from URL' });
  await dialog.getByRole('textbox').fill(FILE);
  await dialog.getByRole('checkbox', { name: /layout file/ }).check();
  await dialog.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page.locator('.ed-filename__name')).toHaveText('schema.dbml');
  await diagramReady(page);
  expect(requested).toEqual([FILE, `${FILE}.layout.json`]);
});

test('GitHub blob URLs are rewritten to raw', async ({ page }) => {
  const requested: string[] = [];
  await page.route('https://raw.githubusercontent.com/**', (r) => {
    requested.push(r.request().url());
    return r.fulfill({ body: 'Table gh {\n  id int\n}\n', headers: CORS });
  });
  await openEditor(page, `?url=${encodeURIComponent('https://github.com/o/r/blob/main/a.dbml')}`);
  await expect(page.locator('.react-flow__node[data-id="public.gh"]')).toBeVisible();
  expect(requested).toEqual(['https://raw.githubusercontent.com/o/r/main/a.dbml']);
});

test('404 shows a dialog with the reason and the URL', async ({ page }) => {
  await page.route('https://example.test/missing.dbml', (r) =>
    r.fulfill({ status: 404, body: 'no', headers: CORS }),
  );
  await openEditor(page, `?url=${encodeURIComponent('https://example.test/missing.dbml')}`);
  const dialog = page.getByRole('dialog', { name: 'Could not open the URL' });
  await expect(dialog).toContainText('404');
  await expect(dialog).toContainText('https://example.test/missing.dbml');
});
