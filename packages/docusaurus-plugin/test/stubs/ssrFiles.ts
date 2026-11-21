// `relvista-ssr-files` in tests: the server backend, reading the fixture site's static/ folder,
// with the schema diff renderer of `@theme/DbmlDiff` (as src/ssr/server.tsx offers it).
import { resolve } from 'node:path';
import { createSsrBackend } from '../../src/ssr/server.js';
import { withDiff } from '../../src/theme/DbmlDiff/server.js';

const backend = withDiff(
  createSsrBackend({
    // Vitest runs in the package folder (jsdom tests have no file: import.meta.url).
    siteDir: resolve(process.cwd(), 'test/fixtures/site'),
    staticDirectories: ['static'],
    baseUrl: '/docs-base/',
  }),
);

export default function relvistaSsr() {
  return backend;
}
