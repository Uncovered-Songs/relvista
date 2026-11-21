import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Joi } from '@docusaurus/utils-validation';
import type { LoadContext } from '@docusaurus/types';
import {
  DEFAULT_EDITOR_URL as RENDERER_EDITOR_URL,
  DEFAULT_TOOLBAR as RENDERER_TOOLBAR,
} from '@relvista/renderer';
import pluginRelvista, {
  DEFAULT_THEME_CONFIG,
  TOOLBAR_ITEMS,
  parseDbmlMeta,
  registrationProblem,
  validateThemeConfig,
} from '../src/index.js';
import type { ThemeConfig } from '../src/options.js';

const validate = (schema: Joi.ObjectSchema<ThemeConfig>, value: Partial<ThemeConfig>) => {
  const { error, value: out } = schema.validate(value, { convert: false });
  if (error) throw error;
  return out as ThemeConfig;
};

describe('parseDbmlMeta', () => {
  it('parses quoted, bare and flag values', () => {
    expect(
      parseDbmlMeta(
        `title="Billing \\"core\\"" height=500 view='Billing' layout="/x.layout.json" source`,
      ),
    ).toEqual({
      title: 'Billing "core"',
      height: 500,
      view: 'Billing',
      layout: '/x.layout.json',
      source: true,
    });
  });

  it('keeps CSS heights as strings and reads detail levels', () => {
    expect(parseDbmlMeta('height=60vh detail=keys')).toEqual({
      height: '60vh',
      detailLevel: 'keys',
    });
  });

  it('handles empty input, false flags and unknown keys', () => {
    expect(parseDbmlMeta(undefined)).toEqual({});
    expect(parseDbmlMeta('')).toEqual({});
    expect(parseDbmlMeta('source=false showLineNumbers static')).toEqual({
      source: false,
      static: true,
    });
  });
});

describe('validateThemeConfig', () => {
  it('fills defaults', () => {
    expect(validateThemeConfig({ validate, themeConfig: {} as never })).toEqual(
      DEFAULT_THEME_CONFIG,
    );
  });

  it('accepts a full config', () => {
    const dbml = {
      height: '70vh',
      toolbar: ['zoom', 'fit'],
      editorUrl: 'https://example.com/editor/',
      detailLevel: 'keys',
      palette: 'relvista',
      ssr: false,
    };
    expect(validateThemeConfig({ validate, themeConfig: { dbml } as never })).toEqual({ dbml });
  });

  it('defaults editorUrl to the hosted editor (same URL as the renderer)', () => {
    const out = validateThemeConfig({ validate, themeConfig: {} as never });
    expect(out.dbml.editorUrl).toBe(RENDERER_EDITOR_URL);
  });

  it('accepts editorUrl: false (hides the button) and relative URLs', () => {
    for (const editorUrl of [false, '/relvista/editor/', 'editor/']) {
      const out = validateThemeConfig({ validate, themeConfig: { dbml: { editorUrl } } as never });
      expect(out.dbml.editorUrl).toBe(editorUrl);
    }
    expect(() =>
      validateThemeConfig({ validate, themeConfig: { dbml: { editorUrl: true } } as never }),
    ).toThrow();
  });

  it('offers every viewer toolbar item, in the viewer order (search, detail, link too)', () => {
    expect([...TOOLBAR_ITEMS]).toEqual(RENDERER_TOOLBAR);
    expect(DEFAULT_THEME_CONFIG.dbml.toolbar).toEqual(RENDERER_TOOLBAR);
    const toolbar = ['search', 'detail', 'link', 'zoom'];
    const out = validateThemeConfig({ validate, themeConfig: { dbml: { toolbar } } as never });
    expect(out.dbml.toolbar).toEqual(toolbar);
    expect(() =>
      validateThemeConfig({
        validate,
        themeConfig: { dbml: { toolbar: ['search', 'search'] } } as never,
      }),
    ).toThrow();
  });

  it('rejects bad values', () => {
    expect(() =>
      validateThemeConfig({ validate, themeConfig: { dbml: { toolbar: ['nope'] } } as never }),
    ).toThrow();
    expect(() =>
      validateThemeConfig({ validate, themeConfig: { dbml: { detailLevel: 'x' } } as never }),
    ).toThrow();
    expect(() =>
      validateThemeConfig({ validate, themeConfig: { dbml: { height: -1 } } as never }),
    ).toThrow();
    expect(() =>
      validateThemeConfig({ validate, themeConfig: { dbml: { palette: 'infima' } } as never }),
    ).toThrow();
  });

  it("follows the site's colours by default", () => {
    const out = validateThemeConfig({ validate, themeConfig: {} as never });
    expect(out.dbml.palette).toBe('site');
  });
});

