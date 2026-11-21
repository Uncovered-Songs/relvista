import { expect, test } from '@playwright/test';
import { diagramReady, openEditor } from './helpers.js';

const CORS = { 'access-control-allow-origin': '*' };
const LAYOUT = JSON.stringify({
  version: 1,
  views: { '*': { nodes: { 'public.remote': { x: 1000, y: 40, pinned: true } } } },
});

test('?url= loads the file and its sidecar, then drops the parameter', async ({ page }) => {
  await page.route('https://example.test/db/schema.dbml', (r) =>
    r.fulfill({ body: 'Table remote {\n  id int\n}\n', headers: CORS }),
  );
  await page.route('https://example.test/db/schema.dbml.layout.json', (r) =>
    r.fulfill({ body: LAYOUT, headers: CORS }),
  );
  await openEditor(page, `?url=${encodeURIComponent('https://example.test/db/schema.dbml')}`);
  await expect(page.locator('.ed-filename__name')).toHaveText('schema.dbml');
  await diagramReady(page);
  await expect(page.locator('.react-flow__node[data-id="public.remote"]')).toBeVisible();
  expect(new URL(page.url()).search).toBe('');
});

test('GitHub blob URLs are rewritten to raw', async ({ page }) => {
  await page.route('https://raw.githubusercontent.com/o/r/main/a.dbml', (r) =>
    r.fulfill({ body: 'Table gh {\n  id int\n}\n', headers: CORS }),
  );
  await page.route('https://raw.githubusercontent.com/o/r/main/a.dbml.layout.json', (r) =>
    r.fulfill({ status: 404, headers: CORS }),
  );
  await openEditor(page, `?url=${encodeURIComponent('https://github.com/o/r/blob/main/a.dbml')}`);
  await expect(page.locator('.react-flow__node[data-id="public.gh"]')).toBeVisible();
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
