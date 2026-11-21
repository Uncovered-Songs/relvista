/**
 * Colours and inactive refs from the canvas (design phase3 §6.5): header / group / note / ref
 * colours through the Colour ▸ palette, Default removes the setting, Mark inactive / active.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { diagramReady, documentText, openEditor } from './helpers.js';
import { installFsMock } from './fsMock.js';

const DOC = [
  'Table users {',
  '  id int [pk]',
  '}',
  '',
  'Table posts {',
  '  id int [pk]',
  '  user_id int',
  '}',
  '',
  'Table tags {',
  '  id int [pk]',
  '  post_id int [ref: > posts.id]',
  '}',
  '',
  'Ref user_posts: posts.user_id > users.id',
  '',
  'TableGroup content {',
  '  posts',
  '  tags',
  '}',
  '',
].join('\n');

async function openDoc(page: Page, text: string): Promise<void> {
  await page.addInitScript(installFsMock, 'fsa');
  await openEditor(page);
  await page.evaluate((t) => {
    window.__fsMock.put('p/main.dbml', t);
    window.__fsMock.nextDirectory = 'p';
  }, text);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('menuitem', { name: /Open folder/ }).click();
  await expect(page.locator('.ed-filename__name')).toHaveText('main.dbml');
  await diagramReady(page);
}

const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);

/** Fill of a table's header band. */
const headerFill = (page: Page, id: string) =>
  node(page, id)
    .locator('.rv-table > path')
    .first()
    .evaluate((el) => getComputedStyle(el).fill);

/** Right-clicks a point on the middle of a ref's line. */
async function rightClickRef(page: Page, refId: string): Promise<void> {
  const edge = page.locator(
    `.react-flow__edge[data-id${refId.startsWith('ref:') ? '' : '*'}="${refId}"]`,
  );
  await expect(edge).toHaveCount(1);
  const p = await edge
    .locator('path')
    .first()
    .evaluate((el) => {
      const path = el as SVGPathElement;
      const pt = path.getPointAtLength(path.getTotalLength() / 2);
      const m = path.getScreenCTM()!;
      return { x: pt.x * m.a + pt.y * m.c + m.e, y: pt.x * m.b + pt.y * m.d + m.f };
    });
  await page.mouse.click(p.x, p.y, { button: 'right' });
}

async function axe(page: Page): Promise<void> {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('.monaco-editor')
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}

