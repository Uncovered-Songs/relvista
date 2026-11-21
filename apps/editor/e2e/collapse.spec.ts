/**
 * Collapsing TableGroups (design phase3 §6.6): node menu, double-click on the header, Auto-layout
 * ▸ Collapse all groups / Expand all; saved as `collapsed: true` with the box position.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { EXAMPLES_DIR } from './fixtures.js';
import { installFsMock } from './fsMock.js';
import { diagramReady, openEditor } from './helpers.js';

const TEXT = readFileSync(join(EXAMPLES_DIR, '05-table-groups.dbml'), 'utf8');

interface SavedLayout {
  views: Record<string, { nodes: Record<string, { x?: number; y?: number; collapsed?: boolean }> }>;
}

async function openDoc(page: Page): Promise<void> {
  await page.addInitScript(installFsMock, 'fsa');
  await openEditor(page);
  await page.evaluate((t) => {
    window.__fsMock.put('p/main.dbml', t);
    window.__fsMock.nextDirectory = 'p';
  }, TEXT);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('menuitem', { name: /Open folder/ }).click();
  await expect(page.locator('.ed-filename__name')).toHaveText('main.dbml');
  await diagramReady(page);
}

async function saved(page: Page): Promise<SavedLayout> {
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.ed-filename__dot')).toHaveCount(0);
  const bytes = await page.evaluate(() => window.__fsMock.get('p/main.dbml.layout.json'));
  expect(bytes).not.toBeNull();
  return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes!))) as SavedLayout;
}

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);
/** Node positions in diagram coordinates (independent of the viewport). */
const transformOf = (page: Page, id: string) =>
  node(page, id).evaluate((el) => (el as HTMLElement).style.transform);

test('collapse a group from the node menu: one card, refs attach to it, saved; expand restores', async ({
  page,
}) => {
  await openDoc(page);
  const members = ['public.products', 'public.orders'];
  const before = await Promise.all(members.map((id) => transformOf(page, id)));
  const group = node(page, 'group:catalog');
  await group.click({ button: 'right', position: { x: 40, y: 8 } });
  await page.getByRole('menuitem', { name: 'Collapse group' }).click();

  const card = page.locator('.react-flow__node[data-id="group:catalog"][data-rv-collapsed="true"]');
  await expect(card).toHaveCount(1);
  for (const id of members) await expect(node(page, id)).toHaveCount(0);
  await expect(page.locator('[data-rv-collapsed="true"].react-flow__node')).toHaveCount(1);

  // The ref products → merchants now starts or ends on the card.
  const box = (await card.boundingBox())!;
  const ends = await page
    .locator('.react-flow__edge[data-id*="public.products(merchant_id)"] path')
    .first()
    .evaluate((el) => {
      const p = el as SVGPathElement;
      const m = p.getScreenCTM()!;
      const at = (l: number) => {
        const q = p.getPointAtLength(l);
        return { x: q.x * m.a + q.y * m.c + m.e, y: q.x * m.b + q.y * m.d + m.f };
      };
      return [at(0), at(p.getTotalLength())];
    });
  const near = (q: { x: number; y: number }) =>
    q.x >= box.x - 16 &&
    q.x <= box.x + box.width + 16 &&
    q.y >= box.y - 16 &&
    q.y <= box.y + box.height + 16;
  expect(ends.some(near)).toBe(true);

  const layout = await saved(page);
  const entry = layout.views['*']!.nodes['group:catalog']!;
  expect(entry.collapsed).toBe(true);
  expect(Number.isInteger(entry.x) && Number.isInteger(entry.y)).toBe(true);

  await card.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: /Pin position/ })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Expand group' }).click();
  await expect(card).toHaveCount(0);
  expect(await Promise.all(members.map((id) => transformOf(page, id)))).toEqual(before);
  const after = await saved(page);
  expect(after.views['*']!.nodes['group:catalog']?.collapsed).toBeUndefined();

  // Mod+Z on the canvas collapses it again (one layout step), Mod+Shift+Z expands.
  await page.locator('.rv-canvas .react-flow__pane').click({ position: { x: 8, y: 300 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(card).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(card).toHaveCount(0);
});

test('double-click a group header toggles; Collapse all groups / Expand all', async ({ page }) => {
  await openDoc(page);
  await node(page, 'group:people').dblclick({ position: { x: 30, y: 8 } });
  await expect(
    page.locator('.react-flow__node[data-id="group:people"][data-rv-collapsed="true"]'),
  ).toHaveCount(1);
  await page.locator('.react-flow__node[data-id="group:people"]').dblclick();
  await expect(page.locator('[data-rv-collapsed="true"].react-flow__node')).toHaveCount(0);

  await page.getByRole('button', { name: 'Auto-layout' }).click();
  await page.getByRole('menuitem', { name: 'Collapse all groups' }).click();
  await expect(page.locator('[data-rv-collapsed="true"].react-flow__node')).toHaveCount(4);
  await expect(
    page.locator('.react-flow__node[data-id^="public."], .react-flow__node[data-id^="billing."]'),
  ).toHaveCount(0);
  const layout = await saved(page);
  for (const g of ['e_commerce', 'catalog', 'billing_group', 'people'])
    expect(layout.views['*']!.nodes[`group:${g}`]?.collapsed).toBe(true);

  await page.getByRole('button', { name: 'Auto-layout' }).click();
  await expect(page.getByRole('menuitem', { name: 'Collapse all groups' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.getByRole('menuitem', { name: /Expand all/ }).click();
  await expect(page.locator('[data-rv-collapsed="true"].react-flow__node')).toHaveCount(0);
  await expect(node(page, 'public.products')).toBeVisible();
  // One step each: one undo collapses all four again.
  await page.locator('.rv-canvas .react-flow__pane').click({ position: { x: 8, y: 300 } });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('[data-rv-collapsed="true"].react-flow__node')).toHaveCount(4);
});
