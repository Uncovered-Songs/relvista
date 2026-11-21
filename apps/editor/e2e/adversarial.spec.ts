/**
 * Adversarial byte-exact gate (phase 2, kept permanently). roundtrip.spec.ts covers every example
 * in the line-ending / BOM variants; this spec adds what real files do to editors:
 *
 * - more variants: tab indentation, trailing spaces and tabs, extra final newlines, unicode
 *   (CJK, ZWJ emoji, RTL, zero-width, NBSP, NFD, U+2028/U+2029/U+0085), and all of it at once with
 *   BOM + CRLF;
 * - a hand-written file in dbdiagram.io's export style using every DBML feature
 *   (e2e/data/dbdiagram-export.dbml), in every variant;
 * - edge files: empty, BOM only, whitespace only, a lone CR before CRLF, control characters, a
 *   20,000-character line;
 * - a long edit sequence undone with 60 undos, then Save and Save as;
 * - every way in: File System Access, `<input type=file>`, a dropped File, `?url=`; and a folder.
 *
 * Always: the bytes written equal the bytes read, nothing else is written (no layout sidecar),
 * and the page logs no errors.
 */
import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { VARIANTS, folderExample, singleExamples } from './fixtures.js';
import { installFsMock } from './fsMock.js';
import { focusEditor, openEditor, trackErrors } from './helpers.js';

test.describe.configure({ mode: 'parallel' });

const enc = new TextEncoder();
const BOM = '\uFEFF';
const lf = (t: string) => t.replace(/\r\n?/g, '\n');
const tabs = (t: string) => lf(t).replace(/^( {2})+/gm, (m) => '\t'.repeat(m.length / 2));
const UNICODE = [
  '',
  '// ünïcødé: 日本語テキスト, emoji 👩‍👩‍👧‍👦 🏳️‍🌈, RTL שלום عربى, ZW\u200b‍, NBSP\u00a0, NFD e\u0301,',
  '// LS\u2028 PS\u2029 NEL\u0085 tab\tend',
  'Note "ünï 🚧" {',
  "  'Ünïcode note — 中文 line sep'",
  '}',
  '',
].join('\n');

/** Variants roundtrip.spec.ts does not cover (it has as is, CRLF, CR, mixed, BOM, no final EOL). */
const EXTRA_VARIANTS: Record<string, (t: string) => Uint8Array> = {
  'extra final newlines': (t) => enc.encode(`${t}\n\n\n`),
  tabs: (t) => enc.encode(tabs(t)),
  'trailing whitespace': (t) => {
    let i = 0;
    return enc.encode(lf(t).replace(/\n/g, () => (i++ % 2 ? ' \t \n' : '   \n')));
  },
  unicode: (t) => enc.encode(lf(t) + UNICODE),
  'unicode+BOM+CRLF+tabs': (t) => enc.encode(BOM + tabs(lf(t) + UNICODE).replaceAll('\n', '\r\n')),
};
const ALL_VARIANTS = { ...VARIANTS, ...EXTRA_VARIANTS };

const EDGE_FILES: Record<string, Uint8Array> = {
  'empty.dbml': new Uint8Array(),
  'bom-only.dbml': enc.encode(BOM),
  'whitespace-only.dbml': enc.encode(' \t\r\n\r\n  \n'),
  'crlf-at-eof-only.dbml': enc.encode('Table a {\n  id int\n}\r\n'),
  'lone-cr-before-crlf.dbml': enc.encode('Table a {\r\r\n  id int\r\n\r}\n'),
  'control-characters.dbml': enc.encode('// \u0001\u0007\u001b ctrl\nTable a {\n  id int\n}\n'),
  'long-line.dbml': enc.encode(`// ${'x'.repeat(20000)}\nTable a {\n  id int\n}\n`),
};

const DBDIAGRAM = {
  name: 'dbdiagram-export.dbml',
  text: readFileSync(new URL('./data/dbdiagram-export.dbml', import.meta.url), 'utf8'),
};

// --- page helpers -------------------------------------------------------------------------------

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

const writes = (page: Page) => page.evaluate(() => [...window.__fsMock.writes]);

/** The document is shown and the diagram (if there is one to draw) has its layout. */
async function opened(page: Page, name: string): Promise<void> {
  await expect(page.locator('.ed-filename__name')).toHaveText(name);
  await expect(page.locator('.rv-canvas[data-rv-layout="pending"]')).toHaveCount(0);
}

