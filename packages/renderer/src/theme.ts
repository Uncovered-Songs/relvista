/**
 * Colour palettes. Every colour the renderer draws is a `--rv-*` CSS variable; `styles.css` defines
 * the same values (keep both in sync, `test/theme.test.ts` checks it). Inline `var(--rv-x, fallback)`
 * fallbacks come from here, so a bare `<DiagramSvg>` or an exported SVG looks right without the CSS.
 */
export type ColorMode = 'light' | 'dark';

export interface Palette {
  canvasBg: string;
  gridDot: string;
  tableBg: string;
  tableBorder: string;
  tableShadow: string;
  headerBg: string;
  headerText: string;
  rowText: string;
  typeText: string;
  rowDivider: string;
  rowHighlight: string;
  pkMarker: string;
  fkMarker: string;
  badgeBg: string;
  badgeText: string;
  noteIndicator: string;
  refStroke: string;
  refHighlight: string;
  groupDefault: string;
  noteBg: string;
  noteBorder: string;
  noteText: string;
  selection: string;
}

export const PALETTES: Record<ColorMode, Palette> = {
  light: {
    canvasBg: '#f6f7f9',
    gridDot: '#d3d8e0',
    tableBg: '#ffffff',
    tableBorder: '#d6dbe3',
    tableShadow: 'rgba(16, 24, 40, 0.10)',
    headerBg: '#3d5a80',
    headerText: '#ffffff',
    rowText: '#1f2633',
    typeText: '#7b8598',
    rowDivider: '#eef0f4',
    rowHighlight: '#eaf1ff',
    pkMarker: '#c99a06',
    fkMarker: '#6b7a90',
    badgeBg: '#eef0f4',
    badgeText: '#7b8598',
    noteIndicator: '#e0a526',
    refStroke: '#8c97a8',
    refHighlight: '#2f6fed',
    groupDefault: '#64748b',
    noteBg: '#fff7cc',
    noteBorder: '#ecd77a',
    noteText: '#4a4022',
    selection: '#2f6fed',
  },
  dark: {
    canvasBg: '#0f1217',
    gridDot: '#2a2f39',
    tableBg: '#1a1f28',
    tableBorder: '#343b48',
    tableShadow: 'rgba(0, 0, 0, 0.45)',
    headerBg: '#2f4a6e',
    headerText: '#f4f6fa',
    rowText: '#e4e8ef',
    typeText: '#8d98ab',
    rowDivider: '#252b36',
    rowHighlight: '#1f2d45',
    pkMarker: '#e6b836',
    fkMarker: '#9aa6b8',
    badgeBg: '#262d39',
    badgeText: '#97a2b4',
    noteIndicator: '#e6b836',
    refStroke: '#6c7789',
    refHighlight: '#5b9bff',
    groupDefault: '#8391a7',
    noteBg: '#3b3420',
    noteBorder: '#5e5130',
    noteText: '#efe4bf',
    selection: '#5b9bff',
  },
};

export type PaletteKey = keyof Palette;

/** `canvasBg` → `--rv-canvas-bg`. */
export function cssVarName(key: PaletteKey): string {
  return `--rv-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** CSS declarations (`--rv-x: value;`) for one palette. */
export function paletteCss(mode: ColorMode): string {
  return (Object.keys(PALETTES[mode]) as PaletteKey[])
    .map((k) => `${cssVarName(k)}: ${PALETTES[mode][k]};`)
    .join(' ');
}

/**
 * How components spell colours: `var(--rv-x, fallback)` (default, themable by CSS) or the literal
 * value (standalone export, readable by tools without CSS variable support).
 */
export interface ColorResolver {
  mode: ColorMode;
  c(key: PaletteKey): string;
}

export function colorResolver(mode: ColorMode, literal = false): ColorResolver {
  const p = PALETTES[mode];
  return {
    mode,
    c: literal ? (k) => p[k] : (k) => `var(${cssVarName(k)}, ${p[k]})`,
  };
}

// ---------------------------------------------------------------------------------------------
// Small colour helpers for user colours (headerColor, group/note/ref colours).

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Parses `#rgb`, `#rrggbb` (and ignores alpha in `#rrggbbaa`). Returns null for anything else. */
export function parseHex(color: string | null | undefined): Rgb | null {
  if (!color) return null;
  const m = /^#([0-9a-f]{3,8})$/i.exec(color.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Linear mix of two colours, t = 0 → a, t = 1 → b. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** Readable text colour on top of `bg`: near-white on dark colours, near-black on light ones. */
export function contrastText(bg: Rgb): string {
  return relativeLuminance(bg) > 0.45 ? '#1b2230' : '#ffffff';
}

/** A user colour, validated: hex as given, CSS colour names and functions passed through. */
export function safeColor(color: string | null | undefined): string | null {
  if (!color) return null;
  const c = color.trim();
  if (parseHex(c)) return c;
  if (/^[a-z]{3,20}$/i.test(c)) return c;
  if (/^(rgb|rgba|hsl|hsla)\([\d\s.,%/-]+\)$/i.test(c)) return c;
  return null;
}
