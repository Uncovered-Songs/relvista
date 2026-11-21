/**
 * Where a new sticky note goes (design phase3 §6.4): at the requested point when the note's box
 * is free there, else at the nearest free spot (tables are drawn above notes, so a note placed
 * under a table could not be clicked). Pure; diagram coordinates.
 */
import type { Box, DiagramGeometry } from '@relvista/core';

/** Room kept between a new note and the boxes around it. */
export const NOTE_GAP = 16;

const overlaps = (a: Box, b: Box, gap: number) =>
  a.x < b.x + b.width + gap &&
  b.x < a.x + a.width + gap &&
  a.y < b.y + b.height + gap &&
  b.y < a.y + a.height + gap;

/** Boxes a new note must not cover: every drawn node and collapsed group card. */
export function obstaclesOf(geometry: DiagramGeometry | null): Box[] {
  if (!geometry) return [];
  return [
    ...Object.values(geometry.nodes),
    ...Object.values(geometry.groups).filter((g) => g.collapsed),
  ];
}

/**
 * The top-left for a `size` box: `want` when free, else the nearest free point on a grid of
 * `step` around it (rings outwards), preferring points inside `within` (the visible part of the
 * diagram). Falls back to `want`.
 */
export function freeSpot(
  want: { x: number; y: number },
  size: { width: number; height: number },
  obstacles: readonly Box[],
  within: Box | null = null,
  step = 24,
  maxRings = 40,
): { x: number; y: number } {
  const free = (x: number, y: number) =>
    !obstacles.some((o) => overlaps({ x, y, ...size }, o, NOTE_GAP));
  const inside = (x: number, y: number) =>
    !within ||
    (x >= within.x &&
      y >= within.y &&
      x + size.width <= within.x + within.width &&
      y + size.height <= within.y + within.height);
  if (free(want.x, want.y)) return want;
  let fallback: { x: number; y: number } | null = null;
  for (let r = 1; r <= maxRings; r++) {
    let best: { x: number; y: number; d: number } | null = null;
    for (let i = -r; i <= r; i++) {
      for (const [dx, dy] of [
        [i, -r],
        [i, r],
        [-r, i],
        [r, i],
      ] as const) {
        const x = want.x + dx * step;
        const y = want.y + dy * step;
        if (!free(x, y)) continue;
        const d = dx * dx + dy * dy;
        if (inside(x, y)) {
          if (!best || d < best.d) best = { x, y, d };
        } else fallback ??= { x, y };
      }
    }
    if (best) return { x: best.x, y: best.y };
  }
  return fallback ?? want;
}
