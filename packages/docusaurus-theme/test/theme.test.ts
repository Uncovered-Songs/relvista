import { describe, expect, it } from 'vitest';
import type { Joi } from '@docusaurus/utils-validation';
import type { LoadContext } from '@docusaurus/types';
import themeRelvista, {
  DEFAULT_THEME_CONFIG,
  parseDbmlMeta,
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
    };
    expect(validateThemeConfig({ validate, themeConfig: { dbml } as never })).toEqual({ dbml });
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
  });
});

describe('themeRelvista', () => {
  const plugin = themeRelvista({ siteDir: '/site' } as LoadContext);

  it('names its theme paths and client modules', () => {
    expect(plugin.name).toBe('relvista-docusaurus-theme');
    expect(plugin.getThemePath?.()).toMatch(/src[/\\]theme$|lib[/\\]theme$/);
    expect(plugin.getTypeScriptThemePath?.()).toMatch(/src[/\\]theme$/);
    const modules = plugin.getClientModules?.() ?? [];
    expect(modules.some((m) => m.endsWith('styles.css'))).toBe(true);
    expect(modules.some((m) => /prism-dbml\.js$/.test(m))).toBe(true);
    expect(
      themeRelvista({ siteDir: '/s' } as LoadContext, { highlight: false }).getClientModules?.(),
    ).toHaveLength(1);
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
