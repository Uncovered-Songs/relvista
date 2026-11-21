import { expect, test, type Page } from '@playwright/test';
import { diagramReady, openEditor } from './helpers.js';

const pos = (page: Page, id: string) =>
  page
    .locator(`.react-flow__node[data-id="${id}"]`)
    .evaluate((el) => (el as HTMLElement).style.transform);

test('pinned tables keep their place when auto-layout runs', async ({ page }) => {
  await openEditor(page);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'From example' }).click();
  await page.getByRole('menuitem', { name: /E-commerce/ }).click();
  await diagramReady(page);

  // Move two tables so auto-layout has something to change, pin one of them.
  for (const id of ['public.users', 'public.orders']) {
    const node = page.locator(`.react-flow__node[data-id="${id}"]`);
    // Wait until the initial fit has settled: a drag that starts mid-animation is lost under load.
    let last = '';
    await expect
      .poll(async () => {
        const b = await node.boundingBox();
        const now = b ? `${Math.round(b.x)},${Math.round(b.y)}` : '';
        const stable = now !== '' && now === last;
        last = now;
        return stable;
      })
      .toBe(true);
    const before = await pos(page, id);
    const box = (await node.boundingBox())!;
    // Drag towards the middle of the window: a pointer released off-screen never ends the drag.
    const vp = page.viewportSize()!;
    const dx = box.x + 30 < vp.width / 2 ? 60 : -60;
    const dy = box.y + 10 < vp.height / 2 ? 60 : -60;
    await page.mouse.move(box.x + 30, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 30 + dx, box.y + 10 + dy, { steps: 6 });
    await page.mouse.up();
    await expect.poll(() => pos(page, id)).not.toBe(before);
  }
  const ub = (await page.locator('.react-flow__node[data-id="public.users"]').boundingBox())!;
  await page.mouse.click(ub.x + 30, ub.y + 10, { button: 'right' });
  await expect(page.locator('.ed-nodemenu')).toBeVisible();
  await page
    .locator('.ed-nodemenu')
    .getByRole('menuitem', { name: /Pin position/ })
    .click();
  const pinned = await pos(page, 'public.users');
  const other = await pos(page, 'public.orders');

  await page.getByRole('button', { name: 'Auto-layout' }).click();
  await page.getByRole('menuitem', { name: /Arrange/ }).click();
  // ELK runs in a worker; slow under a loaded parallel run.
  await expect.poll(() => pos(page, 'public.orders'), { timeout: 45_000 }).not.toBe(other);
  expect(await pos(page, 'public.users')).toBe(pinned);
});
