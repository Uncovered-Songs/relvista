/** Every example opens from the examples picker and draws all its tables, without errors. */
import { expect, test } from '@playwright/test';
import { exampleExpectations } from './fixtures.js';
import { diagramReady, openEditor, trackErrors } from './helpers.js';

const expected = await exampleExpectations();

test('the examples picker lists every example in examples/', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'From example' }).click();
  await page.getByRole('menuitem', { name: /Browse all examples/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Open an example' });
  await expect(dialog.locator('.ed-example')).toHaveCount(expected.length);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

for (let i = 0; i < expected.length; i++) {
  test(`picker entry ${i + 1} opens with every table drawn`, async ({ page }) => {
    const errors = trackErrors(page);
    await openEditor(page);
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('menuitem', { name: 'From example' }).click();
    await page.getByRole('menuitem', { name: /Browse all examples/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Open an example' });
    await dialog.locator('.ed-example').nth(i).click();
    await expect(dialog).toBeHidden();
    // Examples load asynchronously: wait until the document is one of them.
    const names = new Set(expected.map((e) => e.fileName));
    await expect
      .poll(async () => names.has((await page.locator('.ed-filename__name').textContent()) ?? ''))
      .toBe(true);
    await diagramReady(page);

    const name = (await page.locator('.ed-filename__name').textContent())!.trim();
    const ex = expected.find((e) => e.fileName === name);
    expect(ex, `an example named ${name}`).toBeDefined();
    test.info().annotations.push({ type: 'example', description: ex!.id });

    await expect(page.locator('.react-flow__node-rvTable')).toHaveCount(ex!.tables);
    await expect(page.locator('.ed-status')).toContainText(
      `${ex!.tables} table${ex!.tables === 1 ? '' : 's'}`,
    );
    await expect(page.locator('.ed-status__diag--error')).toHaveCount(0);
    await expect(page.locator('.ed-chip--error')).toHaveCount(0);
    await expect(page.locator('.monaco-editor .squiggly-error')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}
