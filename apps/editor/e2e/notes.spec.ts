/**
 * Sticky notes on the canvas (design phase3 §6.4): create (toolbar button, N, pane menu), edit the
 * text in place, resize with the handles, delete; the DBML and the layout file follow.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { installFsMock } from './fsMock.js';
import { diagramReady, documentText, focusEditor, openEditor } from './helpers.js';

const DOC = 'Table a {\n  id int [pk]\n}\n\nTable b {\n  id int\n  a_id int [ref: > a.id]\n}\n';

/** Opens `text` as p/main.dbml through Open folder (Save then writes p/main.dbml.layout.json). */
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

interface SavedLayout {
  views: Record<
    string,
    { nodes: Record<string, { x?: number; y?: number; w?: number; h?: number } | undefined> }
  >;
}

async function sidecar(page: Page): Promise<SavedLayout> {
  await expect
    .poll(() => page.evaluate(() => window.__fsMock.get('p/main.dbml.layout.json')))
    .not.toBeNull();
  const bytes = await page.evaluate(() => window.__fsMock.get('p/main.dbml.layout.json'));
  return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes!))) as SavedLayout;
}

const noteNode = (page: Page, name: string) =>
  page.locator(`.react-flow__node[data-id="note:${name}"]`);

async function axe(page: Page): Promise<void> {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .exclude('.monaco-editor')
    .analyze();
  expect(
    r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`),
  ).toEqual([]);
}

test('Note button: type, commit → the DBML has the Note block; resize → Save → integer w/h; delete', async ({
  page,
}) => {
  await openDoc(page, DOC);
  await page.getByRole('button', { name: 'Note', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Text of the note note_1' });
  await expect(editor).toBeFocused();
  await expect(editor).toHaveValue('New note');
  await expect(noteNode(page, 'note_1')).toBeVisible();

  // The editor sits exactly over the note.
  const nb = (await noteNode(page, 'note_1').boundingBox())!;
  const eb = (await editor.boundingBox())!;
  expect(Math.abs(nb.x - eb.x)).toBeLessThan(2);
  expect(Math.abs(nb.y - eb.y)).toBeLessThan(2);
  expect(Math.abs(nb.width - eb.width)).toBeLessThan(2);

  await axe(page); // the note editor open

  await page.keyboard.type('Ship the "billing" schema\nby Friday');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(editor).toBeHidden();
  await expect(noteNode(page, 'note_1')).toBeFocused();
  await expect(noteNode(page, 'note_1')).toContainText('Ship the');
  let dbml = await documentText(page);
  expect(dbml.startsWith(DOC)).toBe(true);
  expect(dbml).toMatch(/Note note_1 \{/);
  expect(dbml).toContain('Ship the "billing" schema');
  expect(dbml).toContain('by Friday');

  // Move it below the tables (a new note sits at the centre), then resize it with the
  // bottom-right handle: a layout change (dirty), saved as integers.
  const note = noteNode(page, 'note_1');
  const start = (await note.boundingBox())!;
  const pane = (await page.locator('.rv-canvas .react-flow__pane').boundingBox())!;
  await page.mouse.move(start.x + 20, start.y + 10);
  await page.mouse.down();
  await page.mouse.move(pane.x + 80, pane.y + pane.height - 260, { steps: 8 });
  await page.mouse.up();
  await note.hover();
  const handle = note.locator('.react-flow__resize-control.handle.bottom.right');
  await expect(handle).toBeVisible();
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + 90, hb.y + 60, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.ed-filename__dot')).toHaveCount(0);
  const saved = await sidecar(page);
  const entry = saved.views['*']!.nodes['note:note_1']!;
  expect(Number.isInteger(entry.w) && Number.isInteger(entry.h)).toBe(true);
  expect(entry.w).toBeGreaterThan(220);
  expect(Number.isInteger(entry.x) && Number.isInteger(entry.y)).toBe(true);

  // Delete with the keyboard: the block is gone, so is its layout entry.
  await note.click();
  await page.keyboard.press('Delete');
  await expect(note).toHaveCount(0);
  dbml = await documentText(page);
  expect(dbml).toBe(DOC);
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page.locator('.ed-filename__dot')).toHaveCount(0);
  await expect
    .poll(async () => (await sidecar(page)).views['*']!.nodes['note:note_1'])
    .toBeUndefined();

  // Mod+Z in the code brings the text back.
  await focusEditor(page);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(note).toBeVisible();
  expect(await documentText(page)).toContain('by Friday');
});

test('N adds a note at the pointer; Esc cancels the text; Enter / F2 edit; Backspace deletes', async ({
  page,
}) => {
  await openDoc(page, DOC);
  const pane = page.locator('.rv-canvas .react-flow__pane');
  const box = (await pane.boundingBox())!;
  const at = { x: box.x + 60, y: box.y + box.height - 140 };
  await page.mouse.click(at.x, at.y);
  await page.keyboard.press('n');
  const editor = page.getByRole('textbox', { name: 'Text of the note note_1' });
  await expect(editor).toBeFocused();
  const nb = (await noteNode(page, 'note_1').boundingBox())!;
  expect(Math.abs(nb.x - at.x)).toBeLessThan(3);
  expect(Math.abs(nb.y - at.y)).toBeLessThan(3);
  // N inside the editor is text, not a new note.
  await page.keyboard.type('Nn');
  await page.keyboard.press('Escape');
  await expect(editor).toBeHidden();
  await expect(noteNode(page, 'note_1')).toBeFocused();
  await expect(noteNode(page, 'note_1')).toContainText('New note');
  expect(await documentText(page)).toContain("Note note_1 {\n  'New note'\n}");

  // Enter on the focused note edits it; blur commits.
  await noteNode(page, 'note_1').focus();
  await page.keyboard.press('Enter');
  await expect(editor).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('Second text');
  await pane.click({ position: { x: 20, y: 20 } });
  await expect(editor).toBeHidden();
  await expect(noteNode(page, 'note_1')).toContainText('Second text');

  // F2 with the note selected, then a second note from the pane menu.
  await noteNode(page, 'note_1').click();
  await page.keyboard.press('F2');
  await expect(editor).toBeFocused();
  await page.keyboard.press('Escape');
  await pane.click({ button: 'right', position: { x: 300, y: 60 } });
  await page.getByRole('menuitem', { name: /Add note here/ }).click();
  const second = page.getByRole('textbox', { name: 'Text of the note note_2' });
  await expect(second).toBeFocused();
  await page.keyboard.press('ControlOrMeta+Enter');

  // Backspace deletes the selected notes (one layout step), the text is back to the original.
  await noteNode(page, 'note_1').click();
  await noteNode(page, 'note_2').click({ modifiers: ['Shift'] });
  await page.keyboard.press('Backspace');
  await expect(page.locator('.react-flow__node[data-id^="note:"]')).toHaveCount(0);
  expect(await documentText(page)).toBe(DOC);
});

test('a long note asks before it is deleted; the node menu edits and deletes', async ({ page }) => {
  const long = 'x'.repeat(240);
  await openDoc(page, `${DOC}\nNote memo {\n  '${long}'\n}\n`);
  const memo = noteNode(page, 'memo');
  await memo.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Edit text' })).toBeFocused();
  await page.getByRole('menuitem', { name: 'Delete note' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete the note memo?' });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(memo).toBeVisible();
  await memo.click();
  await page.keyboard.press('Delete');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete note' }).click();
  await expect(memo).toHaveCount(0);
  expect(await documentText(page)).toBe(DOC);
});

test('typing in the code editor never triggers the diagram keys', async ({ page }) => {
  await openDoc(page, DOC);
  await focusEditor(page);
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.type('\n// n');
  await page.keyboard.press('Backspace');
  await expect(page.locator('.react-flow__node[data-id^="note:"]')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: /Text of the note/ })).toHaveCount(0);
});
