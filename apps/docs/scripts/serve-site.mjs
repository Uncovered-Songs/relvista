#!/usr/bin/env node
// Serves apps/docs/build (docs + editor) the way GitHub Pages does, for e2e tests:
//   /relvista/editor   → 301 /relvista/editor/      (folders get a trailing slash)
//   /relvista/editor/  → editor/index.html
//   /relvista/docs/x   → docs/x.html                 (Docusaurus with trailingSlash: false)
//   anything else      → 404.html, status 404
// `docusaurus serve` instead strips the trailing slash from folders, which GitHub Pages never does.
// Usage: node scripts/serve-site.mjs [--port 3000] [--host 127.0.0.1] [--dir build] [--base /relvista/]
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const siteDir = fileURLToPath(new URL('..', import.meta.url));
const root = resolve(siteDir, arg('dir', 'build'));
const base = arg('base', '/relvista/');
const port = Number(arg('port', '3000'));
const host = arg('host', '127.0.0.1');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.dbml': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
};

const isFile = (p) => existsSync(p) && statSync(p).isFile();
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

function send(res, status, file) {
  res.writeHead(status, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  createReadStream(file).pipe(res);
}

if (!isFile(join(root, 'index.html'))) {
  console.error(`serve-site: ${root}/index.html is missing. Run \`pnpm docs:build\` first.`);
  process.exit(1);
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  let path;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (path === base.replace(/\/$/, '')) path = base;
  if (!path.startsWith(base)) {
    res.writeHead(404).end('Not found');
    return;
  }
  const rel = normalize(path.slice(base.length));
  const target = join(root, rel);
  if (target !== root && !target.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (isDir(target)) {
    if (!path.endsWith('/')) {
      res.writeHead(301, { Location: `${path}/${url.search}` }).end();
      return;
    }
    if (isFile(join(target, 'index.html'))) return send(res, 200, join(target, 'index.html'));
  } else if (isFile(target)) {
    return send(res, 200, target);
  } else if (isFile(`${target}.html`)) {
    return send(res, 200, `${target}.html`);
  }
  if (isFile(join(root, '404.html'))) return send(res, 404, join(root, '404.html'));
  res.writeHead(404).end('Not found');
}).listen(port, host, () => {
  console.log(`serving ${root} at http://${host}:${port}${base}`);
});
