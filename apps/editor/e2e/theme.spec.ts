import { expect, test } from '@playwright/test';
import { diagramReady, openEditor, openExampleFromPicker } from './helpers.js';

test('theme button cycles system → light → dark and the diagram follows', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await openEditor(page);
  await openExampleFromPicker(page, 'Minimal');
  await diagramReady(page);
  const html = page.locator('html');
  const canvas = page.locator('.rv-canvas');
  const button = page.getByRole('button', { name: /theme \(click to change\)/ });
  await expect(button).toHaveAccessibleName('System theme (click to change)');
  await expect(html).toHaveAttribute('data-theme', 'light');
  await expect(canvas).toHaveAttribute('data-rv-color-mode', 'light');

  const seen: string[] = [];
  for (let i = 0; i < 3 && (await html.getAttribute('data-theme')) !== 'dark'; i++) {
    await button.click();
    seen.push((await button.getAttribute('aria-label'))!);
  }
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await expect(canvas).toHaveAttribute('data-rv-color-mode', 'dark');
  expect(seen.at(-1)).toBe('Dark theme (click to change)');
  // The canvas and the code editor really change colour.
  const bg = await canvas.evaluate((el) => getComputedStyle(el).getPropertyValue('--rv-canvas-bg'));
  expect(bg.trim()).toBe('#0f1217');
  await expect(page.locator('.monaco-editor').first()).toHaveClass(
    /vs-dark|hc-black|relvista-dark/,
  );

  // The choice survives a reload (localStorage 'theme', shared with the docs site).
  await page.reload();
  await expect(page.locator('.ed-app[data-ready="true"]')).toBeVisible();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe('dark');
});

test('system theme follows the OS colour scheme', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openEditor(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
