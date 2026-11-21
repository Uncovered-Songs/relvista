// Renders the org banners, social preview and avatar in the relvista.org home-page style.
// Run from the repo root: node brand/source/render-org.mjs <out-dir>
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(
  require.resolve('playwright', { paths: [process.cwd() + '/node_modules/.pnpm/node_modules'] }),
);
const out = process.argv[2];
const light = fs.readFileSync('apps/docs/static/img/logo-light.svg', 'utf8');
const dark = fs.readFileSync('apps/docs/static/img/logo-dark.svg', 'utf8');
const mark = fs.readFileSync('apps/docs/static/img/mark.svg', 'utf8');
const theme = {
  light: {
    bg: '#ffffff',
    fg: '#1c1e21',
    teal: '#0f7b6c',
    b: 'rgba(47,111,237,0.12)',
    t: 'rgba(20,163,139,0.10)',
    logo: light,
  },
  dark: {
    bg: '#0f1217',
    fg: '#e3e3e3',
    teal: '#3cc7ae',
    b: 'rgba(111,155,255,0.14)',
    t: 'rgba(60,199,174,0.10)',
    logo: dark,
  },
};
const page = (th, w, h, logoH, eyebrow, tag) => `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@600&family=Manrope:wght@600&display=block" rel="stylesheet">
<style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
body{background:radial-gradient(${w * 0.75}px ${h * 0.8}px at 85% -10%, ${th.b}, transparent 60%),radial-gradient(${w * 0.5}px ${h * 0.65}px at -10% 20%, ${th.t}, transparent 60%),${th.bg};
display:flex;flex-direction:column;align-items:center;justify-content:center;gap:${Math.round(h * 0.035)}px;color:${th.fg}}
.e{font:600 ${eyebrow}px Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:${th.teal}}
.l svg{height:${logoH}px;width:auto;display:block}
.t{font:600 ${tag}px Manrope,sans-serif}</style></head><body>
<div class="e">Open source · MIT libraries · AGPL editor</div><div class="l">${th.logo}</div><div class="t">Open-source DBML diagrams for your docs</div></body></html>`;
(async () => {
  const b = await chromium.launch();
  const jobs = [
    ['banner-light', theme.light, 1280, 400, 120, 17, 30],
    ['banner-dark', theme.dark, 1280, 400, 120, 17, 30],
    ['social-preview', theme.light, 1280, 640, 170, 22, 40],
  ];
  for (const [n, th, w, h, lh, e, t] of jobs) {
    const p = await b.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await p.setContent(page(th, w, h, lh, e, t), { waitUntil: 'networkidle' });
    await p.evaluate(() => document.fonts.ready);
    await p.screenshot({ path: `${out}/${n}.png` });
    await p.close();
  }
  // avatars: the mark as in the navbar, on white and on the banner's soft blue/teal wash
  const grounds = {
    avatar: '#fff',
    'avatar-soft':
      'radial-gradient(420px 380px at 100% 0%, rgba(47,111,237,0.20), transparent 70%),' +
      'radial-gradient(380px 380px at 0% 100%, rgba(20,163,139,0.20), transparent 70%), #fff',
  };
  for (const [name, bg] of Object.entries(grounds)) {
    const p = await b.newPage({ viewport: { width: 500, height: 500 } });
    await p.setContent(
      `<html><body style="margin:0;background:${bg};display:grid;place-items:center;height:500px"><div style="width:300px;height:300px;transform:translate(-16px,-8px)">${mark.replace('<svg', '<svg width="300" height="300"')}</div></body></html>`,
    );
    await p.screenshot({ path: `${out}/${name}.png` });
    await p.close();
  }
  await b.close();
})();
