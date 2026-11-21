/**
 * Review round 3 regressions: first view (small diagrams whole, the minimap never over a table),
 * one "current table", renames and the layout file, files changed on disk, Save as of a folder.
 */
import { expect, test, type Page } from '@playwright/test';
import { folderExample } from './fixtures.js';
import { installFsMock } from './fsMock.js';
import { diagramReady, focusEditor, openEditor, openExampleFromPicker } from './helpers.js';

test.describe.configure({ mode: 'parallel' });

const writes = (page: Page) => page.evaluate(() => [...window.__fsMock.writes]);
const readText = async (page: Page, path: string) => {
  const b = await page.evaluate((p) => window.__fsMock.get(p), path);
  return b ? Buffer.from(b).toString('utf8') : null;
};
const put = (page: Page, path: string, text: string) =>
  page.evaluate(([p, t]) => window.__fsMock.put(p!, t!), [path, text]);

async function openPaths(page: Page, paths: string[], name: string): Promise<void> {
  await page.evaluate((p) => (window.__fsMock.nextOpen = p), paths);
  await page.keyboard.press('ControlOrMeta+o');
  await expect(page.locator('.ed-filename__name')).toHaveText(name);
  await diagramReady(page);
}

/** Puts the cursor at the end of the first line holding `text`. */
async function cursorAfter(page: Page, text: string): Promise<void> {
  await page.locator('.monaco-editor .view-line', { hasText: text }).first().click();
  await page.keyboard.press('End');
}

/** Screen boxes of the tables and of the minimap (null when it is not shown). */
function boxes(page: Page) {
  return page.evaluate(() => {
    const r = (el: Element) => {
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, width: b.width, height: b.height };
    };
    const mm = document.querySelector('.rv-canvas .rv-minimap');
    return {
      canvas: r(document.querySelector('.rv-canvas')!),
      minimap: mm ? r(mm) : null,
      tables: [...document.querySelectorAll('.rv-canvas .react-flow__node-rvTable')].map(r),
    };
  });
}

type B = { x: number; y: number; width: number; height: number };
const overlap = (a: B, b: B) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const inside = (a: B, b: B) =>
  a.x >= b.x - 1 &&
  a.y >= b.y - 1 &&
  a.x + a.width <= b.x + b.width + 1 &&
  a.y + a.height <= b.y + b.height + 1;

test('a small diagram opens whole; a large one keeps its tables clear of the minimap', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openEditor(page);
  await openExampleFromPicker(page, 'Table groups');
  await diagramReady(page);
  let b = await boxes(page);
  expect(b.tables).toHaveLength(7);
  for (const t of b.tables) expect(inside(t, b.canvas)).toBe(true);

  for (const title of ['E-commerce', 'Large SaaS schema']) {
    await openExampleFromPicker(page, title);
    await diagramReady(page);
    b = await boxes(page);
    if (b.minimap) for (const t of b.tables) expect(overlap(t, b.minimap), title).toBe(false);
  }
  // The large diagram's minimap waits for the first zoom (a table sits where it goes).
  expect(b.minimap).toBeNull();
  await page.getByRole('button', { name: 'Zoom out' }).click();
  await expect(page.locator('.rv-canvas .rv-minimap')).toBeVisible();
  const opacity = await page
    .locator('.rv-canvas .rv-minimap')
    .evaluate((el) => getComputedStyle(el).opacity);
  expect(opacity).toBe('1');
});

test('moving the cursor to another table clears the clicked selection', async ({ page }) => {
  await openEditor(page);
  await openExampleFromPicker(page, 'E-commerce');
  await diagramReady(page);
  await page.locator('.react-flow__node[data-id="public.merchants"]').click();
  await expect(
    page.locator('.react-flow__node[data-id="public.merchants"] .rv-selected'),
  ).toHaveCount(1);
  await cursorAfter(page, 'Table users');
  await expect(
    page.locator('.react-flow__node[data-id="public.users"] .rv-highlighted'),
  ).toHaveCount(1);
  await expect(page.locator('.rv-canvas .rv-selected')).toHaveCount(0);
});

