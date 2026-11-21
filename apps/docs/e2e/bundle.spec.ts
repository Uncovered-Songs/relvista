// JavaScript budgets of the docs site. Pages without diagrams must not pay for the diagram theme
// code or the generated API reference: the API is its own docs instance (its sidebar metadata
// only loads on API pages), and the plugin puts its theme code
// into one shared `relvista-theme` chunk whatever the page count (Docusaurus' `common` chunk needs
// half of all pages to use a module, which ~300 API pages make impossible).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';

const jsDir = fileURLToPath(new URL('../build/assets/js/', import.meta.url));

/** Gzipped bytes of every script the page downloads (prefetches included) until it settles. */
async function scriptBytes(page: Page, path: string): Promise<{ gz: number; files: string[] }> {
  const bodies = new Map<string, Buffer>();
  const pending: Promise<void>[] = [];
  page.on('response', (r) => {
    if (!r.url().endsWith('.js')) return;
    pending.push(
      r.body().then(
        (b) => void bodies.set(r.url(), b),
        () => {},
      ),
    );
  });
  await page.goto(path, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await Promise.all(pending);
  let gz = 0;
  for (const b of bodies.values()) gz += gzipSync(b).length;
  return { gz, files: [...bodies.keys()].map((u) => u.split('/').pop()!) };
}

test('the theme code is in one shared chunk, not copied into page chunks', () => {
  const withTheme = readdirSync(jsDir).filter(
    (f) => f.endsWith('.js') && readFileSync(join(jsDir, f), 'utf8').includes('relvista-ssr'),
  );
  expect(withTheme).toHaveLength(1);
  expect(withTheme[0]).toMatch(/^relvista-theme\.[0-9a-f]+\.js$/);
});

test('a docs page without diagrams stays within its JavaScript budget', async ({ page }) => {
  const { gz, files } = await scriptBytes(page, 'docs/layout-file');
  console.log(`[size] docs/layout-file: ${gz} B of JavaScript (gzip), ${files.length} files`);
  // About 282 KB today (phase 2: ~221 KB with 23 pages; the site now has ~340, and main.js and
  // the route map carry the ~320 API routes; docs/design/phase3-v1.md "Bundle size").
  expect(gz).toBeLessThan(300_000);
  // The API sidebar metadata (~18 KB gzip) is not even prefetched: the navbar and sidebar links
  // to /docs/api are plain links (docusaurus.config.ts, sidebars.ts).
  const apiMeta = readdirSync(jsDir).filter((f) => {
    if (!f.endsWith('.js')) return false;
    const code = readFileSync(join(jsDir, f), 'utf8');
    return code.includes('"pluginId":"api"') && code.includes('"docsSidebars"');
  });
  expect(apiMeta).toHaveLength(1);
  expect(files).not.toContain(apiMeta[0]);
  // Nor is it part of the main docs instance's metadata, which every docs page loads.
  const mainMeta = readdirSync(jsDir).filter((f) => {
    if (!f.endsWith('.js')) return false;
    const code = readFileSync(join(jsDir, f), 'utf8');
    return code.includes('"pluginId":"default"') && code.includes('"docsSidebars"');
  });
  expect(mainMeta).toHaveLength(1);
  const meta = readFileSync(join(jsDir, mainMeta[0]!), 'utf8');
  expect(meta).not.toContain('/docs/api/core/');
  expect(meta.length).toBeLessThan(30_000);
});
