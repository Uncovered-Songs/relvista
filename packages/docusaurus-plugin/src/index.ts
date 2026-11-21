import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import type { DocusaurusConfig, LoadContext, Plugin } from '@docusaurus/types';

export {
  validateThemeConfig,
  DEFAULT_THEME_CONFIG,
  PALETTE_OPTIONS,
  TOOLBAR_ITEMS,
} from './options.js';
export type { DbmlPalette, DbmlThemeConfig, ThemeConfig } from './options.js';
export { parseDbmlMeta, type DbmlFenceMeta } from './meta.js';

/** Plugin options (`plugins: [['@relvista/docusaurus-plugin', options]]`). Diagram defaults live in `themeConfig.dbml`. */
export interface PluginOptions {
  /** Add a Prism grammar so ` ```dbml static ` and the Source tab are syntax-highlighted. Default true. */
  highlight?: boolean;
}

const libDir = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

type PluginEntry = DocusaurusConfig['plugins'][number];

function entryName(entry: PluginEntry): string | null {
  const head: unknown = Array.isArray(entry) ? entry[0] : entry;
  return typeof head === 'string' ? head : null;
}

const isClassicTheme = (name: string | null): boolean =>
  name !== null &&
  (name === 'classic' || /(?:^|[\\/])@docusaurus[\\/]theme-classic(?:[\\/]|$)/.test(name));

function isRelvista(entry: PluginEntry): boolean {
  const head: unknown = Array.isArray(entry) ? entry[0] : entry;
  if (head === pluginRelvista) return true;
  const name = entryName(entry);
  return name !== null && (name === '@relvista' || name.includes('@relvista/docusaurus-plugin'));
}

/**
 * Why ` ```dbml ` fences would silently stay code blocks, or null. The plugin's
 * `MDXComponents/Code` wraps `@theme-init/MDXComponents/Code`, so it must load after the theme that
 * provides it. Docusaurus loads preset plugins, preset themes, then `plugins`, then `themes`: with
 * preset-classic any position works, but `@docusaurus/theme-classic` listed in `themes` loads after
 * every entry in `plugins` and replaces relvista's component.
 */
export function registrationProblem(
  siteConfig: Pick<DocusaurusConfig, 'plugins' | 'themes'> | undefined,
): string | null {
  const themes = siteConfig?.themes ?? [];
  const classic = themes.findIndex((t) => isClassicTheme(entryName(t)));
  if (classic === -1) return null;
  const inPlugins = (siteConfig?.plugins ?? []).some(isRelvista);
  const themeIndex = themes.findIndex(isRelvista);
  if (!inPlugins && (themeIndex === -1 || themeIndex > classic)) return null;
  return (
    '[relvista] @docusaurus/theme-classic is listed in `themes` and loads after ' +
    '@relvista/docusaurus-plugin, so ```dbml code fences render as code instead of diagrams. ' +
    "Register relvista in `themes` after the classic theme: themes: ['@docusaurus/theme-classic', " +
    "'@relvista/docusaurus-plugin']."
  );
}

/**
 * relvista Docusaurus plugin: ` ```dbml ` fences become interactive ER diagrams, and
 * `@theme/DbmlDiagram` renders `.dbml` files and inline sources. It only adds components; the
 * site's theme and styles are untouched (relvista's CSS only targets its own `.rv-*` and React Flow classes).
 */
export default function pluginRelvista(
  context: LoadContext,
  options: PluginOptions = {},
): Plugin<void> {
  const problem = registrationProblem(context.siteConfig);
  if (problem) console.warn(problem);
  const { siteDir } = context;
  const highlight = options.highlight ?? true;
  return {
    name: 'relvista-docusaurus-plugin',

    getThemePath() {
      return join(libDir, 'theme');
    },

    getTypeScriptThemePath() {
      return join(libDir, '..', 'src', 'theme');
    },

    getClientModules() {
      // The site palette maps relvista's variables to the site's; it must come after the renderer's.
      const modules = [
        require.resolve('@relvista/renderer/styles.css'),
        join(libDir, 'client', 'site-palette.css'),
      ];
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
