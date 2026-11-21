import { expect, test } from '@playwright/test';
import { diagramReady, openEditor, pasteAtEnd } from './helpers.js';

test('typing a table draws it; errors keep the last good diagram', async ({ page }) => {
  await openEditor(page);
  await pasteAtEnd(page, 'Table users {\n  id int [pk]\n}\n\n');
  await expect(page.locator('.react-flow__node-rvTable')).toHaveCount(1, { timeout: 1000 });
  await diagramReady(page);
  await expect(page.locator('.ed-status')).toContainText('1 table');

  // Break the syntax: an unknown setting.
  await page.keyboard.type('Ref: users.nope >');
  await expect(page.locator('.ed-status__diag')).toContainText(/[1-9]\d* errors?/);
  await expect(page.locator('.ed-chip--error')).toContainText('Showing the last valid diagram');
  await expect(page.locator('.monaco-editor .squiggly-error').first()).toBeAttached();
  await expect(page.locator('.react-flow__node-rvTable')).toHaveCount(1);

  // Fix it: remove the broken line.
  for (let i = 0; i < 'Ref: users.nope >'.length; i++) await page.keyboard.press('Backspace');
  await expect(page.locator('.ed-chip--error')).toHaveCount(0);
  await pasteAtEnd(page, '\nTable posts {\n  id int [pk]\n  user_id int [ref: > users.id]\n}\n');
  await expect(page.locator('.react-flow__node-rvTable')).toHaveCount(2);
});
