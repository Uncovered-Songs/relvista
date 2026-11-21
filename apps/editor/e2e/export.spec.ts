import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { diagramReady, exportItem, openEditor } from './helpers.js';

test('SVG, PNG, DBML, layout JSON and PostgreSQL exports', async ({ page }) => {
  test.setTimeout(120_000);
  await openEditor(page);
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'From example' }).click();
  await page.getByRole('menuitem', { name: /^Minimal/ }).click();
  await diagramReady(page);
  expect((await exportItem(page, /SVG/)).toString()).toContain('users');
  expect([...(await exportItem(page, /PNG/)).subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  const dbml = await exportItem(page, /DBML file/);
  expect(dbml.toString()).toBe(
    readFileSync(new URL('../../../examples/01-minimal.dbml', import.meta.url), 'utf8'),
  );
  expect(JSON.parse((await exportItem(page, /Layout JSON/)).toString()).version).toBe(1);
  expect((await exportItem(page, /^SQL/, /PostgreSQL/)).toString()).toContain('CREATE TABLE');
});