describe('pluginRelvista', () => {
  const plugin = pluginRelvista({ siteDir: '/site' } as LoadContext);

  it('names its theme component paths and client modules', () => {
    expect(plugin.name).toBe('relvista-docusaurus-plugin');
    expect(plugin.getThemePath?.()).toMatch(/src[/\\]theme$|lib[/\\]theme$/);
    expect(plugin.getTypeScriptThemePath?.()).toMatch(/src[/\\]theme$/);
    const modules = plugin.getClientModules?.() ?? [];
    expect(modules.some((m) => m.endsWith('styles.css'))).toBe(true);
    expect(modules.some((m) => /prism-dbml\.js$/.test(m))).toBe(true);
    // The site palette overrides the renderer's palettes and the static layer's dark palette, so
    // it loads after them.
    const site = modules.findIndex((m) => /site-palette\.css$/.test(m));
    const statik = modules.findIndex((m) => /client[/\\]static\.css$/.test(m));
    expect(statik).toBeGreaterThan(modules.findIndex((m) => m.endsWith('styles.css')));
    expect(site).toBeGreaterThan(statik);
    expect(
      pluginRelvista({ siteDir: '/s' } as LoadContext, { highlight: false }).getClientModules?.(),
    ).toHaveLength(3);
  });

  it('loads .dbml files as source text', () => {
    const config = plugin.configureWebpack?.({} as never, false, {} as never, {} as never) as {
      module: { rules: Array<{ test: RegExp; type: string }> };
    };
    const rule = config.module.rules[0]!;
    expect(rule.type).toBe('asset/source');
    expect(rule.test.test('schema.dbml')).toBe(true);
    expect(rule.test.test('schema.dbml.layout.json')).toBe(false);
  });

  it('emits the ELK worker as an asset URL', () => {
    const config = plugin.configureWebpack?.({} as never, false, {} as never, {} as never) as {
      module: { rules: Array<{ resourceQuery?: RegExp; type: string }> };
    };
    const rule = config.module.rules.find((r) => r.resourceQuery)!;
    expect(rule.type).toBe('asset/resource');
    expect(rule.resourceQuery!.test('?relvista-worker')).toBe(true);
  });

  it('puts the theme code shared by page chunks into one chunk (client only)', () => {
    type Group = {
      name: string;
      chunks: string;
      minChunks: number;
      minSize: number;
      priority: number;
      test(m: { resource?: string }): boolean;
    };
    type Cfg = { optimization?: { splitChunks: { cacheGroups: Record<string, Group> } } };
    const client = plugin.configureWebpack?.({} as never, false, {} as never, {} as never) as Cfg;
    const group = client.optimization!.splitChunks.cacheGroups.relvistaTheme!;
    expect(group).toMatchObject({ name: 'relvista-theme', chunks: 'async', minChunks: 2 });
    expect(group.minSize).toBe(0);
    // Between Docusaurus' `common` (40) and `styles` (50) groups.
    expect(group.priority).toBeGreaterThan(40);
    expect(group.priority).toBeLessThan(50);
    const lib = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
    const theme = join(lib, 'theme', 'DbmlDiagram', 'index.js');
    // The test runs from src/ (the plugin's own directory): its modules match, others do not.
    expect(group.test({ resource: theme })).toBe(true);
    expect(group.test({ resource: `${lib}-other${sep}theme.js` })).toBe(false);
    expect(group.test({ resource: '/x/node_modules/react/index.js' })).toBe(false);
    expect(group.test({})).toBe(false);
    const context = {
      siteDir: '/site',
      generatedFilesDir: mkdtempSync(join(tmpdir(), 'relvista-gen-')),
      baseUrl: '/',
      siteConfig: { staticDirectories: ['static'] },
    } as unknown as LoadContext;
    const server = pluginRelvista(context).configureWebpack?.(
      {} as never,
      true,
      {} as never,
      {} as never,
    ) as Cfg;
    expect(server.optimization).toBeUndefined();
  });

  it('aliases relvista-ssr-files: a generated server module, a client stub', () => {
    const generatedFilesDir = mkdtempSync(join(tmpdir(), 'relvista-gen-'));
    const context = {
      siteDir: '/site',
      generatedFilesDir,
      baseUrl: '/docs/',
      siteConfig: { staticDirectories: ['static', 'public'] },
    } as unknown as LoadContext;
    type Resolve = { resolve: { alias: Record<string, string | false> } };
    const p = pluginRelvista(context);
    const client = p.configureWebpack?.({} as never, false, {} as never, {} as never) as Resolve;
    expect(client.resolve.alias['relvista-ssr-files$']).toMatch(/ssr[/\\]client\.js$/);
    const server = p.configureWebpack?.({} as never, true, {} as never, {} as never) as Resolve;
    const file = server.resolve.alias['relvista-ssr-files$'] as string;
    expect(file.startsWith(generatedFilesDir)).toBe(true);
    const code = readFileSync(file, 'utf8');
    expect(code).toMatch(/import \{ createSsrBackend \} from ".*ssr[/\\]+server\.js";/);
    expect(code).toContain('"staticDirectories":["static","public"]');
    expect(code).toContain('"baseUrl":"/docs/"');
    expect(code).toContain('"siteDir":"/site"');
  });

  it("never bundles jsPDF's optional dependencies, and only drops them for jsPDF", () => {
    const config = plugin.configureWebpack?.({} as never, false, {} as never, {} as never) as {
      module: { rules: Array<{ test?: RegExp; resolve?: { alias: Record<string, unknown> } }> };
      resolve: { alias: Record<string, unknown> };
    };
    const rule = config.module.rules.find((r) => r.resolve)!;
    expect(rule.test!.test('/x/node_modules/jspdf/dist/jspdf.es.min.js')).toBe(true);
    expect(rule.test!.test('/x/node_modules/mermaid/dist/mermaid.js')).toBe(false);
    for (const name of ['html2canvas', 'canvg', 'dompurify']) {
      expect(rule.resolve!.alias[name]).toBe(false);
      // Mermaid and other plugins use DOMPurify: never aliased site-wide.
      expect(config.resolve.alias[name]).toBeUndefined();
    }
  });

  it('watches .dbml files in the site', () => {
    expect(plugin.getPathsToWatch?.()).toContain('/site/**/*.dbml');
  });
});

