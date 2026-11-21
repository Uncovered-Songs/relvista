import { execFileSync } from 'node:child_process';
import { defineConfig, devices } from '@playwright/test';

/** Free TCP ports, found synchronously (the config must be synchronous). */
function freePorts(n: number): number[] {
  const out = execFileSync(process.execPath, [
    '-e',
    `const net=require('net');const ps=[];let left=${n};const ss=[];` +
      `for(let i=0;i<${n};i++){const s=net.createServer();ss.push(s);s.listen(0,'127.0.0.1',()=>{ps.push(s.address().port);` +
      `if(--left===0){process.stdout.write(ps.join(','));ss.forEach(x=>x.close())}})}`,
  ]);
  return String(out).trim().split(',').map(Number);
}

// Workers re-evaluate this file; keep the ports the main process picked.
process.env.RELVISTA_COMPAT_PORTS ??= freePorts(2).join(',');
const [site, baseline] = process.env.RELVISTA_COMPAT_PORTS.split(',').map(Number) as [
  number,
  number,
];
process.env.RELVISTA_COMPAT_BASELINE_URL = `http://127.0.0.1:${baseline}/`;

const serve = (dir: string, port: number) => ({
  // Serves the production builds (run `pnpm --filter relvista-docs-compat build` first).
  command: `pnpm exec docusaurus serve --dir ${dir} --no-open --host 127.0.0.1 --port ${port}`,
  url: `http://127.0.0.1:${port}/`,
  reuseExistingServer: false,
  timeout: 60_000,
  stdout: 'ignore' as const,
  stderr: 'pipe' as const,
});

export default defineConfig({
  testDir: './e2e',
  // Inside build/, so it is ignored like the builds themselves.
  outputDir: './build/test-results',
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${site}/`,
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [serve('build/site', site), serve('build/baseline', baseline)],
});
