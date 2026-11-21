// Direct loads of the URLs people type, bookmark or follow from the npm READMEs, served the way
// GitHub Pages serves the build (scripts/serve-site.mjs): a folder URL redirects to its trailing
// slash and needs an index.html there (scripts/folder-pages.mjs writes those).
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const siteDir = fileURLToPath(new URL('..', import.meta.url));
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const port = Number(process.env.RELVISTA_E2E_PORT) + 1;
const origin = `http://127.0.0.1:${port}`;
const SITE = 'https://relvista.org';

let server: ChildProcess | null = null;

test.beforeAll(async () => {
  server = spawn(process.execPath, ['scripts/serve-site.mjs', '--port', String(port)], {
    cwd: siteDir,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((resolve, reject) => {
    server!.stdout!.on('data', (d: Buffer) => {
      if (String(d).includes('serving')) resolve();
    });
    server!.on('exit', (code) => reject(new Error(`serve-site exited with ${code}`)));
  });
});

test.afterAll(() => {
  server?.kill();
});

/** Site URLs the package READMEs and the root README link to. */
function readmeUrls(): string[] {
  const files = [
    'README.md',
    'packages/core/README.md',
    'packages/renderer/README.md',
    'packages/docusaurus-plugin/README.md',
  ];
  const urls = new Set<string>();
  for (const f of files) {
    const text = readFileSync(`${repoRoot}${f}`, 'utf8');
    for (const m of text.matchAll(/https:\/\/relvista\.org(\/[^\s)>"'`]*)/g)) urls.add(m[1]!);
  }
  return [...urls];
}

const NAVBAR = [
  '/docs/getting-started',
  '/docs/gallery',
  '/docs/api',
  '/docs/api/',
  '/docs/api/core',
  '/docs/api/renderer',
  '/docs/api/docusaurus-plugin',
  '/docs/reference',
  '/editor/',
];

test('every navbar and README URL loads directly, with its page', async ({ page }) => {
  const urls = [...new Set([...NAVBAR, ...readmeUrls()])];
  expect(urls).toContain('/docs/api/');
  for (const path of urls) {
    const res = await page.goto(`${origin}${path}`);
    expect(res?.status(), `${SITE}${path}`).toBe(200);
    if (path.startsWith('/docs/'))
      await expect(page.locator('article h1').first(), `${SITE}${path}`).toBeVisible();
  }
  // The API index is the reference page, also after the redirect to the folder URL.
  await page.goto(`${origin}/docs/api`);
  await expect(page.locator('article h1').first()).toHaveText(/API reference/);
});
