import { expect, test } from '@playwright/test';
import { installFsMock } from './fsMock.js';
import { diagramReady, exportItem, openEditor, openExampleFromPicker } from './helpers.js';

test('drag a table → Save writes integer x/y; Mod+Z on the canvas restores', async ({ page }) => {
  await page.addInitScript(installFsMock, 'fsa');
  await openEditor(page);
  await page.evaluate(() => {
    window.__fsMock.put(
      'p/main.dbml',
      'Table a {\n  id int\n}\n\nTable b {\n  id int [ref: > a.id]\n}\n',
    );
    window.__fsMock.nextDirectory = 'p';
  });
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('menuitem', { name: /Open folder/ }).click();
  await diagramReady(page);
  await expect(page.locator('.ed-filename__dot')).toHaveCount(0); // auto-placement is not an edit

  const node = page.locator('.react-flow__node[data-id="public.a"]');
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + 92, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.ed-filename__dot')).toBeVisible();

  await page.keyboard.press('ControlOrMeta+s');
  await expect
    .poll(() => page.evaluate(() => window.__fsMock.get('p/main.dbml.layout.json')))
    .not.toBeNull();
  const json = JSON.parse(
    new TextDecoder().decode(
      new Uint8Array((await page.evaluate(() => window.__fsMock.get('p/main.dbml.layout.json')))!),
    ),
  );
  const a = json.views['*'].nodes['public.a'];
  expect(Number.isInteger(a.x) && Number.isInteger(a.y)).toBe(true);
  expect(await page.evaluate(() => window.__fsMock.writes)).toEqual(['p/main.dbml.layout.json']);
  await expect(page.locator('.ed-filename__dot')).toHaveCount(0);

  await page.locator('.ed-diagram').click({ position: { x: 5, y: 300 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.ed-filename__dot')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.locator('.ed-filename__dot')).toHaveCount(0);
});

test('drag a table → the exported layout JSON has its new position', async ({ page }) => {
  await openEditor(page);
  await openExampleFromPicker(page, 'Minimal');
  await diagramReady(page);
  const layoutOf = async () => JSON.parse((await exportItem(page, /Layout JSON/)).toString());
  const before = await layoutOf();
  const id = 'public.users';
  const start = before.views['*'].nodes[id];
  expect(Number.isInteger(start.x) && Number.isInteger(start.y)).toBe(true);

  const node = page.locator(`.react-flow__node[data-id="${id}"]`);
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + 30, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + 72, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.ed-filename__dot')).toBeVisible();

  const after = await layoutOf();
  const moved = after.views['*'].nodes[id];
  expect(Number.isInteger(moved.x) && Number.isInteger(moved.y)).toBe(true);
  const zoom = await page
    .locator('.react-flow__viewport')
    .evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).a);
  // The pointer moved 80 × 60 screen px; React Flow starts the drag after the first step.
  expect(moved.x - start.x).toBeGreaterThan(50 / zoom);
  expect(moved.x - start.x).toBeLessThanOrEqual(Math.ceil(80 / zoom) + 1);
  expect(moved.y - start.y).toBeGreaterThan(35 / zoom);
  expect(moved.y - start.y).toBeLessThanOrEqual(Math.ceil(60 / zoom) + 1);
  // Other nodes keep their place.
  for (const [other, pos] of Object.entries(before.views['*'].nodes)) {
    if (other !== id) expect(after.views['*'].nodes[other]).toEqual(pos);
  }
});
