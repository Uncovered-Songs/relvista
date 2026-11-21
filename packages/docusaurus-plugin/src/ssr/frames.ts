// Browser-safe. The static picture's frame for every box width (docs/design/phase3-v1.md §5.1):
// the interactive viewer's first view (`viewerFirstView` of @relvista/renderer) is computed at
// build time for the widths a box can have, and written as container-query rules that place the
// SVG where the viewer will put the diagram. The swap to the canvas then does not move, also for
// diagrams too big to fit (the viewer opens them at a readable zoom on their densest window) and
// on phones.
import type { DiagramGeometry, DiagramModel } from '@relvista/core';
import { viewerFirstView, type ViewerFirstView } from '@relvista/renderer';

/** Box widths (px) the rules cover; wider boxes use the rule of the widest. */
export const FRAME_MIN_WIDTH = 240;
export const FRAME_MAX_WIDTH = 1920;
/** Sampling step (px); a change between two samples is bisected to the exact pixel. */
const STEP = 16;

export interface FrameInput {
  geometry: DiagramGeometry;
  model: DiagramModel;
  /** The diagram's height prop (px). Other heights (CSS lengths) keep the plain CSS fit. */
  height: number;
  title: boolean;
  /** The viewer shows its chips row (a diff's legend). */
  chips: boolean;
  minimap: 'auto' | false;
}

const num = (n: number): string => String(Math.round(n * 1000) / 1000);

type ViewAt = (width: number) => ViewerFirstView;

/** The viewer's first view for a box `width` px wide. */
function viewAt(input: FrameInput): ViewAt {
  const cache = new Map<number, ViewerFirstView>();
  return (width) => {
    let v = cache.get(width);
    if (!v) {
      v = viewerFirstView({
        geometry: input.geometry,
        model: input.model,
        width,
        height: input.height,
        title: input.title,
        chips: input.chips,
        minimap: input.minimap,
      });
      cache.set(width, v);
    }
    return v;
  };
}

/** The window along one axis: its start, or its end, stays put as the box grows (null: centred). */
type Anchor = { start: number } | { end: number } | null;

function anchorOf(now: number | null, next: number | null, size: number, nextSize: number): Anchor {
  if (now === null) return null;
  if (next === null || Math.abs(next - now) < 1e-6) return { start: now };
  // A window that ends at a table's (or the diagram's) far edge: its start moves with the box.
  if (Math.abs(next + nextSize - (now + size)) < 1e-6) return { end: now + size };
  return { start: now };
}

/**
 * CSS declarations (on the SVG and the grid, see client/static.css) placing the diagram as the
 * viewer's first view does in a box `width` px wide: `--rv-sw` (its width on screen), `--rv-left`
 * and `--rv-top` (where its bounds start), as expressions of the box's size (`cq` units) wherever
 * the viewer's rule depends on it continuously, so one rule holds for a whole range of widths.
 */
