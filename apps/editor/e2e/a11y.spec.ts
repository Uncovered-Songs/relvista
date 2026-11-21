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