test('a renamed table keeps its position through Save and reopen', async ({ page }) => {
  await page.addInitScript(installFsMock, 'fsa');
  await openEditor(page);
  await put(
    page,
    'in/s.dbml',
    'Table a {\n  id int\n}\n\nTable b {\n  a_id int [ref: > a.id]\n}\n',
  );
  const layout = (id: string) =>
    JSON.stringify({ version: 1, views: { '*': { nodes: { [id]: { x: 500, y: 300 } } } } });
  await put(page, 'in/s.dbml.layout.json', layout('public.a'));
  await openPaths(page, ['in/s.dbml', 'in/s.dbml.layout.json'], 's.dbml');
  const a = (id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
  await expect(a('public.a')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 500, 300)');

  await cursorAfter(page, 'Table a {');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('2');
  await cursorAfter(page, 'a_id int');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.type('2');
  await expect(a('public.a2')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 500, 300)');

  await page.keyboard.press('ControlOrMeta+s');
  await expect.poll(() => writes(page)).toEqual(['in/s.dbml', 'in/s.dbml.layout.json']);
  const saved = JSON.parse((await readText(page, 'in/s.dbml.layout.json'))!);
  expect(saved.views['*'].nodes['public.a2']).toMatchObject({ x: 500, y: 300 });
  expect(saved.views['*'].nodes['public.a']).toBeUndefined();

  await openPaths(page, ['in/s.dbml', 'in/s.dbml.layout.json'], 's.dbml');
  await expect(a('public.a2')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 500, 300)');
});

test('Save asks before replacing a file changed on disk since it was opened', async ({ page }) => {
  await page.addInitScript(installFsMock, 'fsa');
  await openEditor(page);
  await put(page, 'in/x.dbml', 'Table x {\n  id int\n}\n');
  await openPaths(page, ['in/x.dbml'], 'x.dbml');
  // An IDE (or git pull) changes the file; then the user edits and saves here.
  await put(page, 'in/x.dbml', 'Table x {\n  id int\n  from_ide int\n}\n');
  await cursorAfter(page, 'id int');
  await page.keyboard.type(' // here');
  await page.keyboard.press('ControlOrMeta+s');
  const dialog = page.getByRole('dialog', { name: /x\.dbml changed on disk/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(150);
  expect(await writes(page)).toEqual([]);
  expect(await readText(page, 'in/x.dbml')).toContain('from_ide');

  await page.keyboard.press('ControlOrMeta+s');
  await dialog.getByRole('button', { name: 'Replace' }).click();
  await expect.poll(() => writes(page)).toEqual(['in/x.dbml']);
  expect(await readText(page, 'in/x.dbml')).toContain('// here');
  // Saved: the next save compares with what was written, and asks nothing.
  await cursorAfter(page, '// here');
  await page.keyboard.type('!');
  await page.keyboard.press('ControlOrMeta+s');
  await expect.poll(() => writes(page)).toEqual(['in/x.dbml', 'in/x.dbml']);
  await expect(dialog).toHaveCount(0);
});

test('Save as of a folder workspace moves every file to the new folder', async ({ page }) => {
  await page.addInitScript(installFsMock, 'fsa');
  await openEditor(page);
  const files = folderExample('12-modules');
  for (const [p, b] of Object.entries(files))
    await page.evaluate(([path, bytes]) => window.__fsMock.put(path as string, bytes as number[]), [
      `proj/${p}`,
      [...b],
    ] as const);
  await page.evaluate(() => (window.__fsMock.nextDirectory = 'proj'));
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('menuitem', { name: /Open folder/ }).click();
  await expect(page.locator('.ed-filename__name')).toHaveText('main.dbml');
  await diagramReady(page);

  // A folder's Save as is named for what it does.
  await expect(page.getByRole('button', { name: 'Save folder as…', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save as', exact: true })).toHaveCount(0);
  await page.evaluate(() => (window.__fsMock.nextDirectory = 'elsewhere'));
  await page.keyboard.press('ControlOrMeta+Shift+s');
  const dbml = Object.keys(files).filter((p) => p.endsWith('.dbml'));
  await expect
    .poll(async () => (await writes(page)).filter((w) => w.endsWith('.dbml')).sort())
    .toEqual(dbml.map((p) => `elsewhere/${p}`).sort());

  // From now on Save writes there, never back into proj/.
  const before = (await writes(page)).length;
  await page.getByRole('tab', { name: /billing\.dbml/ }).click();
  await focusEditor(page);
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ControlOrMeta+ArrowDown');
  await page.keyboard.type('\n// edited');
  await page.keyboard.press('ControlOrMeta+s');
  await expect
    .poll(async () => (await writes(page)).slice(before))
    .toEqual(['elsewhere/billing.dbml']);
  expect((await writes(page)).some((w) => w.startsWith('proj/'))).toBe(false);
});
