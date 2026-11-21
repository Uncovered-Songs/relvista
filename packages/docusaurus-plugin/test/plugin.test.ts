import { describe, expect, it } from 'vitest';
import type { Joi } from '@docusaurus/utils-validation';
import type { LoadContext } from '@docusaurus/types';
import { DEFAULT_EDITOR_URL as RENDERER_EDITOR_URL } from '@relvista/renderer';
import pluginRelvista, {
  DEFAULT_THEME_CONFIG,
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
    // The site palette overrides the renderer's palettes, so it loads after them.
    const site = modules.findIndex((m) => /site-palette\.css$/.test(m));
    expect(site).toBeGreaterThan(modules.findIndex((m) => m.endsWith('styles.css')));
    expect(
      pluginRelvista({ siteDir: '/s' } as LoadContext, { highlight: false }).getClientModules?.(),
    ).toHaveLength(2);
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