async function openViaFsa(page: Page, path: string, name: string): Promise<void> {
  await page.evaluate((p) => (window.__fsMock.nextOpen = [p]), path);
  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await page.getByRole('menuitem', { name: /Open file/ }).click();
  await opened(page, name);
}

async function saveAs(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => window.__fsMock.nextSave.push(p), path);
  await page.keyboard.press('ControlOrMeta+Shift+s');
  await expect.poll(() => writes(page)).toContain(path);
}

/** Typing, new lines, a tab, deletions, select all + delete, retyping: then undo all of it. */
async function editThenUndo(page: Page): Promise<void> {
  await focusEditor(page);
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('ControlOrMeta+ArrowDown');
  await page.keyboard.type('\nTable zz_gate {\n id int [pk]\n');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('x');
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.press('ControlOrMeta+ArrowUp');
  await page.keyboard.type('// top edit');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type('Table y {}');
  // Let the diagram react (compile, placement) before undoing.
  await page.waitForTimeout(500);
  for (let i = 0; i < 60; i++) await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('.ed-filename__dot')).toBeHidden();
}

function noErrors(errors: string[]): void {
  expect(errors.filter((e) => !/favicon/.test(e))).toEqual([]);
}

// --- File System Access: every file × the extra variants (quick edit) ---------------------------

for (const file of [...singleExamples(), DBDIAGRAM]) {
  for (const [variant, make] of Object.entries(EXTRA_VARIANTS)) {
    test(`FSA ${file.name} × ${variant}`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.addInitScript(installFsMock, 'fsa');
      await openEditor(page);
      const bytes = make(file.text);
      await seed(page, `in/${file.name}`, bytes);
      await openViaFsa(page, `in/${file.name}`, file.name);

      await page.keyboard.press('ControlOrMeta+s');
      await page.waitForTimeout(100);
      expect(await writes(page)).toEqual([]);

      await focusEditor(page);
      await page.keyboard.type('x');
      await page.keyboard.press('ControlOrMeta+z');
      await saveAs(page, `out/${file.name}`);
      expect(await read(page, `out/${file.name}`)).toEqual(bytes);
      expect(await writes(page)).toEqual([`out/${file.name}`]);
      noErrors(errors);
    });
  }
}

// --- File System Access: the dbdiagram-style file and the edge files, long edit + 60 undos --------

const LONG_EDIT_CASES: Array<[string, string, Uint8Array]> = [
  ...Object.entries(ALL_VARIANTS).map(
    ([v, make]) =>
      [`${DBDIAGRAM.name} × ${v}`, DBDIAGRAM.name, make(DBDIAGRAM.text)] as [
        string,
        string,
        Uint8Array,
      ],
  ),
  ...Object.entries(EDGE_FILES).map(
    ([n, b]) => [`edge ${n}`, n, b] as [string, string, Uint8Array],
  ),
];

for (const [label, name, bytes] of LONG_EDIT_CASES) {
  test(`FSA edit+undo ${label}`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(installFsMock, 'fsa');
    await openEditor(page);
    await seed(page, `in/${name}`, bytes);
    await openViaFsa(page, `in/${name}`, name);

    // Unedited: Save writes nothing, Save as writes the same bytes.
    await page.keyboard.press('ControlOrMeta+s');
    await page.waitForTimeout(100);
    expect(await writes(page)).toEqual([]);
    await saveAs(page, `out1/${name}`);
    expect(await read(page, `out1/${name}`)).toEqual(bytes);

    // Edited and undone: Save (to out1 now) and Save as still write the original bytes.
    await editThenUndo(page);
    await page.keyboard.press('ControlOrMeta+s');
    await page.waitForTimeout(200);
    expect(await read(page, `out1/${name}`)).toEqual(bytes);
    await saveAs(page, `out2/${name}`);
    expect(await read(page, `out2/${name}`)).toEqual(bytes);
    expect((await writes(page)).filter((w) => w.endsWith('.layout.json'))).toEqual([]);
    expect(await read(page, `in/${name}`)).toEqual(bytes);
    noErrors(errors);
  });
}

// --- Download fallback: `<input type=file>` and a dropped File ---------------------------------

const FALLBACK_VARIANTS = ['as is', 'CR', 'mixed', 'unicode+BOM+CRLF+tabs'] as const;

async function downloadOf(page: Page, action: () => Promise<void>): Promise<Uint8Array> {
  const download = page.waitForEvent('download');
  await action();
  const d = await download;
  return new Uint8Array(readFileSync((await d.path())!));
}

