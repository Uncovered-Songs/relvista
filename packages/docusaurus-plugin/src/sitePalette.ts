// Browser-safe: the colours of the site palette that need contrast maths (see client/site-palette.css).
import type * as Renderer from '@relvista/renderer';

/** `--rv-canvas-bg` of the site palette; keep in sync with client/site-palette.css. */
export const SITE_CANVAS_BG =
  'color-mix(in srgb, var(--ifm-color-emphasis-100) 70%, var(--ifm-background-surface-color))';

/** Inline custom properties for the viewer: the computed header band and accent. */
export type SiteAccents = Record<
  '--rv-site-header-bg' | '--rv-site-header-text' | '--rv-site-accent',
  string
>;

type Helpers = Pick<
  typeof Renderer,
  'resolveColors' | 'parseHex' | 'contrastRatio' | 'withContrast' | 'toHex' | 'mix'
>;

const WHITE = { r: 255, g: 255, b: 255 };
const DARK_TEXT = '#1b2230';

/**
 * The table header band and the accent (selection, highlighted refs, focus ring) from the site's
 * primary colour family, as shown inside `el` in colour mode `mode`:
 *
 * - header, light mode: the first of `--ifm-color-primary`, `-dark`, `-darker`, `-darkest` that
 *   carries white text at 4.5:1; else a very light primary (yellow, say) with dark text; else the
 *   primary darkened until white text reads at 4.5:1;
 * - header, dark mode: the primary toned down towards the canvas (dark-mode primaries are bright,
 *   and a neon band glares on a dark page), darkened further if white text needs it;
 * - accent: the primary, lightened or darkened until it stands out 3:1 from the canvas.
 *
 * Null when the site's colours cannot be read (no Infima variables).
 */
export function siteAccents(el: Element, mode: 'light' | 'dark', h: Helpers): SiteAccents | null {
  const names = ['', '-dark', '-darker', '-darkest'].map((s) => `var(--ifm-color-primary${s})`);
  const resolved = h.resolveColors(el, [...names, SITE_CANVAS_BG]);
  const family = resolved.slice(0, 4).map((c) => h.parseHex(c));
  const primary = family[0];
  const canvas = h.parseHex(resolved[4]);
  if (!primary) return null;

  let headerBg: string | null = null;
  let headerText = '#ffffff';
  if (mode === 'dark') {
    const toned = canvas ? h.mix(primary, canvas, 0.35) : primary;
    headerBg = h.toHex(h.withContrast(toned, WHITE, 4.5));
  } else {
    for (const c of family) {
      if (c && h.contrastRatio(c, WHITE) >= 4.5) {
        headerBg = h.toHex(c);
        break;
      }
    }
    if (!headerBg && h.contrastRatio(primary, WHITE) < 2) {
      headerBg = h.toHex(primary);
      headerText = DARK_TEXT;
    }
    headerBg ??= h.toHex(h.withContrast(primary, WHITE, 4.5));
  }

  const accent = canvas ? h.withContrast(primary, canvas, 3) : primary;
  return {
    '--rv-site-header-bg': headerBg,
    '--rv-site-header-text': headerText,
    '--rv-site-accent': h.toHex(accent),
  };
}
