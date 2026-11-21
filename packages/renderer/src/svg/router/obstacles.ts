/**
 * Obstacle index of the orthogonal router (docs/design/phase3-v1.md §4.1): the boxes a ref line
 * must not run under (tables, sticky notes, collapsed groups) and the expanded group borders it
 * should not run along.
 */
import type { Box, DiagramGeometry } from '@relvista/core';

/** Clearance (px) kept between a routed line and the boxes it passes. */
export const MARGIN = 12;
/** Routes running within this distance of an expanded group's border pay a cost penalty. */
export const GROUP_BAND = 6;

export interface XY {
  x: number;
  y: number;
}

/** Axis-aligned rectangle by its corners (x0 < x1, y0 < y1). */
export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface Obstacle extends Rect {
  /** Node id (table, `note:<name>`) or `group:<name>` for a collapsed group. */
  id: string;
  /** The box itself, not inflated. */
  box: Rect;
}

export interface GroupRect extends Rect {
  id: string;
}

export interface ObstacleIndex {
  /** Inflated by MARGIN, sorted by id. */
  obstacles: Obstacle[];
  /** Expanded (not collapsed) group boxes, sorted by id. */
  groups: GroupRect[];
  /** Union of every obstacle and group, or null for an empty diagram. */
  bounds: Rect | null;
}

export function rectOf(b: Box, pad = 0): Rect {
  return { x0: b.x - pad, y0: b.y - pad, x1: b.x + b.width + pad, y1: b.y + b.height + pad };
}

export function inflate(r: Rect, pad: number): Rect {
  return { x0: r.x0 - pad, y0: r.y0 - pad, x1: r.x1 + pad, y1: r.y1 + pad };
}

/** Closed intersection (touching counts). */
export function touches(a: Rect, b: Rect): boolean {
  return a.x0 <= b.x1 && b.x0 <= a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1;
}

/** The point lies strictly inside the rectangle. */
export function containsOpen(r: Rect, p: XY): boolean {
  return p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1;
}

export function union(a: Rect, b: Rect): Rect {
  return {
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  };
}

function finiteBox(b: Box): boolean {
  return (
    Number.isFinite(b.x) &&
    Number.isFinite(b.y) &&
    Number.isFinite(b.width) &&
    Number.isFinite(b.height) &&
    b.width >= 0 &&
    b.height >= 0
  );
}

const byId = <T extends { id: string }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Every display node of `geometry` as an obstacle, plus the expanded group borders. */
export function buildObstacleIndex(geometry: DiagramGeometry): ObstacleIndex {
  const obstacles: Obstacle[] = [];
  for (const [id, n] of Object.entries(geometry.nodes)) {
    if (!finiteBox(n)) continue;
    const box = rectOf(n);
    obstacles.push({ id, box, ...inflate(box, MARGIN) });
  }
  const groups: GroupRect[] = [];
  for (const [id, g] of Object.entries(geometry.groups)) {
    if (!finiteBox(g)) continue;
    const box = rectOf(g);
    if (g.collapsed) obstacles.push({ id, box, ...inflate(box, MARGIN) });
    else groups.push({ id, ...box });
  }
  obstacles.sort(byId);
  groups.sort(byId);
  let bounds: Rect | null = null;
  for (const r of [...obstacles, ...groups]) bounds = bounds ? union(bounds, r) : { ...r };
  return { obstacles, groups, bounds };
}
