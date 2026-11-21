import { expect, test } from '@playwright/test';
import { diagramReady, openEditor, trackErrors } from './helpers.js';

test('New ▸ From example ▸ E-commerce draws every table without console errors', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await openEditor(page);
  await expect(page.getByText('Start typing DBML, or open an example')).toBeVisible();
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'From example' }).click();
  await page.getByRole('menuitem', { name: /E-commerce/ }).click();
  await diagramReady(page);
  await expect(page.locator('.ed-status')).toContainText('13 tables');
  await expect(page.locator('.react-flow__node-rvTable')).toHaveCount(13);
  await expect(page.locator('.ed-chip--top')).toHaveCount(0);
  expect(errors).toEqual([]);
});
