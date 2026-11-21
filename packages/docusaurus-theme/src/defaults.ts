import type { DetailLevel } from '@relvista/core';
import type { ToolbarItem } from '@relvista/renderer';

// Browser-safe: imported by theme components, so no Node-only dependencies here.

/** `themeConfig.dbml` in docusaurus.config: site-wide defaults for every diagram. */
export interface DbmlThemeConfig {
  /** Default viewer height (number = px, or any CSS length). Default 480. */
  height: number | string;
  /** Toolbar buttons, in order. Default: every button. */
  toolbar: ToolbarItem[];
  /**
   * Base URL of the relvista editor for the "Open in editor" button. Defaults to the hosted editor
   * ({@link DEFAULT_EDITOR_URL}); `false` hides the button.
   */
  editorUrl: string | false;
  /** Default detail level: every column, keys only, or table names only. Default `all`. */
  detailLevel: DetailLevel;
}

export interface ThemeConfig {
  dbml: DbmlThemeConfig;
}

/**
 * The hosted editor. Same value as `DEFAULT_EDITOR_URL` in `@relvista/renderer` (a test keeps them
 * equal); repeated here so config validation in Node never loads the renderer.
 */
export const DEFAULT_EDITOR_URL = 'https://uncovered-songs.github.io/relvista/editor/';

export const TOOLBAR_ITEMS: readonly ToolbarItem[] = [
  'view',
  'zoom',
  'fit',
  'fullscreen',
  'export',
  'print',
  'open-in-editor',
];

export const DEFAULT_THEME_CONFIG: ThemeConfig = {
  dbml: {
    height: 480,
    toolbar: [...TOOLBAR_ITEMS],
    editorUrl: DEFAULT_EDITOR_URL,
    detailLevel: 'all',
  },
};
