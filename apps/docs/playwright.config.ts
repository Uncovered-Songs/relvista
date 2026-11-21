import { execFileSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

/** A free TCP port, found synchronously (the config must be synchronous). */
function freePort(): number {
  const out = execFileSync(process.execPath, [
    '-e',
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{process.stdout.write(String(s.address().port));s.close()})",
  ]);
  return Number(String(out).trim());
}

// Workers re-evaluate this file; keep the port the main process picked.
process.env.RELVISTA_E2E_PORT ??= String(freePort());
const port = Number(process.env.RELVISTA_E2E_PORT);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}/`,
    viewport: { width: 1360, height: 900 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } },
    },
  ],
  webServer: {
    // Serves the production build (run `pnpm docs:build` first).
    command: `pnpm exec docusaurus serve --no-open --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
