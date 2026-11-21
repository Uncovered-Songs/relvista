import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXAMPLES_DIR } from './fixtures.js';
import { diagramReady, openEditor, pasteAtEnd } from './helpers.js';

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Waits until the viewport transform stops changing (framing animations are 250 ms). */
async function viewportSettled(page: Page): Promise<void> {
  let last = '';
  await expect
    .poll(
      async () => {
        await page.waitForTimeout(150);
        const t = await page.evaluate(
          () =>
            document.querySelector<HTMLElement>('.ed-diagram .react-flow__viewport')?.style
              .transform ?? '',
        );
        const same = t === last;
        last = t;
        return same;
      },
      { timeout: 10_000 },
    )
    .toBe(true);
}

test('390 px: tabs switch panes, overflow menu, no horizontal scroll', async ({ page }) => {
  await openEditor(page);
  await expect(page.getByRole('tab', { name: 'Code' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await expect(page.locator('#ed-pane-diagram')).toBeVisible();
  await expect(page.locator('#ed-pane-code')).toBeHidden();
  await page.getByRole('button', { name: 'More actions' }).click();
  await expect(page.getByRole('menuitem', { name: 'Export' })).toBeVisible();
  await page.keyboard.press('Escape');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test('390 px: the hidden diagram never shows through the code tab', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'New' }).click();
  await page.getByRole('menuitem', { name: 'From example' }).click();
  await page.getByRole('menuitem', { name: /E-commerce/ }).click();
  await diagramReady(page);
  await expect(page.getByRole('tab', { name: 'Code' })).toHaveAttribute('aria-selected', 'true');
  const nodes = page.locator('.react-flow__node-rvTable');
  await expect(nodes).toHaveCount(13);
  for (const node of await nodes.all()) await expect(node).toBeHidden();
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await expect(nodes.first()).toBeVisible();
  await expect(page.locator('.monaco-editor').first()).toBeHidden();
  await page.getByRole('tab', { name: 'Code' }).click();
  await expect(page.locator('.monaco-editor').first()).toBeVisible();
  for (const node of await nodes.all()) await expect(node).toBeHidden();
});

test('390 px: touch targets are 44 px and the share link field is readable', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('tab', { name: 'Diagram' }).click();
  for (const name of ['Save', 'Share', 'More actions', 'Zoom in', 'Fit diagram']) {
    const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!;
    expect(box.height, name).toBeGreaterThanOrEqual(44);
    expect(box.width, name).toBeGreaterThanOrEqual(44);
  }
  const diag = (await page.locator('.ed-status__diag').boundingBox())!;
  expect(diag.height).toBeGreaterThanOrEqual(36);
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  const field = (await page.locator('#ed-share-link').boundingBox())!;
  expect(field.height).toBeGreaterThanOrEqual(36);
  expect(await page.locator('#ed-share-link').evaluate((el) => getComputedStyle(el).fontSize)).toBe(
    '14px',
  );
});

test('390 px: code wraps and the gutter is only line numbers', async ({ page }) => {
  await openEditor(page);
  await pasteAtEnd(page, `// ${'wrap '.repeat(80)}end`);
  const editor = page.locator('.monaco-editor').first();
  // One line of text, drawn on several screen rows, and no horizontal scrollbar.
  await expect.poll(() => editor.locator('.view-line').count()).toBeGreaterThan(3);
  expect(
    await editor.locator('.view-lines').evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  // No glyph margin, no folding arrows: the gutter is the line numbers (2 digits) and a little gap.
  await expect(editor.locator('.cldr.codicon-folding-expanded, .folding')).toHaveCount(0);
  const gutter = (await editor.locator('.margin').boundingBox())!;
  expect(gutter.width).toBeLessThan(40);
});

test('390 px: the Changes sheet stays at the bottom, open or hidden, clear of the toolbar', async ({
  page,
}) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'New' }).click();
  await page.getByRole('menuitem', { name: 'From example' }).click();
  await page.getByRole('menuitem', { name: /E-commerce/ }).click();
  await diagramReady(page);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: /^Compare/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Compare' });
  await dialog.getByRole('radio', { name: 'Paste' }).check();
  await dialog
    .getByLabel('DBML of the other version')
    .fill('Table users {\n  id integer [pk]\n}\nTable wishlists {\n  id integer [pk]\n}\n');
  await dialog.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('tab', { name: 'Diagram' }).click();
  const sheet = page.locator('.ed-diagram .ed-changes');
  await expect(sheet).toBeVisible();
  const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
  for (const state of ['open', 'hidden'] as const) {
    if (state === 'hidden') {
      await sheet.getByRole('button', { name: 'Hide' }).click();
      await expect(sheet).toHaveAttribute('data-open', 'false');
    }
    const s = await box('.ed-diagram .ed-changes');
    const pane = await box('.ed-diagram');
    const toolbar = await box('.ed-diagram [role="toolbar"][aria-label="Diagram"]');
    const legend = await box('.ed-diagram .ed-nav-legend');
    const detail = await box('.ed-diagram .ed-nav-detail');
    expect(overlaps(s, toolbar), `${state}: sheet over the toolbar`).toBe(false);
    expect(overlaps(s, legend), `${state}: sheet over the legend`).toBe(false);
    expect(overlaps(s, detail), `${state}: sheet over the detail switch`).toBe(false);
    // Docked at the bottom of the diagram, just above the detail switch.
    expect(s.y + s.height, state).toBeGreaterThan(pane.y + pane.height - 80);
    await page.screenshot({
      path: test.info().outputPath(`compare-sheet-${state}.png`),
    });
  }
});