describe('registrationProblem', () => {
  const classic = '@docusaurus/theme-classic';
  const relvista = '@relvista/docusaurus-plugin';

  it('accepts the recommended registrations', () => {
    // preset-classic: its theme is not in siteConfig.themes and always loads first.
    expect(registrationProblem({ plugins: [relvista], themes: [] })).toBeNull();
    expect(
      registrationProblem({ plugins: [[relvista, { highlight: false }]], themes: [] }),
    ).toBeNull();
    expect(registrationProblem({ plugins: [], themes: [relvista] })).toBeNull();
    expect(registrationProblem({ plugins: [], themes: [classic, relvista] })).toBeNull();
    expect(registrationProblem({ plugins: [], themes: ['classic', [relvista, {}]] })).toBeNull();
    expect(registrationProblem(undefined)).toBeNull();
  });

  it('flags a classic theme in `themes` that would replace the MDX code wrapper', () => {
    expect(registrationProblem({ plugins: [relvista], themes: [classic] })).toMatch(
      /render as code/,
    );
    expect(registrationProblem({ plugins: ['@relvista'], themes: ['classic'] })).not.toBeNull();
    expect(
      registrationProblem({ plugins: [pluginRelvista as never], themes: [classic] }),
    ).not.toBeNull();
    expect(registrationProblem({ plugins: [], themes: [relvista, classic] })).not.toBeNull();
    expect(
      registrationProblem({
        plugins: [relvista],
        themes: ['/x/node_modules/@docusaurus/theme-classic/lib/index.js'],
      }),
    ).not.toBeNull();
  });
});
