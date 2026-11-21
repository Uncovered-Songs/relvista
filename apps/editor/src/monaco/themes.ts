/**
 * Monaco themes matching the renderer palette. Token colours follow design §4.6, except the light
 * comment colour: the specified #7b8598 is 3.7:1 on white, so it uses the UI muted grey #6b7486
 * (4.7:1). `test/themes.test.ts` checks every colour is ≥ 4.5:1 on its background.
 */
import type * as Monaco from 'monaco-editor/editor/editor.api';

export type ThemeMode = 'light' | 'dark';

export const MONACO_THEME: Record<ThemeMode, string> = {
  light: 'relvista-light',
  dark: 'relvista-dark',
};

export interface TokenColors {
  background: string;
  foreground: string;
  keyword: string;
  string: string;
  comment: string;
  number: string;
  operator: string;
  muted: string;
  lineHighlight: string;
  selection: string;
  cursor: string;
}

export const TOKEN_COLORS: Record<ThemeMode, TokenColors> = {
  light: {
    background: '#ffffff',
    foreground: '#1f2633',
    keyword: '#2f6fed',
    string: '#0f7b6c',
    comment: '#6b7486',
    number: '#b45309',
    operator: '#c2410c',
    muted: '#6b7486',
    lineHighlight: '#f4f6fa',
    selection: '#d6e4ff',
    cursor: '#2f6fed',
  },
  dark: {
    background: '#1a1f28',
    foreground: '#e4e8ef',
    keyword: '#6f9bff',
    string: '#3cc7ae',
    comment: '#8d98ab',
    number: '#e6b836',
    operator: '#ff9e64',
    muted: '#98a2b3',
    lineHighlight: '#20262f',
    selection: '#2c3d5c',
    cursor: '#6f9bff',
  },
};

/** Colours that must reach 4.5:1 on the background (text drawn by tokens and line numbers). */
export const CONTRAST_CHECKED: Array<keyof TokenColors> = [
  'foreground',
  'keyword',
  'string',
  'comment',
  'number',
  'operator',
  'muted',
];

const hex = (c: string) => c.replace('#', '');

/** Editor chrome colours, copied from styles/tokens.css (--ed-*). */
export const UI_COLORS: Record<
  ThemeMode,
  Record<
    | 'accent'
    | 'accentSoft'
    | 'raised'
    | 'border'
    | 'hover'
    | 'thumb'
    | 'thumbHover'
    | 'thumbActive',
    string
  >
> = {
  light: {
    accent: '#2f6fed',
    accentSoft: '#eaf1ff',
    raised: '#ffffff',
    border: '#dde1e8',
    hover: '#eef1f5',
    thumb: '#1f263324',
    thumbHover: '#1f263340',
    thumbActive: '#1f263359',
  },
  dark: {
    accent: '#5b9bff',
    accentSoft: '#1f2d45',
    raised: '#212734',
    border: '#313846',
    hover: '#262d39',
    thumb: '#e4e8ef24',
    thumbHover: '#e4e8ef3d',
    thumbActive: '#e4e8ef54',
  },
};

export function themeData(mode: ThemeMode): Monaco.editor.IStandaloneThemeData {
  const c = TOKEN_COLORS[mode];
  const ui = UI_COLORS[mode];
  return {
    base: mode === 'dark' ? 'vs-dark' : 'vs',
    inherit: true,
    rules: [
      { token: '', foreground: hex(c.foreground) },
      { token: 'keyword.dbml', foreground: hex(c.keyword) },
      { token: 'keyword.wildcard.dbml', foreground: hex(c.operator) },
      { token: 'identifier.dbml', foreground: hex(c.foreground) },
      { token: 'string.dbml', foreground: hex(c.string) },
      { token: 'string.escape.dbml', foreground: hex(c.string), fontStyle: 'bold' },
      { token: 'string.escape.invalid.dbml', foreground: hex(c.operator) },
      { token: 'comment.dbml', foreground: hex(c.comment), fontStyle: 'italic' },
      { token: 'number.dbml', foreground: hex(c.number) },
      { token: 'number.hex.dbml', foreground: hex(c.number) },
      { token: 'operators.dbml', foreground: hex(c.operator) },
      { token: 'delimiter.dbml', foreground: hex(c.foreground) },
      { token: '@bracket.dbml', foreground: hex(c.foreground) },
    ],
    colors: {
      'editor.background': c.background,
      'editor.foreground': c.foreground,
      'editorLineNumber.foreground': c.muted,
      'editorLineNumber.activeForeground': c.foreground,
      'editor.lineHighlightBackground': c.lineHighlight,
      'editor.lineHighlightBorder': c.lineHighlight,
      'editor.selectionBackground': c.selection,
      'editorCursor.foreground': c.cursor,
      'editorGutter.background': c.background,
      'editorWidget.background': c.background,
      'editorStickyScroll.background': c.background,
      focusBorder: ui.accent,
      // Suggest list, hover and scrollbars in the app's own palette (--ed-* tokens), not vs/vs-dark.
      'editorSuggestWidget.background': ui.raised,
      'editorSuggestWidget.border': ui.border,
      'editorSuggestWidget.foreground': c.foreground,
      'editorSuggestWidget.selectedBackground': ui.accentSoft,
      'editorSuggestWidget.selectedForeground': c.foreground,
      'editorSuggestWidget.highlightForeground': ui.accent,
      'editorSuggestWidget.focusHighlightForeground': ui.accent,
      'list.activeSelectionBackground': ui.accentSoft,
      'list.activeSelectionForeground': c.foreground,
      'list.inactiveSelectionBackground': ui.hover,
      'list.hoverBackground': ui.hover,
      'list.highlightForeground': ui.accent,
      'list.focusOutline': '#00000000',
      'editorHoverWidget.background': ui.raised,
      'editorHoverWidget.border': ui.border,
      'editorHoverWidget.foreground': c.foreground,
      'editorWidget.border': ui.border,
      'scrollbarSlider.background': ui.thumb,
      'scrollbarSlider.hoverBackground': ui.thumbHover,
      'scrollbarSlider.activeBackground': ui.thumbActive,
      'scrollbar.shadow': '#00000000',
    },
  };
}

// --- contrast (WCAG 2.x) -------------------------------------------------------------------

function luminance(color: string): number {
  const h = hex(color);
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = ch.map((s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}

export function contrastRatio(a: string, b: string): number {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
