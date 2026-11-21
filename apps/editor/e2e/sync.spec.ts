import { expect, test } from '@playwright/test';
import { diagramReady, focusEditor, openEditor, pasteAtEnd } from './helpers.js';

test('click a table → cursor on its line; cursor in a block → node highlighted', async ({
  page,
}) => {
  await openEditor(page);
  await pasteAtEnd(page, 'Table a {\n  id int\n}\n\nTable b {\n  id int\n}\n');
  await diagramReady(page);
  await page.locator('.react-flow__node[data-id="public.b"]').click();
  await expect(page.locator('.ed-status')).toContainText('Ln 5, Col 1'); // `Table b` line
  await focusEditor(page); // line 1: table a
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.react-flow__node[data-id="public.a"] .rv-highlighted')).toHaveCount(
    1,
  );
  await expect(page.locator('.react-flow__node[data-id="public.b"] .rv-highlighted')).toHaveCount(
    0,
  );
});
