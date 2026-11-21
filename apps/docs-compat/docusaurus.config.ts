import { fileURLToPath } from 'node:url';
import type { Config, Plugin } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import type { PluginOptions as DocsPluginOptions } from '@docusaurus/plugin-content-docs';
import { themes as prismThemes } from 'prism-react-renderer';

/**
 * Test fixture (not deployed): a site with its own strongly customised Infima theme, mermaid,
 * live code blocks and its own swizzled `CodeBlock` wrapper (src/theme/CodeBlock), with relvista
 * registered the recommended way. `RELVISTA_COMPAT_BASELINE=1` builds the same site without
 * relvista, so the e2e can check that relvista leaves the site's own styling alone.
 */
const baseline = !!process.env['RELVISTA_COMPAT_BASELINE'];

/**
 * @docusaurus/theme-mermaid 3.10.2 decides whether the optional `@mermaid-js/layout-elk` peer is
 * installed with a dynamic import that, under Docusaurus' config loader in a pnpm workspace,
 * reports it present when it is not; the client bundle then fails to resolve it. This fixture does
 * not use ELK mermaid layouts, so the import resolves to an empty list of layouts instead.
 */
function mermaidLayoutElkStub(): Plugin {
  return {
    name: 'compat-mermaid-layout-elk-stub',
    configureWebpack() {
      return {
        resolve: {
          alias: {
            '@mermaid-js/layout-elk$': fileURLToPath(
              new URL('./stubs/mermaid-layout-elk.js', import.meta.url),
            ),
          },
        },
      };
    },
  };
}

/**
 * A second docs instance whose content lives outside the site directory
 * (../docs-compat-catalog/docs): CommonMark `.md` sheets whose front matter holds nested objects
 * with their own `id` keys, and a custom sidebar generator, the layout of a data catalog. Its pages
 * must render with relvista registered, and its ```dbml fences become diagrams.
 */
const shortLabels: DocsPluginOptions['sidebarItemsGenerator'] = async ({
  defaultSidebarItemsGenerator,
  ...args
}) => {
  const items = await defaultSidebarItemsGenerator(args);
  const titles = new Map(args.docs.map((d) => [d.id, d.title]));
  return items.map((it) =>
    it.type === 'category'
      ? {
          ...it,
          items: it.items.map((child) =>
            child.type === 'doc'
              ? { ...child, label: titles.get(child.id)?.split(' - ')[0]?.trim() }
              : child,
          ),
        }
      : it,
  );
};

const catalogDocs: [string, Partial<DocsPluginOptions>] = [
  '@docusaurus/plugin-content-docs',
  {
    id: 'catalog',
    path: '../docs-compat-catalog/docs',
    routeBasePath: 'catalog',
    sidebarItemsGenerator: shortLabels,
  },
];

const config: Config = {
  title: 'Compat fixture',
  url: 'http://localhost',
  baseUrl: '/',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  i18n: { defaultLocale: 'en', locales: ['en'] },
  // .md files are CommonMark, .mdx files MDX (the catalog sheets have braces MDX would parse).
  markdown: { mermaid: true, format: 'detect' },

  presets: [
    [
      'classic',
      {
        docs: { routeBasePath: '/', sidebarPath: false },
        blog: false,
        pages: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],

  themes: ['@docusaurus/theme-mermaid', '@docusaurus/theme-live-codeblock'],

  // The recommended registration (docs: getting started).
  plugins: [
    mermaidLayoutElkStub,
    ...(baseline ? [] : ['@relvista/docusaurus-plugin']),
    catalogDocs,
  ],

  themeConfig: {
    colorMode: { defaultMode: 'light', respectPrefersColorScheme: false },
    navbar: {
      title: 'Compat fixture',
      items: [
        { to: '/', label: 'All fences', position: 'left' },
        { to: '/markdown', label: 'Markdown', position: 'left' },
        { to: '/catalog/systems/toll-db', label: 'Catalog', position: 'left' },
      ],
    },
    prism: { theme: prismThemes.oneLight, darkTheme: prismThemes.oneDark },
    mermaid: { theme: { light: 'neutral', dark: 'dark' } },
    liveCodeBlock: { playgroundPosition: 'bottom' },
    dbml: { height: 360, editorUrl: false },
  } satisfies Preset.ThemeConfig,
};

export default config;
