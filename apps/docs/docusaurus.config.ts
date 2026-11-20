import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import npm2yarn from '@docusaurus/remark-plugin-npm2yarn';
import { themes as prismThemes } from 'prism-react-renderer';

const repoUrl = 'https://github.com/Uncovered-Songs/relvista';

const config: Config = {
  title: 'relvista',
  tagline: 'Open-source DBML diagrams for your docs',
  favicon: 'img/favicon.svg',

  url: 'https://uncovered-songs.github.io',
  baseUrl: '/relvista/',
  organizationName: 'Uncovered-Songs',
  projectName: 'relvista',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  onBrokenAnchors: 'throw',
  markdown: {
    hooks: { onBrokenMarkdownLinks: 'throw' },
  },

  i18n: { defaultLocale: 'en', locales: ['en'] },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          editUrl: `${repoUrl}/edit/main/apps/docs/`,
          remarkPlugins: [[npm2yarn, { sync: true, converters: ['yarn', 'pnpm'] }]],
        },
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      } satisfies Preset.Options,
    ],
  ],

  themes: ['@relvista/docusaurus-theme'],

  themeConfig: {
    colorMode: { respectPrefersColorScheme: true },
    navbar: {
      title: 'relvista',
      logo: { alt: 'relvista logo', src: 'img/logo.svg' },
      items: [
        { type: 'docSidebar', sidebarId: 'docs', position: 'left', label: 'Docs' },
        { to: '/docs/gallery', label: 'Gallery', position: 'left' },
        { href: repoUrl, label: 'GitHub', position: 'right' },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            { label: 'Getting started', to: '/docs/getting-started' },
            { label: 'Usage', to: '/docs/usage' },
            { label: 'Layout file', to: '/docs/layout-file' },
            { label: 'Gallery', to: '/docs/gallery' },
          ],
        },
        {
          title: 'Project',
          items: [
            { label: 'GitHub', href: repoUrl },
            { label: 'Issues', href: `${repoUrl}/issues` },
            { label: 'DBML language', href: 'https://dbml.dbdiagram.io/docs/' },
          ],
        },
      ],
      copyright: `relvista is MIT licensed. DBML is an open language by Holistics.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['json', 'bash'],
    },
    dbml: {
      height: 480,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
