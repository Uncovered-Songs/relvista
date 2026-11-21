/**
 * AGPL-3.0 §13 (decision 0006): Help states the editor's licence and links to its source code.
 */
import { expect, test } from '@playwright/test';
import { openEditor } from './helpers.js';

test('Help shows the AGPL licence and a Source code link', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'Help and shortcuts' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('AGPL-3.0-or-later');
  const source = dialog.getByRole('link', { name: 'Source code', exact: true });
  await expect(source).toBeVisible();
  await expect(source).toHaveAttribute(
    'href',
    'https://github.com/relvista/relvista/tree/main/apps/editor',
  );
  await expect(
    dialog.getByRole('link', { name: /GNU Affero General Public License/ }),
  ).toHaveAttribute('href', 'https://github.com/relvista/relvista/blob/main/apps/editor/LICENSE');
});
