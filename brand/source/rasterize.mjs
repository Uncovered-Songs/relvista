// Renders the brand PNGs from the SVGs in brand/, with the repo's Playwright (Chromium).
//
// Usage: node brand/source/rasterize.mjs
// Needs `pnpm install` and `pnpm --filter relvista-docs exec playwright install chromium`.
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const brand = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(new URL('../../apps/docs/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

// [source SVG, output PNG, width, height, transparent background]
const jobs = [
  ['favicon.svg', 'icons/favicon-32.png', 32, 32, true],
  ['avatar.svg', 'icons/apple-touch-icon.png', 180, 180, true],
  ['favicon.svg', 'icons/icon-192.png', 192, 192, true],
  ['favicon.svg', 'icons/icon-512.png', 512, 512, true],
  ['avatar.svg', 'icons/icon-maskable-512.png', 512, 512, true],
  ['avatar.svg', 'avatar.png', 500, 500, false],
  ['banner.svg', 'banner.png', 1280, 400, false],
  ['social-preview.svg', 'social-preview.png', 1280, 640, false],
];

mkdirSync(`${brand}icons`, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [src, dst, width, height, transparent] of jobs) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const data = readFileSync(`${brand}${src}`).toString('base64');
    await page.setContent(
      `<html><body style="margin:0;background:transparent"><img width="${width}" height="${height}" src="data:image/svg+xml;base64,${data}"></body></html>`,
    );
    await page.locator('img').evaluate((img) => img.decode());
    await page.screenshot({ path: `${brand}${dst}`, omitBackground: transparent });
    await page.close();
    console.log(`${dst} ${width}x${height}`);
  }
} finally {
  await browser.close();
}
