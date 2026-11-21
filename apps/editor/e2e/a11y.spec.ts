import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { diagramReady, openEditor } from './helpers.js';

async function axe(page: Page): Promise<void> {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('.monaco-editor')
    .analyze();
  expect(
    r.violations.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    ),
  ).toEqual([]);
}

for (const theme of ['light', 'dark'] as const) {
  test(`axe clean (${theme}), with Share and Help open`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await openEditor(page);
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('menuitem', { name: 'From example' }).click();
    await page.getByRole('menuitem', { name: /^Minimal/ }).click();
    await diagramReady(page);
    await axe(page);
    await page.getByRole('button', { name: 'Share' }).click();
    await axe(page);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Help and shortcuts' }).click();
    await axe(page);
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`axe clean (${theme}): search panel, path mode, Compare dialog and mode, PDF dialog`, async ({
    page,
  }) => {
    await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
    await openEditor(page);
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.getByRole('menuitem', { name: 'From example' }).click();
    await page.getByRole('menuitem', { name: /E-commerce/ }).click();
    await diagramReady(page);
    // Search panel with hits listed, then path mode.
    await page.locator('.ed-diagram').getByRole('button', { name: 'Search', exact: true }).click();
    await page.locator('.ed-diagram').getByRole('combobox', { name: 'Search' }).fill('order');
    await expect(
      page.locator('.ed-diagram .rv-nav-search').getByRole('option').first(),
    ).toBeVisible();
    await axe(page);
    await page.locator('.ed-diagram').getByRole('button', { name: 'Path' }).click();
    await expect(page.locator('.ed-diagram').getByRole('combobox', { name: 'From' })).toBeFocused();
    await axe(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(page.locator('.ed-diagram .rv-nav-search')).toHaveCount(0);
    // Compare dialog, then compare mode (Changes panel, legend).
    await page.locator('.ed-filename').click();
    await page.keyboard.press('ControlOrMeta+Alt+KeyD');
    const dialog = page.getByRole('dialog', { name: 'Compare' });
    await dialog.getByRole('radio', { name: 'Paste' }).check();
    await dialog.getByLabel('DBML of the other version').fill('Table users {\n  id integer\n}\n');
    await axe(page);
    await dialog.getByRole('button', { name: 'Compare', exact: true }).click();
    await expect(page.getByRole('complementary', { name: 'Changes' })).toBeVisible();
    await axe(page);
    await page.getByRole('button', { name: 'Exit compare' }).click();
    // PDF dialog.
    await page.getByRole('button', { name: 'Export' }).click();
    await page.getByRole('menuitem', { name: /^PDF…/ }).click();
    await expect(page.getByRole('dialog', { name: 'Export PDF' })).toBeVisible();
    // After its 120 ms fade-in (axe would measure the colours half-transparent).
    await page.waitForTimeout(300);
    await axe(page);
  });
}

test('keyboard path: Tab to Open, Enter, Esc returns focus', async ({ page }) => {
  await openEditor(page);
  const open = page.getByRole('button', { name: 'Open', exact: true });
  for (let i = 0; i < 10 && !(await open.evaluate((el) => el === document.activeElement)); i++) {
    await page.keyboard.press('Tab');
  }
  await expect(open).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: /Open file/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(open).toBeFocused();
});
