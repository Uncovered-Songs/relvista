/**
 * Phase-2 gate (decision 0001 / 0004): every example, in every line-ending / BOM variant, opens and
 * saves byte-identical with no sidecar written — through File System Access and the download
 * fallback (a real `<input type=file>` and downloads).
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { VARIANTS, folderExample, singleExamples } from './fixtures.js';
import { installFsMock } from './fsMock.js';
import { diagramReady, focusEditor, openEditor } from './helpers.js';

test.describe.configure({ mode: 'parallel' });

async function seed(page: Page, path: string, bytes: Uint8Array): Promise<void> {
  await page.evaluate(([p, b]) => window.__fsMock.put(p as string, b as number[]), [
    path,
    [...bytes],
  ] as const);
}

async function read(page: Page, path: string): Promise<Uint8Array | null> {
  const b = await page.evaluate((p) => window.__fsMock.get(p), path);
  return b ? new Uint8Array(b) : null;
}

async function writes(page: Page): Promise<string[]> {
  return page.evaluate(() => [...window.__fsMock.writes]);
}

async function openViaPicker(page: Page, path: string, name: string): Promise<void> {
  await page.evaluate((p) => (window.__fsMock.nextOpen = [p]), path);
  await page.keyboard.press('ControlOrMeta+o');
  await expect(page.locator('.ed-filename__name')).toHaveText(name);
  await diagramReady(page);
}

async function saveAs(page: Page, path: string): Promise<void> {
  const before = (await writes(page)).length;
  await page.evaluate((p) => window.__fsMock.nextSave.push(p), path);
  await page.keyboard.press('ControlOrMeta+Shift+s');
  await expect.poll(async () => (await writes(page)).length).toBeGreaterThan(before);
}

for (const ex of singleExamples()) {
  for (const [variant, make] of Object.entries(VARIANTS)) {
    test(`FSA ${ex.name} × ${variant}`, async ({ page }) => {
      await page.addInitScript(installFsMock, 'fsa');
      await openEditor(page);
      const bytes = make(ex.text);
      await seed(page, `in/${ex.name}`, bytes);
      await openViaPicker(page, `in/${ex.name}`, ex.name);

      // Save of an unedited file: nothing to write, bytes untouched.
      await page.keyboard.press('ControlOrMeta+s');
      await page.waitForTimeout(100);
      expect(await writes(page)).toEqual([]);

      // Type a character, undo it, Save as: exactly the original bytes, no sidecar.
      await focusEditor(page);
      await page.keyboard.type('x');
      await page.keyboard.press('ControlOrMeta+z');
      await saveAs(page, `out/${ex.name}`);
      expect(await read(page, `out/${ex.name}`)).toEqual(bytes);
      expect((await writes(page)).filter((w) => w.endsWith('.layout.json'))).toEqual([]);
    });
  }
}

test('FSA: editing one line of a mixed file changes only that line', async ({ page }) => {
  await page.addInitScript(installFsMock, 'fsa');
  await openEditor(page);
  const ex = singleExamples().find((e) => e.name.startsWith('02'))!;
  const bytes = VARIANTS.mixed!(ex.text);
  await seed(page, 'in/02.dbml', bytes);
  await openViaPicker(page, 'in/02.dbml', '02.dbml');
  await focusEditor(page);
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('End');
  await page.keyboard.type(' // edited');
  await expect(page.locator('.ed-filename__dot')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+s');
  await expect.poll(() => writes(page)).toEqual(['in/02.dbml']);
  const out = new TextDecoder().decode((await read(page, 'in/02.dbml'))!);
  const orig = new TextDecoder().decode(bytes);
  const split = (t: string) => t.split(/(?<=\r\n|\r(?!\n)|\n)/);
  const a = split(orig);
  const b = split(out);
  expect(b.length).toBe(a.length);
  const differing = a.map((l, i) => (l === b[i] ? -1 : i)).filter((i) => i >= 0);
  expect(differing).toEqual([0]);
  // The changed line gets the file's dominant terminator (design §4.4); its text is the edit.
  expect(b[0]!.replace(/(\r\n|\r|\n)$/, '')).toBe(a[0]!.replace(/(\r\n|\r|\n)$/, ' // edited'));
  await expect(page.locator('.ed-filename__dot')).toBeHidden();
});

test('FSA: the 12-modules folder opens and saves unchanged', async ({ page }) => {
  await page.addInitScript(installFsMock, 'fsa');
  await openEditor(page);
  const files = folderExample('12-modules');
  for (const [p, b] of Object.entries(files)) await seed(page, `proj/${p}`, b);
  await page.evaluate(() => (window.__fsMock.nextDirectory = 'proj'));
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('menuitem', { name: /Open folder/ }).click();
  await expect(page.locator('.ed-filename__name')).toHaveText('main.dbml');
  await diagramReady(page);
  await expect(page.getByRole('tab', { name: /users\.dbml/ })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+s');
  await page.waitForTimeout(200);
  expect(await writes(page)).toEqual([]);
  for (const [p, b] of Object.entries(files)) expect(await read(page, `proj/${p}`)).toEqual(b);
});

for (const ex of singleExamples()) {
  for (const variant of ['as is', 'CRLF', 'BOM', 'BOM+CRLF', 'no final newline'] as const) {
    test(`fallback ${ex.name} × ${variant}`, async ({ page }) => {
      await page.addInitScript(installFsMock, 'fallback');
      await openEditor(page);
      const bytes = VARIANTS[variant]!(ex.text);
      const chooser = page.waitForEvent('filechooser');
      await page.keyboard.press('ControlOrMeta+o');
      await (
        await chooser
      ).setFiles({ name: ex.name, mimeType: 'text/plain', buffer: Buffer.from(bytes) });
      await expect(page.locator('.ed-filename__name')).toHaveText(ex.name);
      await diagramReady(page);
      const download = page.waitForEvent('download');
      await page.keyboard.press('ControlOrMeta+s');
      const d = await download;
      expect(d.suggestedFilename()).toBe(ex.name);
      expect(new Uint8Array(readFileSync((await d.path())!))).toEqual(bytes);
      await expect(page.locator('.ed-status__save')).toHaveText('Downloaded');
      // An unedited file never needs a layout sidecar.
      expect(d.suggestedFilename().endsWith('.layout.json')).toBe(false);
    });
  }
}
