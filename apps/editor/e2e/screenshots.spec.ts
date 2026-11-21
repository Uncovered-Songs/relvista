/**
 * Screenshots of the editor for review (not compared): desktop light and dark with 02-ecommerce
 * and 14-large, an error state, and the phone layout. Override the folder with
 * RELVISTA_EDITOR_SHOTS=<dir>.
 */
import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { diagramReady, focusEditor, openEditor, openExampleFromPicker } from './helpers.js';

const SHOTS =
  process.env.RELVISTA_EDITOR_SHOTS ?? join(process.cwd(), 'test-results', 'screenshots');
mkdirSync(SHOTS, { recursive: true });

async function settle(page: Page): Promise<void> {
  await diagramReady(page);
  // Let fit-view animations and Monaco's decorations finish.
  await page.waitForTimeout(700);
}

async function shoot(page: Page, name: string): Promise<void> {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

for (const mode of ['light', 'dark'] as const) {
  for (const [title, slug] of [
    ['E-commerce', '02-ecommerce'],
    ['Large SaaS schema', '14-large'],
  ] as const) {
    test(`desktop ${mode} · ${slug}`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: mode });
      await openEditor(page);
      await openExampleFromPicker(page, title);
      await settle(page);
      await expect(page.locator('html')).toHaveAttribute('data-theme', mode);
      await shoot(page, `desktop-${mode}-${slug}`);
    });
  }

  test(`desktop ${mode} · error state`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: mode });
    await openEditor(page);
    await openExampleFromPicker(page, 'E-commerce');
    await settle(page);
    await focusEditor(page);
    // End of document: Ctrl+End on Linux / Windows, Cmd+Down on macOS.
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('ControlOrMeta+ArrowDown');
    await page.keyboard.type('\nRef: orders.nope > users.id');
    await expect(page.locator('.ed-chip--error')).toBeVisible();
    await expect(page.locator('.monaco-editor .squiggly-error').first()).toBeAttached();
    await page.keyboard.press('Escape'); // close the completion list
    await page.waitForTimeout(400);
    await shoot(page, `desktop-${mode}-error`);
  });

  test(`desktop ${mode} · empty state`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: mode });
    await openEditor(page);
    await page.waitForTimeout(300);
    await shoot(page, `desktop-${mode}-empty`);
  });
}

test('phone 390×844 · code and diagram tabs', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await openEditor(page);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'New' }).click();
  await page.getByRole('menuitem', { name: 'From example' }).click();
  await page.getByRole('menuitem', { name: /E-commerce/ }).click();
  await diagramReady(page);
  await page.waitForTimeout(500);
  await shoot(page, 'mobile-code');
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await page.waitForTimeout(700);
  await shoot(page, 'mobile-diagram');
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.waitForTimeout(200);
  await shoot(page, 'mobile-menu');
  await context.close();
});
