// Per-diagram anchors and deep links on the built docs site (docs/design/phase3-v1.md §5.2): a
// link to `#<anchor>&<target keys>` scrolls to the diagram and opens it there, the toolbar's link
// button copies a link that reproduces the state, heading anchors keep working, and "Open in
// editor" never carries the build-time positions.
import { expect, test, type Locator, type Page } from '@playwright/test';

async function settled(diagram: Locator): Promise<Locator> {
  const viewer = diagram.locator('.rv-viewer');
  await expect(viewer).toBeVisible();
  await expect(viewer).toHaveAttribute('data-rv-layout', 'done');
  return viewer;
}

function tableNode(viewer: Locator, id: string): Locator {
  return viewer.locator(`.react-flow__node[data-id="${id}"]`);
}

/** Whether the element's box is inside the browser window. */
async function inWindow(page: Page, el: Locator): Promise<boolean> {
  const box = await el.boundingBox();
  const vp = page.viewportSize()!;
  return !!box && box.y >= 0 && box.y < vp.height && box.y + Math.min(box.height, 200) <= vp.height;
}

/** Distance of a node's centre from the canvas centre, in px. */
async function offCentre(viewer: Locator, node: Locator): Promise<number> {
  const canvas = (await viewer.locator('.rv-canvas').boundingBox())!;
  const box = (await node.boundingBox())!;
  return Math.hypot(
    box.x + box.width / 2 - (canvas.x + canvas.width / 2),
    box.y + box.height / 2 - (canvas.y + canvas.height / 2),
  );
}

test('#shop&view=sales&table=orders scrolls to the diagram, opens the view, centres and lights orders', async ({
  page,
}) => {
  await page.goto('docs/exploring#shop&view=sales&table=orders');
  const diagram = page.locator('#shop');
  await expect(diagram).toHaveAttribute('data-rv-anchor', 'shop');
  const viewer = await settled(diagram);
  await expect.poll(() => inWindow(page, diagram)).toBe(true);
  await expect(viewer.getByRole('combobox', { name: 'Diagram view' })).toHaveValue('sales');
  // A table outside the view is gone.
  await expect(tableNode(viewer, 'public.invoices')).toHaveCount(0);
  const orders = tableNode(viewer, 'public.orders');
  await expect(orders.locator('.rv-node')).toHaveClass(/rv-highlighted/);
  await expect.poll(() => offCentre(viewer, orders), { timeout: 5000 }).toBeLessThan(40);
});

test('a target with hops opens focus mode; other diagrams on the page are untouched', async ({
  page,
}) => {
  await page.goto('docs/views#shop-all&table=orders&hops=1');
  const viewer = await settled(page.locator('#shop-all'));
  await expect(viewer.getByText(/Related to orders/)).toBeVisible();
  const other = await settled(page.locator('#shop-billing'));
  await expect(other.getByText(/Related to/)).toHaveCount(0);
});

test('the link button copies a link that reproduces the state', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('docs/exploring#shop&view=sales&table=payments');
  const viewer = await settled(page.locator('#shop'));
  await expect(tableNode(viewer, 'public.payments').locator('.rv-node')).toHaveClass(
    /rv-highlighted/,
  );
  const entries = await page.evaluate(() => history.length);
  await viewer.getByRole('button', { name: 'Copy link to this diagram' }).click();
  await expect(viewer.getByText('Link copied')).toBeVisible();
  const href = await page.evaluate(() => navigator.clipboard.readText());
  expect(href).toMatch(/\/docs\/exploring#shop&/);
  expect(href).toContain('view=sales');
  expect(href).toContain('table=payments');
  // The address bar names the same state, without a new history entry.
  expect(await page.evaluate(() => location.href)).toBe(href);
  expect(await page.evaluate(() => history.length)).toBe(entries);

  const again = await context.newPage();
  await again.goto(href);
  const copy = await settled(again.locator('#shop'));
  await expect(copy.getByRole('combobox', { name: 'Diagram view' })).toHaveValue('sales');
  await expect(tableNode(copy, 'public.payments').locator('.rv-node')).toHaveClass(
    /rv-highlighted/,
  );
});

test('the address follows the named diagram as you work', async ({ page }) => {
  await page.goto('docs/exploring#shop');
  const viewer = await settled(page.locator('#shop'));
  // The viewer does not report its own first moves (600 ms after the layout is done).
  await page.waitForTimeout(1000);
  await viewer.getByRole('combobox', { name: 'Diagram view' }).selectOption('sales');
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#shop&view=sales/);
});

test('a search link opens the search panel with the query', async ({ page }) => {
  await page.goto('docs/exploring#shop&q=price');
  const viewer = await settled(page.locator('#shop'));
  await expect(viewer.getByRole('combobox', { name: 'Search' })).toHaveValue('price');
  // Page loads never steal focus.
  await expect(viewer.getByRole('combobox', { name: 'Search' })).not.toBeFocused();
});

test('in-page example links apply their target', async ({ page }) => {
  await page.goto('docs/exploring');
  const viewer = await settled(page.locator('#shop'));
  await page.locator('a[href="#shop&path=users~products"]').click();
  await expect(viewer.locator('.rv-nav-status')).toHaveText(/^users → .+ → products, \d+ refs?$/);
  await expect(viewer.locator('.rv-table[data-rv-tone="path"]').first()).toBeVisible();
  await expect.poll(() => inWindow(page, page.locator('#shop'))).toBe(true);
});

test('heading anchors still scroll, and diagrams leave their hash alone', async ({ page }) => {
  await page.goto('docs/exploring#choosing-the-anchor');
  const heading = page.locator('h3#choosing-the-anchor');
  await expect.poll(() => inWindow(page, heading)).toBe(true);
  const viewer = await settled(page.locator('#shop'));
  await tableNode(viewer, 'public.users').click();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => location.hash)).toBe('#choosing-the-anchor');
});

test('a diagram the URL does not name never changes the address', async ({ page }) => {
  await page.goto('docs/views');
  const viewer = await settled(page.locator('#shop-all'));
  await tableNode(viewer, 'public.orders').click();
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => location.hash)).toBe('');
});

test('"Open in editor" carries no build-time layout for a diagram without a layout file', async ({
  page,
}) => {
  await page.goto('docs/gallery/02-ecommerce');
  const viewer = await settled(page.locator('.relvista-diagram').first());
  const link = viewer.getByRole('link', { name: 'Open in editor' });
  await expect(link).toHaveAttribute('href', /#dbml=/);
  const href = (await link.getAttribute('href'))!;
  expect(href).not.toMatch(/[#&]layout=/);
});

test('"Open in editor" keeps a real layout file', async ({ page }) => {
  await page.goto('docs/usage');
  const diagram = page.locator('#diagram-saved-layout-posts-left-users-right');
  const viewer = await settled(diagram);
  await expect(viewer.getByRole('link', { name: 'Open in editor' })).toHaveAttribute(
    'href',
    /[#&]layout=/,
  );
});