test('table header colour: swatch, custom, Default', async ({ page }) => {
  await openDoc(page, DOC);
  const before = await headerFill(page, 'public.users');
  await node(page, 'public.users').click({ button: 'right', position: { x: 30, y: 10 } });
  await page.getByRole('menuitem', { name: 'Header colour' }).click();
  const palette = page.getByRole('menu', { name: 'Header colour' });
  await expect(palette).toBeVisible();
  await axe(page); // palette open
  await palette.getByRole('menuitemradio', { name: 'Red #e74c3c' }).click();
  await expect(palette).toBeHidden();
  await expect.poll(() => headerFill(page, 'public.users')).not.toBe(before);
  expect(await headerFill(page, 'public.users')).toBe('rgb(231, 76, 60)');
  let dbml = await documentText(page);
  expect(dbml).toContain('Table users [headercolor: #e74c3c] {');
  expect(dbml.replace(' [headercolor: #e74c3c]', '')).toBe(DOC);

  // The palette shows the current colour; Custom… takes any colour.
  await node(page, 'public.users').click({ button: 'right', position: { x: 30, y: 10 } });
  await page.getByRole('menuitem', { name: 'Header colour' }).press('ArrowRight');
  await expect(palette.getByRole('menuitemradio', { name: 'Red #e74c3c' })).toBeFocused();
  await expect(palette.getByRole('menuitemradio', { name: 'Red #e74c3c' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await palette.locator('input[type=color]').fill('#123abc');
  await expect.poll(() => headerFill(page, 'public.users')).toBe('rgb(18, 58, 188)');
  expect(await documentText(page)).toContain('Table users [headercolor: #123abc] {');

  // Default removes the setting: the text is the original again.
  await node(page, 'public.users').click({ button: 'right', position: { x: 30, y: 10 } });
  await page.getByRole('menuitem', { name: 'Header colour' }).click();
  await palette.getByRole('menuitem', { name: 'Default' }).click();
  await expect.poll(() => headerFill(page, 'public.users')).toBe(before);
  dbml = await documentText(page);
  expect(dbml).toBe(DOC);
});

test('multi-select colours every selected table; group and note colours', async ({ page }) => {
  await openDoc(page, `${DOC}\nNote memo {\n  'hello'\n}\n`);
  await node(page, 'public.users').click({ position: { x: 30, y: 10 } });
  await node(page, 'public.posts').click({ position: { x: 30, y: 10 }, modifiers: ['Shift'] });
  await node(page, 'public.posts').click({ button: 'right', position: { x: 30, y: 10 } });
  await page.getByRole('menuitem', { name: 'Header colour' }).click();
  await page.getByRole('menuitemradio', { name: 'Green #2ecc71' }).click();
  await expect
    .poll(async () => (await documentText(page)).match(/headercolor: #2ecc71/g)?.length ?? 0)
    .toBe(2);

  // Group: right-click its header band.
  const group = node(page, 'group:content');
  await group.click({ button: 'right', position: { x: 40, y: 8 } });
  await page.getByRole('menuitem', { name: 'Colour', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Purple #8e44ad' }).click();
  await expect.poll(() => documentText(page)).toContain('TableGroup content [color: #8e44ad] {');

  // Note.
  await node(page, 'note:memo').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Colour', exact: true }).click();
  await page.getByRole('menuitemradio', { name: 'Yellow #f1c40f' }).click();
  await expect.poll(() => documentText(page)).toContain('Note memo [color: #f1c40f] {');
});

test('ref colour and inactive from the edge menu; inline refs are edited in code', async ({
  page,
}) => {
  await openDoc(page, DOC);
  const named = 'ref:public.posts(user_id)>public.users(id)';
  await rightClickRef(page, named);
  const colour = page.getByRole('menuitem', { name: 'Colour', exact: true });
  await expect(colour).toBeVisible();
  await colour.click();
  await page.getByRole('menuitemradio', { name: 'Blue #3498db' }).click();
  await expect
    .poll(() => documentText(page))
    .toContain('Ref user_posts: posts.user_id > users.id [color: #3498db]');

  await rightClickRef(page, named);
  await page.getByRole('menuitem', { name: 'Mark inactive' }).click();
  await expect
    .poll(() => documentText(page))
    .toMatch(/Ref user_posts: posts\.user_id > users\.id \[color: #3498db, inactive(: true)?\]/);
  await rightClickRef(page, named);
  await page.getByRole('menuitem', { name: 'Mark active' }).click();
  await expect.poll(() => documentText(page)).not.toContain('inactive');

  // The inline ref (tags.post_id) has no settings list of its own.
  await rightClickRef(page, 'public.tags(post_id)');
  const inactive = page.getByRole('menuitem', { name: 'Mark inactive' });
  await expect(inactive).toHaveAttribute('aria-disabled', 'true');
  await expect(inactive).toHaveAttribute('title', 'Edit this ref in code');
  await expect(page.getByRole('menuitem', { name: 'Colour', exact: true })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.keyboard.press('Escape');

  // Keyboard path (ref lines take no focus): node menu ▸ Refs ▸ a ref → its edge menu.
  await node(page, 'public.posts').click({ position: { x: 30, y: 10 } });
  await page.keyboard.press('Shift+F10');
  await page.getByRole('menuitem', { name: 'Refs' }).press('ArrowRight');
  const refs = page.getByRole('menu', { name: 'Refs' });
  await expect(refs.getByRole('menuitem').first()).toBeFocused();
  await expect(refs.getByRole('menuitem')).toHaveCount(2); // the named ref and tags.post_id
  await refs.getByRole('menuitem', { name: 'user_id → users.id' }).press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Reveal in code' })).toBeFocused();
  await expect(page.getByRole('menuitem', { name: 'Mark inactive' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(node(page, 'public.posts')).toBeFocused();
});