test('390 px: compare frames the changes clear of the toolbar, legend and Changes sheet', async ({
  page,
}) => {
  // Older 02-ecommerce: no tags table, users.email narrower; the review's flow.
  const ecommerce = readFileSync(join(EXAMPLES_DIR, '02-ecommerce.dbml'), 'utf8');
  const older = ecommerce
    .replace(/\nTable tags \{[\s\S]*?\n\}\n/, '\n')
    .replace(/\nRef product_tags:[^\n]*\n/, '\n')
    .replace('email varchar(255)', 'email varchar(100)');
  expect(older).not.toBe(ecommerce);
  await openEditor(page);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'New' }).click();
  await page.getByRole('menuitem', { name: 'From example' }).click();
  await page.getByRole('menuitem', { name: /E-commerce/ }).click();
  await diagramReady(page);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: /^Compare/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Compare' });
  await dialog.getByRole('radio', { name: 'Paste' }).check();
  await dialog.getByLabel('DBML of the other version').fill(older);
  await dialog.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.getByRole('tab', { name: 'Diagram' }).click();
  const sheet = page.locator('.ed-diagram .ed-changes');
  await expect(sheet).toBeVisible();
  const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
  for (const state of ['open', 'hidden', 'shown again'] as const) {
    if (state === 'hidden') await sheet.getByRole('button', { name: 'Hide' }).click();
    if (state === 'shown again') await sheet.getByRole('button', { name: 'Show' }).click();
    await viewportSettled(page);
    const covers = [
      await box('.ed-diagram [role="toolbar"][aria-label="Diagram"]'),
      await box('.ed-diagram .ed-nav-legend'),
      await box('.ed-diagram .ed-changes'),
    ];
    const pane = await box('.ed-diagram .rv-canvas');
    for (const id of ['public.users', 'public.tags']) {
      const t = await box(`.ed-diagram .react-flow__node[data-id="${id}"]`);
      for (const c of covers)
        expect(overlaps(t, c), `${state}: ${id} under an overlay`).toBe(false);
      expect(t.y, `${state}: ${id} inside the pane`).toBeGreaterThanOrEqual(pane.y);
      expect(t.x).toBeGreaterThanOrEqual(pane.x);
      expect(t.x + t.width).toBeLessThanOrEqual(pane.x + pane.width);
    }
    await page.screenshot({
      path: test.info().outputPath(`compare-framed-${state.replace(' ', '-')}.png`),
    });
  }
});

/** Holds a finger on (x, y) for `ms`, then lifts it (raw touch events, as a phone sends them). */
async function longPress(page: Page, x: number, y: number, ms = 700): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const points = [{ x, y, id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  await page.waitForTimeout(ms);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test('390 px: a long-press opens the table and canvas menus (no right-click on touch)', async ({
  page,
}) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'More actions' }).click();
  await page.getByRole('menuitem', { name: 'New' }).click();
  await page.getByRole('menuitem', { name: 'From example' }).click();
  await page.getByRole('menuitem', { name: /E-commerce/ }).click();
  await diagramReady(page);
  await page.getByRole('tab', { name: 'Diagram' }).click();
  await viewportSettled(page);

  // A table on screen, not under an overlay: Show related ▸ is there (the v1 actions live in this
  // menu).
  const t = await page.evaluate(() => {
    for (const n of document.querySelectorAll<HTMLElement>(
      '.ed-diagram .react-flow__node-rvTable',
    )) {
      const r = n.getBoundingClientRect();
      const x = r.x + r.width / 2;
      const y = r.y + 12;
      if (n.contains(document.elementFromPoint(x, y))) return { x, y };
    }
    return null;
  });
  expect(t).not.toBeNull();
  await longPress(page, t!.x, t!.y);
  const menu = page.getByRole('menu').first();
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Show related/ })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('longpress-table.png') });
  // A tap outside closes it (the status bar: nothing there reacts to a tap).
  const status = (await page.locator('.ed-status, footer').first().boundingBox())!;
  await page.touchscreen.tap(status.x + status.width / 2, status.y + status.height / 2);
  await expect(page.getByRole('menu')).toHaveCount(0);

  // A short tap opens no menu (moving and second fingers: test/longPress.test.ts).
  await page.touchscreen.tap(t!.x, t!.y);
  await page.waitForTimeout(700);
  await expect(page.getByRole('menu')).toHaveCount(0);

  // The empty canvas: the pane menu (Add note here).
  const pane = (await page.locator('.ed-diagram .rv-canvas').boundingBox())!;
  const empty = await page.evaluate(
    ({ x0, y0, w, h }) => {
      for (let y = y0 + h * 0.3; y < y0 + h * 0.8; y += 12)
        for (let x = x0 + 20; x < x0 + w - 20; x += 12) {
          const el = document.elementFromPoint(x, y);
          if (el?.classList.contains('react-flow__pane')) return { x, y };
        }
      return null;
    },
    { x0: pane.x, y0: pane.y, w: pane.width, h: pane.height },
  );
  expect(empty).not.toBeNull();
  await longPress(page, empty!.x, empty!.y);
  await expect(page.getByRole('menuitem', { name: /Add note here/ })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('longpress-pane.png') });
});
