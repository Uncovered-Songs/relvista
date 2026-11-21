import { expect, test } from '@playwright/test';
import { diagramReady, openEditor, pasteAtEnd } from './helpers.js';

const SRC = `// c
Table users {
  id int [pk]
  email varchar [note: '''multi''']
}

Table posts {
  id int [pk, default: \`now()\`]
  user_id int
}

Ref: posts.user_id > users.id
`;

test('completion, go to definition, hover and token colours', async ({ page }) => {
  await openEditor(page);
  await pasteAtEnd(page, SRC);
  await expect(page.locator('.ed-status')).toContainText('2 tables');
  await diagramReady(page);

  // F12 on `users` in the Ref line jumps to line 2.
  const refLine = page.locator('.view-line', { hasText: 'Ref: posts.user_id > users.id' });
  await refLine.click();
  await page.keyboard.press('Home');
  for (let i = 0; i < 22; i++) await page.keyboard.press('ArrowRight'); // inside `users`
  await page.keyboard.press('F12');
  await expect(page.locator('.ed-status')).toContainText('Ln 2,');

  // Hover on the table name shows its columns.
  await page
    .locator('.view-line', { hasText: 'Table users {' })
    .locator('span span', { hasText: 'users' })
    .last()
    .hover();
  await expect(page.locator('.monaco-hover', { hasText: 'email' }).first()).toBeVisible();

  // Theme colours on tokens.
  const color = (text: string) =>
    page
      .locator('.view-line span span', { hasText: text })
      .first()
      .evaluate((el) => getComputedStyle(el).color);
  expect(await color('Table')).toBe('rgb(47, 111, 237)');
  expect(await color("'''multi'''")).toBe('rgb(15, 123, 108)');
  expect(await color('`now()`')).toBe('rgb(15, 123, 108)');
  expect(await color('// c')).toBe('rgb(107, 116, 134)');

  // Completion after `ref: > ` lists tables.
  await page.locator('.view-line', { hasText: 'user_id int' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' [ref: > ');
  await page.keyboard.press('Control+Space');
  await expect(page.locator('.suggest-widget')).toBeVisible();
  await expect(
    page.locator('.suggest-widget .monaco-list-row', { hasText: 'users' }).first(),
  ).toBeVisible();
  await page.keyboard.press('Escape');
});

// CRLF files: the language services must see the model's own text, or every offset from
// `model.getOffsetAt` is off by one per line above the cursor.
for (const eol of ['\n', '\r\n']) {
  const name = eol === '\n' ? 'LF' : 'CRLF';
  test(`completion and go to definition work in a ${name} file`, async ({ page }) => {
    const { installFsMock } = await import('./fsMock.js');
    await page.addInitScript(installFsMock, 'fsa');
    await openEditor(page);
    const text = SRC.split('\n').join(eol);
    await page.evaluate((t) => {
      window.__fsMock.put('in/eol.dbml', [...new TextEncoder().encode(t)]);
      window.__fsMock.nextOpen = ['in/eol.dbml'];
    }, text);
    await page.keyboard.press('ControlOrMeta+o');
    await expect(page.locator('.ed-filename__name')).toHaveText('eol.dbml');
    await diagramReady(page);

    const refLine = page.locator('.view-line', { hasText: 'Ref: posts.user_id > users.id' });
    await refLine.click();
    await page.keyboard.press('Home');
    for (let i = 0; i < 22; i++) await page.keyboard.press('ArrowRight'); // inside `users`
    await page.keyboard.press('F12');
    await expect(page.locator('.ed-status')).toContainText('Ln 2,');

    // Completion after `users.` lists its columns.
    await refLine.click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Ref: posts.id > users.');
    await page.keyboard.press('Control+Space');
    await expect(page.locator('.suggest-widget')).toBeVisible();
    await expect(
      page.locator('.suggest-widget .monaco-list-row', { hasText: 'email' }).first(),
    ).toBeVisible();
    await page.keyboard.press('Escape');
  });
}
