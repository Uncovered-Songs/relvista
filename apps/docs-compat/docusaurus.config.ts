import { fileURLToPath } from 'node:url';
import type { Config, Plugin } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
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

const config: Config = {
  title: 'Compat fixture',
  url: 'http://localhost',
  baseUrl: '/',
  trailingSlash: false,
  onBrokenLinks: 'throw',
  i18n: { defaultLocale: 'en', locales: ['en'] },
  markdown: { mermaid: true },

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
  plugins: [mermaidLayoutElkStub, ...(baseline ? [] : ['@relvista/docusaurus-plugin'])],

  themeConfig: {
    colorMode: { defaultMode: 'light', respectPrefersColorScheme: false },
    navbar: {
      title: 'Compat fixture',
      items: [
        { to: '/', label: 'All fences', position: 'left' },
        { to: '/markdown', label: 'Markdown', position: 'left' },
      ],
    },
    prism: { theme: prismThemes.oneLight, darkTheme: prismThemes.oneDark },
    mermaid: { theme: { light: 'neutral', dark: 'dark' } },
    liveCodeBlock: { playgroundPosition: 'bottom' },
    dbml: { height: 360, editorUrl: false },
  } satisfies Preset.ThemeConfig,
};

export default config;
