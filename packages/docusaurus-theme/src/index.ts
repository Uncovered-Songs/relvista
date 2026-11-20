import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { LoadContext, Plugin } from '@docusaurus/types';

export { validateThemeConfig, DEFAULT_THEME_CONFIG, TOOLBAR_ITEMS } from './options.js';
export type { DbmlThemeConfig, ThemeConfig } from './options.js';
export { parseDbmlMeta, type DbmlFenceMeta } from './meta.js';

/** Plugin options (`themes: [['@relvista/docusaurus-theme', options]]`). Diagram defaults live in `themeConfig.dbml`. */
export interface PluginOptions {
  /** Add a Prism grammar so ` ```dbml static ` and the Source tab are syntax-highlighted. Default true. */
  highlight?: boolean;
}

const libDir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * relvista Docusaurus theme: ` ```dbml ` fences become interactive ER diagrams, and
 * `@theme/DbmlDiagram` renders `.dbml` files and inline sources.
 */
export default function themeRelvista(
  context: LoadContext,
  options: PluginOptions = {},
): Plugin<void> {
  const { siteDir } = context;
  const highlight = options.highlight ?? true;
  return {
    name: 'relvista-docusaurus-theme',

    getThemePath() {
      return join(libDir, 'theme');
    },

    getTypeScriptThemePath() {
      return join(libDir, '..', 'src', 'theme');
    },

    getClientModules() {
      const modules = [require.resolve('@relvista/renderer/styles.css')];
      if (highlight) modules.push(join(libDir, 'client', 'prism-dbml.js'));
      return modules;
    },

    getPathsToWatch() {
      return [join(siteDir, '**', '*.dbml'), join(siteDir, '**', '*.dbml.layout.json')];
    },

    configureWebpack() {
      return {
        module: {
          rules: [
            { test: /\.dbml$/i, type: 'asset/source' },
            {
              // `elkjs/lib/elk-worker.min.js?relvista-worker` → URL of the ELK Web Worker script,
              // emitted as-is (already minified), so auto-layout runs off the main thread.
              resourceQuery: /relvista-worker/,
              type: 'asset/resource',
              generator: { filename: 'assets/js/[name].[contenthash:8][ext]' },
            },
            {
              // Works around a terser miscompilation in @dbml/parse (see loaders/catch-rename).
              test: /[\\/]@dbml[\\/]parse[\\/]dist[\\/][^\\/]+\.m?js$/,
              use: [{ loader: join(libDir, 'loaders', 'catch-rename.js') }],
            },
          ],
        },
        resolve: {
          // elkjs' bundled build has an optional `require('web-worker')` for Node; browsers use
          // the global Worker, so never bundle it.
          fallback: { 'web-worker': false },
        },
      };
    },
  };
}
