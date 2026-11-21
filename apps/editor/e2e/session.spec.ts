import { expect, test } from '@playwright/test';
import { diagramReady, openEditor, pasteAtEnd } from './helpers.js';

test('edit → reload → text and view restored; unload guard when dirty', async ({ page }) => {
  await openEditor(page);
  await pasteAtEnd(page, 'Table kept {\n  id int\n}\n');
  await diagramReady(page);
  await page.waitForTimeout(800); // autosave debounce
  await page.reload();
  await expect(page.locator('.ed-app[data-ready="true"]')).toBeVisible();
  await expect(page.locator('.react-flow__node[data-id="public.kept"]')).toBeVisible();
  await expect(page.locator('.monaco-editor .view-line').first()).toContainText('Table kept');

  let dialog = false;
  page.on('dialog', (d) => {
    dialog = d.type() === 'beforeunload';
    void d.dismiss();
  });
  await page
    .locator('.monaco-editor .view-lines')
    .first()
    .click({ position: { x: 30, y: 6 } });
  await page.keyboard.type('x');
  await page.close({ runBeforeUnload: true });
  await expect.poll(() => dialog).toBe(true);
});
