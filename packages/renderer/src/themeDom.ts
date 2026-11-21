/**
 * Reading the colours a page actually shows (browser only, called from effects and event handlers;
 * nothing runs at import time). The `--rv-*` variables can come from relvista's palettes, a host's
 * palette (the Docusaurus plugin maps them to the site's Infima colours) or the page's own CSS;
 * exports and colour maths need them as literal colours.
 */
import { PALETTES, cssVarName, toHex, type ColorMode, type PaletteKey } from './theme.js';
import type { PaletteOverrides } from './theme.js';

/** `rgb(…)`, `rgba(…)` or `color(srgb …)` as computed by the browser → `#rrggbb` or `rgba(…)`. */
export function normalizeComputedColor(value: string): string | null {
  const v = value.trim();
  let r: number, g: number, b: number;
  let a = 1;
  const rgb =
    /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)$/i.exec(v);
  const srgb =
    /^color\(\s*srgb\s+([\d.e-]+)\s+([\d.e-]+)\s+([\d.e-]+)\s*(?:\/\s*([\d.]+)(%?)\s*)?\)$/i.exec(
      v,
    );
  if (rgb) {
    [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    if (rgb[4] !== undefined) a = Number(rgb[4]) / (rgb[5] ? 100 : 1);
  } else if (srgb) {
    [r, g, b] = [Number(srgb[1]) * 255, Number(srgb[2]) * 255, Number(srgb[3]) * 255];
    if (srgb[4] !== undefined) a = Number(srgb[4]) / (srgb[5] ? 100 : 1);
  } else return null;
  if (![r, g, b, a].every(Number.isFinite)) return null;
  if (a >= 0.999) return toHex({ r, g, b });
  const ch = (n: number) => Math.round(Math.min(255, Math.max(0, n)));
  return `rgba(${ch(r)}, ${ch(g)}, ${ch(b)}, ${Math.round(a * 1000) / 1000})`;
}

/**
 * Resolves CSS colour values (anything `color` accepts, `var()` and `color-mix()` included) as the
 * browser computes them inside `el`. Unresolvable values map to null.
 */
export function resolveColors(el: Element, values: readonly string[]): (string | null)[] {
  if (typeof getComputedStyle !== 'function') return values.map(() => null);
  const probe = el.ownerDocument.createElement('span');
  probe.style.display = 'none';
  el.appendChild(probe);
  try {
    return values.map((value) => {
      probe.style.color = '';
      probe.style.color = value;
      if (!probe.style.color) return null;
      return normalizeComputedColor(getComputedStyle(probe).color);
    });
  } finally {
    probe.remove();
  }
}

/**
 * The palette shown inside `el` (a viewer or canvas), as literal colours and font stacks: what
 * exports need to match the page. Keys the page does not set keep the `mode` palette's values.
 */
export function resolvePalette(
  el: Element,
  mode: ColorMode,
  keys: readonly PaletteKey[] = Object.keys(PALETTES[mode]) as PaletteKey[],
): PaletteOverrides {
  const out: PaletteOverrides = {};
  if (typeof getComputedStyle !== 'function') return out;
  const style = getComputedStyle(el);
  // Only variables the page defines: an undefined `var()` would compute to the inherited colour.
  const set = keys
    .map((k) => [k, style.getPropertyValue(cssVarName(k)).trim()] as const)
    .filter(([, raw]) => raw !== '');
  const colors = resolveColors(
    el,
    set.map(([, raw]) => raw),
  );
  set.forEach(([k], i) => {
    const c = colors[i];
    if (c) out[k] = c;
  });
  const font = style.getPropertyValue('--rv-font').trim();
  const mono = style.getPropertyValue('--rv-mono').trim();
  if (font && !/[<>{};]/.test(font)) out.font = font;
  if (mono && !/[<>{};]/.test(mono)) out.mono = mono;
  return out;
}