for (const via of ['input', 'drop'] as const) {
  for (const variant of FALLBACK_VARIANTS) {
    test(`${via} ${DBDIAGRAM.name} × ${variant}`, async ({ page }) => {
      const errors = trackErrors(page);
      await page.addInitScript(installFsMock, 'fallback');
      await openEditor(page);
      const bytes = ALL_VARIANTS[variant]!(DBDIAGRAM.text);
      if (via === 'input') {
        const chooser = page.waitForEvent('filechooser');
        await page.keyboard.press('ControlOrMeta+o');
        await (
          await chooser
        ).setFiles({ name: DBDIAGRAM.name, mimeType: 'text/plain', buffer: Buffer.from(bytes) });
      } else {
        const data = await page.evaluateHandle(
          ([n, b]) => {
            const dt = new DataTransfer();
            dt.items.add(new File([new Uint8Array(b as number[])], n as string));
            return dt;
          },
          [DBDIAGRAM.name, [...bytes]] as const,
        );
        const app = page.locator('.ed-app');
        for (const type of ['dragenter', 'dragover', 'drop'])
          await app.dispatchEvent(type, { dataTransfer: data });
      }
      await opened(page, DBDIAGRAM.name);
      expect(await downloadOf(page, () => page.keyboard.press('ControlOrMeta+s'))).toEqual(bytes);
      await editThenUndo(page);
      expect(await downloadOf(page, () => page.keyboard.press('ControlOrMeta+s'))).toEqual(bytes);
      // A layout sidecar would arrive as a second download.
      const extra = await page.waitForEvent('download', { timeout: 800 }).catch(() => null);
      expect(extra?.suggestedFilename() ?? null).toBeNull();
      noErrors(errors);
    });
  }
}

// --- ?url= -------------------------------------------------------------------------------------

for (const variant of FALLBACK_VARIANTS) {
  test(`?url= ${DBDIAGRAM.name} × ${variant}`, async ({ page }) => {
    const errors = trackErrors(page);
    const bytes = ALL_VARIANTS[variant]!(DBDIAGRAM.text);
    const remote = `https://files.example.test/repo/${DBDIAGRAM.name}`;
    await page.route('https://files.example.test/**', (r) =>
      r.request().url() === remote
        ? r.fulfill({
            headers: { 'access-control-allow-origin': '*', 'content-type': 'text/plain' },
            body: Buffer.from(bytes),
          })
        : r.fulfill({ status: 404, headers: { 'access-control-allow-origin': '*' } }),
    );
    await page.addInitScript(installFsMock, 'fallback');
    await openEditor(page, `?url=${encodeURIComponent(remote)}`);
    await opened(page, DBDIAGRAM.name);
    expect(await downloadOf(page, () => page.keyboard.press('ControlOrMeta+s'))).toEqual(bytes);
    await editThenUndo(page);
    expect(await downloadOf(page, () => page.keyboard.press('ControlOrMeta+s'))).toEqual(bytes);
    // No sidecar probe without &layout, so no 404 in the console either.
    noErrors(errors);
  });
}

// --- Folder: edit + undo in every tab, then Save writes nothing --------------------------------

for (const variant of ['CRLF', 'BOM'] as const) {
  test(`FSA folder 12-modules × ${variant}, edit+undo in every tab`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.addInitScript(installFsMock, 'fsa');
    await openEditor(page);
    const files = Object.fromEntries(
      Object.entries(folderExample('12-modules')).map(([p, b]) => [
        p,
        p.endsWith('.dbml') ? VARIANTS[variant]!(new TextDecoder().decode(b)) : b,
      ]),
    );
    for (const [p, b] of Object.entries(files)) await seed(page, `proj/${p}`, b);
    await page.evaluate(() => (window.__fsMock.nextDirectory = 'proj'));
    await page.getByRole('button', { name: 'Open', exact: true }).click();
    await page.getByRole('menuitem', { name: /Open folder/ }).click();
    await opened(page, 'main.dbml');
    const tabs = page.getByRole('tab', { name: /\.dbml/ });
    const count = await tabs.count();
    expect(count).toBeGreaterThan(1);
    for (let i = 0; i < count; i++) {
      await tabs.nth(i).click();
      await editThenUndo(page);
    }
    await page.keyboard.press('ControlOrMeta+s');
    await page.waitForTimeout(300);
    expect(await writes(page)).toEqual([]);
    for (const [p, b] of Object.entries(files)) expect(await read(page, `proj/${p}`)).toEqual(b);
    noErrors(errors);
  });
}