export function frameDeclarations(
  input: FrameInput,
  width: number,
  view: ViewAt = viewAt(input),
): string | null {
  const f = view(width);
  const d = f.detail;
  const b = input.geometry.bounds;
  if (!d || !(b.width > 0 && b.height > 0)) return null;
  const p = f.padding;
  const z = d.viewport.zoom;
  // The window's world size along each axis, here and one pixel wider (where the rule is the same).
  const g = view(width + 1);
  const win = (v: ViewerFirstView) => ({
    w: (v.canvas.width - v.padding.left - v.padding.right) / (v.detail?.viewport.zoom ?? z),
    h: (v.canvas.height - v.padding.top - v.padding.bottom) / (v.detail?.viewport.zoom ?? z),
  });
  const [a, c] = [win(f), win(g)];
  const ax = anchorOf(d.startX, g.detail?.startX ?? null, a.w, c.w);
  const ay = anchorOf(d.startY, g.detail?.startY ?? null, a.h, c.h);
  // The fit keeps room for a minimap that is always shown; the windowed first view does not.
  const bottom = d.zoom === 'fit' ? f.fitPadding.bottom : p.bottom;
  const ratio = num(b.width / b.height);
  const sw =
    d.zoom === 'fit'
      ? `min(100cqw - ${num(p.left + p.right)}px, (100cqh - ${num(p.top + bottom)}px) * ${ratio}, ${num(b.width * 1.15)}px)`
      : d.zoom === 'fill-x'
        ? `calc(100cqw - ${num(p.left + p.right)}px)`
        : d.zoom === 'fill-y'
          ? `calc((100cqh - ${num(p.top + p.bottom)}px) * ${ratio})`
          : `${num(b.width * z)}px`;
  const sh = `(var(--rv-sw) * ${num(b.height / b.width)})`;
  /** Screen offset of diagram coordinate `v` from the bounds' start, along x or y. */
  const along = (v: number, origin: number) =>
    `${num(v - origin)} * var(--rv-sw) / ${num(b.width)}`;
  const left =
    ax === null
      ? `clamp(${num(p.left)}px, (100cqw - var(--rv-sw)) / 2, 100cqw - ${num(p.right)}px - var(--rv-sw))`
      : 'start' in ax
        ? `calc(${num(p.left)}px - ${along(ax.start, b.x)})`
        : `calc(100cqw - ${num(p.right)}px - ${along(ax.end, b.x)})`;
  const top =
    ay === null
      ? `clamp(${num(p.top)}px, (100cqh - ${sh}) / 2, 100cqh - ${num(bottom)}px - ${sh})`
      : 'start' in ay
        ? `calc(${num(p.top)}px - ${along(ay.start, b.y)})`
        : `calc(100cqh - ${num(p.bottom)}px - ${along(ay.end, b.y)})`;
  return `--rv-sw:${sw};--rv-left:${left};--rv-top:${top}`;
}

/** One rule per range of box widths [from, to) with the same declarations. */
export interface FrameRange {
  from: number;
  /** Exclusive; null for "and wider". */
  to: number | null;
  css: string | null;
}

/** The declarations for every box width, as ranges of widths sharing them. */
export function frameRanges(input: FrameInput): FrameRange[] {
  const view = viewAt(input);
  const at = new Map<number, string | null>();
  const css = (w: number) => {
    if (!at.has(w)) at.set(w, frameDeclarations(input, w, view));
    return at.get(w)!;
  };
  const samples: number[] = [];
  for (let w = FRAME_MIN_WIDTH; w < FRAME_MAX_WIDTH; w += STEP) samples.push(w);
  samples.push(FRAME_MAX_WIDTH);
  const ranges: FrameRange[] = [];
  let from = FRAME_MIN_WIDTH;
  for (let i = 1; i < samples.length; i++) {
    let lo = samples[i - 1]!;
    const hi = samples[i]!;
    // Several changes inside one step are found one after the other.
    while (css(lo) !== css(hi)) {
      // Bisect to the first width after `lo` whose rule differs from `lo`'s.
      let a = lo;
      let z = hi;
      while (z - a > 1) {
        const m = Math.floor((a + z) / 2);
        if (css(m) === css(a)) a = m;
        else z = m;
      }
      ranges.push({ from, to: z, css: css(a) });
      from = z;
      lo = z;
    }
  }
  ranges.push({ from, to: null, css: css(FRAME_MAX_WIDTH) });
  ranges[0]!.from = 0;
  return ranges;
}

/**
 * The `<style>` text framing the static box `data-rv-frame="<id>"` like the viewer's first view at
 * every width (empty when the height is not a pixel number).
 */
export function frameStyle(id: string, input: FrameInput): string {
  const sel = `.relvista-static-box[data-rv-frame="${id}"]>`;
  const target = `${sel}svg.rv-diagram,${sel}.relvista-static-grid`;
  let out = '';
  for (const r of frameRanges(input)) {
    if (!r.css) continue;
    const cond =
      r.from <= 0 && r.to === null
        ? null
        : r.from <= 0
          ? `(width < ${r.to}px)`
          : r.to === null
            ? `(width >= ${r.from}px)`
            : `(${r.from}px <= width < ${r.to}px)`;
    out += cond ? `@container rv-ssr ${cond}{${target}{${r.css}}}` : `${target}{${r.css}}`;
  }
  return out;
}
