/**
 * PDF page planning (docs/design/phase3-v1.md §4.4): paper sizes, the tile grid, page frames,
 * headers, labels, cut/registration marks and the WinAnsi check. Pure and dependency-free: the
 * export dialog's preview and the tests use it without loading jsPDF.
 */
import type { Box, DiagramGeometry } from '@relvista/core';

/** Paper format of a PDF. */
export type PaperSize = 'a4' | 'letter';
/**
 * Page orientation of a PDF.
 *
 * @inline
 */
export type PdfOrientation = 'portrait' | 'landscape';

/** Portrait paper sizes in mm. */
export const PAPER_MM: Readonly<Record<PaperSize, { w: number; h: number }>> = {
  a4: { w: 210, h: 297 },
  letter: { w: 215.9, h: 279.4 },
};

/** Page margin on every side, mm. */
export const PAGE_MARGIN_MM = 10;
/** Height of the running header band between the top margin and the content, mm. */
export const HEADER_BAND_MM = 5;
/** Header font size, pt (grey Helvetica). */
export const HEADER_FONT_PT = 7;
/** Font size of mark and neighbour labels, pt. */
export const MARK_FONT_PT = 6;
/** Font size of the row / column labels in the overview page's margins, pt. */
export const OVERVIEW_FONT_PT = 7;
/** Space left of and above the overview drawing for its row letters and column numbers, mm. */
export const OVERVIEW_GUTTER_MM = 5;
/** Default print scale: diagram px → pt (1 px = 1/96 in, i.e. 100 %). */
export const DEFAULT_PDF_SCALE = 0.75;
/** Default overlap between neighbouring tiles, mm. */
export const DEFAULT_OVERLAP_MM = 10;
/** Largest document relvista writes. */
export const MAX_PDF_PAGES = 200;
/** 'pages' mode never enlarges a small diagram beyond this many pt per px (200 %). */
export const MAX_FIT_PT_PER_PX = 1.5;
/** Space around the diagram in the PDF, px. */
export const PDF_DIAGRAM_PADDING = 12;
/** Length of a crop tick, mm. */
export const TICK_MM = 4;
/** Radius of a registration mark, mm. */
export const REG_RADIUS_MM = 1.6;

const MM_PER_PT = 25.4 / 72;

/** The PDF would be longer than MAX_PDF_PAGES. */
export class PdfPageLimitError extends Error {
  constructor(
    readonly pages: number,
    readonly limit: number = MAX_PDF_PAGES,
  ) {
    super(
      `relvista: the PDF would have ${pages} pages (the limit is ${limit}); ` +
        'lower the print scale, switch the orientation or print one page per view',
    );
    this.name = 'PdfPageLimitError';
  }
}

/**
 * Paper for a locale: 'letter' for en-US, en-CA and es-MX, else 'a4'. Without an argument reads
 * `navigator.language` (SSR-safe: 'a4' when there is no navigator).
 */
export function defaultPaper(language?: string | null): PaperSize {
  const lang =
    language ??
    (typeof navigator !== 'undefined' && typeof navigator.language === 'string'
      ? navigator.language
      : '');
  return /^(en-us|en-ca|es-mx)(-|$)/.test(lang.toLowerCase().replace(/_/g, '-')) ? 'letter' : 'a4';
}

/** Page size in mm for paper and orientation. */
export function pageSizeMm(
  paper: PaperSize,
  orientation: PdfOrientation,
): { w: number; h: number } {
  const p = PAPER_MM[paper] ?? PAPER_MM.a4;
  return orientation === 'landscape' ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
}

/** Content rectangle of a page (inside the margins, under the header band), mm. */
export function contentBox(pageMm: { w: number; h: number }): Box {
  const x = PAGE_MARGIN_MM;
  const y = PAGE_MARGIN_MM + HEADER_BAND_MM;
  return { x, y, width: pageMm.w - 2 * PAGE_MARGIN_MM, height: pageMm.h - y - PAGE_MARGIN_MM };
}

/** mm per diagram px at a print scale in pt per px. */
export function mmPerPx(scale: number): number {
  return scale * MM_PER_PT;
}

function finitePositive(v: number | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fallback;
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Row label: A…Z, AA…AZ, BA… (spreadsheet style). */
export function rowLabel(row: number): string {
  let n = Math.max(0, Math.floor(row)) + 1;
  let out = '';
  while (n > 0) {
    out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Tile label: row letter + 1-based column number, e.g. 'B2'. */
export function tileLabel(row: number, col: number): string {
  return `${rowLabel(row)}${col + 1}`;
}

/** One tile of a tiled page plan: its grid cell and the part of the diagram it prints. */
export interface TileRect {
  row: number;
  col: number;
  /** Position and size in mm within the diagram printed at `scale` (top-left origin). */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How one diagram is cut into pages at a print scale. */
export interface TilePlan {
  pageMm: { w: number; h: number };
  orientation: PdfOrientation;
  rows: number;
  cols: number;
  /** The tiles printed, row by row. */
  tiles: TileRect[];
  /**
   * Cells of the grid left out because no table, note or collapsed group reaches into them (only
   * ref-line fragments at most; `skipEmpty`). Labels keep their grid position, so 'B2' is still
   * row B, column 2 when 'A1' is skipped.
   */
  skipped: TileRect[];
}

/**
 * Options of `planTiles`: paper, orientation (`auto` picks the one with fewer pages), print scale
 * in percent and tile overlap in mm.
 *
 * @inline
 */
export interface TileOptions {
  paper?: PaperSize;
  orientation?: 'auto' | PdfOrientation;
  scale?: number;
  overlapMm?: number;
  /**
   * Boxes of what is worth printing (tables, notes, collapsed groups; `contentBoxes(geometry)`),
   * in the coordinates of `bounds`. With them, grid cells none of the boxes reaches are skipped.
   */
  content?: readonly Box[];
  /** Leave out cells without content (needs `content`). Default true. */
  skipEmpty?: boolean;
}

/** The boxes `TileOptions.content` takes: tables, notes and collapsed groups of a geometry. */
export function contentBoxes(geometry: Pick<DiagramGeometry, 'nodes' | 'groups'>): Box[] {
  const out: Box[] = Object.values(geometry.nodes).map(({ x, y, width, height }) => ({
    x,
    y,
    width,
    height,
  }));
  for (const g of Object.values(geometry.groups))
    if (g.collapsed) out.push({ x: g.x, y: g.y, width: g.width, height: g.height });
  return out;
}

/** Overlap actually used on a page: at most half of either content side, never negative. */
export function effectiveOverlap(pageMm: { w: number; h: number }, overlapMm: number): number {
  const c = contentBox(pageMm);
  return Math.min(Math.max(0, overlapMm), c.width / 2, c.height / 2);
}

function count(length: number, content: number, overlap: number): number {
  if (length <= content + 1e-6) return 1;
  return Math.ceil((length - overlap - 1e-6) / (content - overlap));
}

function planFor(
  widthMm: number,
  heightMm: number,
  paper: PaperSize,
  orientation: PdfOrientation,
  overlapMm: number,
): TilePlan {
  const pageMm = pageSizeMm(paper, orientation);
  const c = contentBox(pageMm);
  const ov = effectiveOverlap(pageMm, overlapMm);
  const cols = count(widthMm, c.width, ov);
  const rows = count(heightMm, c.height, ov);
  const tiles: TileRect[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = col * (c.width - ov);
      const y = row * (c.height - ov);
      tiles.push({
        row,
        col,
        x: round(x),
        y: round(y),
        w: round(Math.min(c.width, widthMm - x)),
        h: round(Math.min(c.height, heightMm - y)),
      });
    }
  }
  return { pageMm, orientation, rows, cols, tiles, skipped: [] };
}

/**
 * Splits `plan.tiles` into printed and skipped cells. A tile is printed when a content box reaches
 * its core (the part no neighbour shares); then, for the rest, when some box shows on it in an
 * overlap band without being whole on a printed neighbour already (a table cut by the page edge
 * keeps its page). Every point of every box is on a printed page; pages that would hold only
 * ref-line fragments, or a sliver of a table that a neighbour prints whole, go.
 */
function skipEmpty(
  plan: TilePlan,
  k: number,
  overlapMm: number,
  content: readonly Box[],
): TilePlan {
  if (plan.tiles.length < 2 || content.length === 0) return plan;
  const ov = effectiveOverlap(plan.pageMm, overlapMm);
  type R = { x0: number; y0: number; x1: number; y1: number };
  const boxes: R[] = content
    .filter((b) => [b.x, b.y, b.width, b.height].every(Number.isFinite))
    .map((b) => ({ x0: b.x * k, y0: b.y * k, x1: (b.x + b.width) * k, y1: (b.y + b.height) * k }));
  const rect = (t: TileRect): R => ({ x0: t.x, y0: t.y, x1: t.x + t.w, y1: t.y + t.h });
  const cut = (a: R, b: R): R | null => {
    const r = {
      x0: Math.max(a.x0, b.x0),
      y0: Math.max(a.y0, b.y0),
      x1: Math.min(a.x1, b.x1),
      y1: Math.min(a.y1, b.y1),
    };
    return r.x0 < r.x1 && r.y0 < r.y1 ? r : null;
  };
  const inside = (a: R, b: R) =>
    a.x0 >= b.x0 - 1e-6 && a.y0 >= b.y0 - 1e-6 && a.x1 <= b.x1 + 1e-6 && a.y1 <= b.y1 + 1e-6;
  const kept = new Set<TileRect>();
  for (const t of plan.tiles) {
    const core: R = {
      x0: t.x + (t.col > 0 ? ov : 0),
      y0: t.y + (t.row > 0 ? ov : 0),
      x1: t.x + t.w - (t.col < plan.cols - 1 ? ov : 0),
      y1: t.y + t.h - (t.row < plan.rows - 1 ? ov : 0),
    };
    if (boxes.some((b) => cut(b, core))) kept.add(t);
  }
  for (const t of plan.tiles) {
    if (kept.has(t)) continue;
    const r = rect(t);
    const needed = boxes.some((b) => {
      const part = cut(b, r);
      return !!part && ![...kept].some((o) => inside(part, rect(o)));
    });
    if (needed) kept.add(t);
  }
  const tiles = plan.tiles.filter((t) => kept.has(t));
  const skipped = plan.tiles.filter((t) => !kept.has(t));
  return tiles.length ? { ...plan, tiles, skipped } : plan;
}

function overlapOf(options: { overlapMm?: number }): number {
  return typeof options.overlapMm === 'number' && Number.isFinite(options.overlapMm)
    ? options.overlapMm
    : DEFAULT_OVERLAP_MM;
}

/**
 * Tile grid, in mm, for a diagram of `bounds` px printed at `scale` pt per px. Tiles run row by
 * row; neighbours share `overlapMm`; the last row and column are cut to the diagram. 'auto'
 * orientation picks the one with fewer pages; on a tie the one matching the diagram's aspect
 * (landscape for a wide diagram, portrait otherwise).
 */
export function planTiles(bounds: Box, options: TileOptions = {}): TilePlan {
  const paper = options.paper ?? defaultPaper();
  const k = mmPerPx(finitePositive(options.scale, DEFAULT_PDF_SCALE));
  const overlap = overlapOf(options);
  const wMm = Math.max(1, (Number.isFinite(bounds.width) ? bounds.width : 0) * k);
  const hMm = Math.max(1, (Number.isFinite(bounds.height) ? bounds.height : 0) * k);
  const o = options.orientation ?? 'auto';
  const content =
    options.skipEmpty !== false && options.content?.length
      ? options.content.map((b) => ({ ...b, x: b.x - bounds.x, y: b.y - bounds.y }))
      : null;
  const plan = (orientation: PdfOrientation) => {
    const p = planFor(wMm, hMm, paper, orientation, overlap);
    return content ? skipEmpty(p, k, overlap, content) : p;
  };
  if (o === 'portrait' || o === 'landscape') return plan(o);
  const portrait = plan('portrait');
  const landscape = plan('landscape');
  if (portrait.tiles.length !== landscape.tiles.length)
    return portrait.tiles.length < landscape.tiles.length ? portrait : landscape;
  return wMm > hMm ? landscape : portrait;
}

/**
 * Fit of a `w`×`h` drawing into `box`: the factor and the placement (centred horizontally,
 * top-aligned).
 */
export function fitInto(
  w: number,
  h: number,
  box: Box,
  maxFactor = Infinity,
): { factor: number; x: number; y: number; w: number; h: number } {
  const factor = Math.min(box.width / Math.max(w, 1e-9), box.height / Math.max(h, 1e-9), maxFactor);
  const fw = w * factor;
  return { factor, x: box.x + (box.width - fw) / 2, y: box.y, w: fw, h: h * factor };
}

/**
 * 'pages' mode: the orientation that draws the diagram largest ('auto'), or the given one; ties
 * go to the diagram's aspect.
 */
export function pageOrientationFor(
  widthPx: number,
  heightPx: number,
  paper: PaperSize,
  orientation: 'auto' | PdfOrientation = 'auto',
): PdfOrientation {
  if (orientation === 'portrait' || orientation === 'landscape') return orientation;
  const p = fitInto(widthPx, heightPx, contentBox(pageSizeMm(paper, 'portrait'))).factor;
  const l = fitInto(widthPx, heightPx, contentBox(pageSizeMm(paper, 'landscape'))).factor;
  if (Math.abs(p - l) > 1e-9) return p > l ? 'portrait' : 'landscape';
  return widthPx > heightPx ? 'landscape' : 'portrait';
}

// ---------------------------------------------------------------------------------------------
// Marks

/** A line, circle or rectangle of the overlap and alignment marks printed on tiles. */
export type MarkPrimitive =
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'rect'; x: number; y: number; w: number; h: number }
  | {
      kind: 'label';
      x: number;
      y: number;
      text: string;
      align: 'left' | 'center' | 'right';
      sizePt: number;
    };

function registration(cx: number, cy: number): MarkPrimitive[] {
  const r = REG_RADIUS_MM;
  return [
    { kind: 'circle', cx, cy, r },
    { kind: 'line', x1: cx - r - 0.8, y1: cy, x2: cx + r + 0.8, y2: cy },
    { kind: 'line', x1: cx, y1: cy - r - 0.8, x2: cx, y2: cy + r + 0.8 },
  ];
}

/**
 * Cut and registration marks of one tile page, in page mm: for every neighbour, crop ticks in the
 * margin at both edges of the shared overlap band, a registration mark centred on the band, and
 * the neighbour's label next to the content edge ('B3' right of 'B2'). Bands shared with left and
 * right neighbours are marked in the bottom margin, bands shared with the rows above and below in
 * the side margins (the top margin holds the header).
 */
export function tileMarks(plan: TilePlan, tile: TileRect, overlapMm: number): MarkPrimitive[] {
  const printed = new Set(plan.tiles.map((t) => `${t.row}:${t.col}`));
  const has = (row: number, col: number) => printed.has(`${row}:${col}`);
  const c = contentBox(plan.pageMm);
  const ov = effectiveOverlap(plan.pageMm, overlapMm);
  const out: MarkPrimitive[] = [];
  const left = c.x;
  const top = c.y;
  const right = c.x + tile.w;
  const bottom = c.y + tile.h;
  const regY = bottom + PAGE_MARGIN_MM / 2;
  const label = (x: number, y: number, text: string, align: 'left' | 'center' | 'right') =>
    out.push({ kind: 'label', x, y, text, align, sizePt: MARK_FONT_PT });
  const vBand = (x0: number, x1: number) => {
    for (const x of [x0, x1])
      out.push({ kind: 'line', x1: x, y1: bottom + 1, x2: x, y2: bottom + 1 + TICK_MM });
    out.push(...registration((x0 + x1) / 2, regY));
  };
  const hBand = (y0: number, y1: number) => {
    for (const y of [y0, y1]) {
      out.push({ kind: 'line', x1: left - 1 - TICK_MM, y1: y, x2: left - 1, y2: y });
      out.push({ kind: 'line', x1: right + 1, y1: y, x2: right + 1 + TICK_MM, y2: y });
    }
    out.push(...registration(left - PAGE_MARGIN_MM / 2, (y0 + y1) / 2));
    out.push(...registration(right + PAGE_MARGIN_MM / 2, (y0 + y1) / 2));
  };
  const midY = top + tile.h / 2;
  const midX = left + tile.w / 2;
  // Neighbours that were skipped (no content) get no band marks and no label.
  if (tile.col > 0 && has(tile.row, tile.col - 1)) {
    vBand(left, left + ov);
    label(left - 1, midY, tileLabel(tile.row, tile.col - 1), 'right');
  }
  if (tile.col < plan.cols - 1 && has(tile.row, tile.col + 1)) {
    vBand(right - ov, right);
    label(right + 1, midY, tileLabel(tile.row, tile.col + 1), 'left');
  }
  if (tile.row > 0 && has(tile.row - 1, tile.col)) {
    hBand(top, top + ov);
    label(midX, top - 0.8, tileLabel(tile.row - 1, tile.col), 'center');
  }
  if (tile.row < plan.rows - 1 && has(tile.row + 1, tile.col)) {
    hBand(bottom - ov, bottom);
    label(midX, bottom + 3, tileLabel(tile.row + 1, tile.col), 'center');
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Document plan

/**
 * What planning needs of a page source (`PdfPageSource` without model and decorations).
 *
 * @inline
 */
export interface PlanSource {
  title: string;
  /** Diagram bounds in px (`geometry.bounds`). */
  bounds: Box;
  /** Boxes worth printing (`contentBoxes(geometry)`); tiled cells without any are skipped. */
  content?: readonly Box[];
}

/**
 * Options of `planDocument`: the tile options plus the mode, marks, overview page and title.
 *
 * @inline
 */
export interface PlanOptions extends Omit<TileOptions, 'content'> {
  mode: 'tiled' | 'pages';
  marks?: boolean;
  overview?: boolean;
  title?: string;
}

/** One page of a planned PDF document. */
export interface PlannedPage {
  kind: 'tile' | 'overview' | 'fit';
  /** Index into the sources. */
  source: number;
  pageMm: { w: number; h: number };
  orientation: PdfOrientation;
  /** Where the whole diagram (padded bounds) is drawn on the page, mm. */
  draw: { x: number; y: number; w: number; h: number };
  /** Clip rectangle on the page, mm: only this part of `draw` shows. */
  clip: { x: number; y: number; w: number; h: number };
  /** The part of the diagram that shows, in diagram px (for culling off-page elements). */
  visiblePx: Box;
  /** Running header: left (title, view) and right (page label, 'relvista'). */
  header: { left: string; right: string };
  /** Tile label ('B2') on tile pages. */
  label?: string;
  /** Marks, overview grid and labels, in page mm. */
  marks: MarkPrimitive[];
}

/**
 * The overview page's grid, in page mm: one thin line per tile boundary (the middle of each
 * overlap band) and a frame, column numbers above and row letters left of the drawing (in the
 * gutter, never over a table), and skipped cells crossed out.
 */
function overviewGrid(
  plan: TilePlan,
  fit: { factor: number; x: number; y: number; w: number; h: number },
  overlapMm: number,
): MarkPrimitive[] {
  const ov = effectiveOverlap(plan.pageMm, overlapMm);
  const c = contentBox(plan.pageMm);
  const out: MarkPrimitive[] = [{ kind: 'rect', x: fit.x, y: fit.y, w: fit.w, h: fit.h }];
  const stepX = (c.width - ov) * fit.factor;
  const stepY = (c.height - ov) * fit.factor;
  const mid = (ov / 2) * fit.factor;
  const xAt = (col: number) =>
    col <= 0 ? fit.x : Math.min(fit.x + fit.w, fit.x + col * stepX + mid);
  const yAt = (row: number) =>
    row <= 0 ? fit.y : Math.min(fit.y + fit.h, fit.y + row * stepY + mid);
  for (let col = 1; col < plan.cols; col++) {
    const x = xAt(col);
    out.push({ kind: 'line', x1: x, y1: fit.y, x2: x, y2: fit.y + fit.h });
  }
  for (let row = 1; row < plan.rows; row++) {
    const y = yAt(row);
    out.push({ kind: 'line', x1: fit.x, y1: y, x2: fit.x + fit.w, y2: y });
  }
  const label = (x: number, y: number, text: string, align: 'center' | 'right') =>
    out.push({ kind: 'label', x, y, text, align, sizePt: OVERVIEW_FONT_PT });
  for (let col = 0; col < plan.cols; col++)
    label(
      (xAt(col) + (col + 1 < plan.cols ? xAt(col + 1) : fit.x + fit.w)) / 2,
      fit.y - 2.2,
      String(col + 1),
      'center',
    );
  for (let row = 0; row < plan.rows; row++)
    label(
      fit.x - 1.5,
      (yAt(row) + (row + 1 < plan.rows ? yAt(row + 1) : fit.y + fit.h)) / 2,
      rowLabel(row),
      'right',
    );
  for (const t of plan.skipped) {
    const x0 = xAt(t.col);
    const x1 = t.col + 1 < plan.cols ? xAt(t.col + 1) : fit.x + fit.w;
    const y0 = yAt(t.row);
    const y1 = t.row + 1 < plan.rows ? yAt(t.row + 1) : fit.y + fit.h;
    out.push({ kind: 'line', x1: x0, y1: y0, x2: x1, y2: y1 });
    out.push({ kind: 'line', x1: x0, y1: y1, x2: x1, y2: y0 });
  }
  return out;
}

/** Bounds plus the PDF padding, px. */
export function paddedBounds(bounds: Box): Box {
  const p = PDF_DIAGRAM_PADDING;
  const x = Number.isFinite(bounds.x) ? bounds.x : 0;
  const y = Number.isFinite(bounds.y) ? bounds.y : 0;
  const w = Number.isFinite(bounds.width) ? Math.max(0, bounds.width) : 0;
  const h = Number.isFinite(bounds.height) ? Math.max(0, bounds.height) : 0;
  return { x: x - p, y: y - p, width: Math.max(1, w + 2 * p), height: Math.max(1, h + 2 * p) };
}

function headerLeft(docTitle: string | undefined, sourceTitle: string): string {
  const parts = [docTitle?.trim(), sourceTitle.trim()].filter((s): s is string => !!s);
  if (parts.length === 2 && parts[0] === parts[1]) parts.pop();
  return parts.join(' — ');
}

/**
 * Every page of the document, in order: per source, in 'tiled' mode an overview page (when the
 * source needs more than one tile and `overview` is not false) followed by its tiles row by row;
 * in 'pages' mode one page fit to the paper. Throws PdfPageLimitError past MAX_PDF_PAGES.
 */
export function planDocument(sources: readonly PlanSource[], options: PlanOptions): PlannedPage[] {
  const paper = options.paper ?? defaultPaper();
  const scale = finitePositive(options.scale, DEFAULT_PDF_SCALE);
  const k = mmPerPx(scale);
  const overlap = overlapOf(options);
  const marks = options.marks !== false;
  const pages: Omit<PlannedPage, 'header'>[] = [];
  const lefts: string[] = [];
  const rights: string[] = [];

  sources.forEach((src, source) => {
    const px = paddedBounds(src.bounds);
    const left = headerLeft(options.title, src.title);
    if (options.mode === 'pages') {
      const orientation = pageOrientationFor(px.width, px.height, paper, options.orientation);
      const pageMm = pageSizeMm(paper, orientation);
      const fit = fitInto(px.width, px.height, contentBox(pageMm), mmPerPx(MAX_FIT_PT_PER_PX));
      const rect = { x: fit.x, y: fit.y, w: fit.w, h: fit.h };
      pages.push({
        kind: 'fit',
        source,
        pageMm,
        orientation,
        draw: rect,
        clip: rect,
        visiblePx: px,
        marks: [],
      });
      lefts.push(left);
      rights.push('');
      return;
    }
    const plan = planTiles(px, {
      paper,
      orientation: options.orientation,
      scale,
      overlapMm: overlap,
      ...(src.content ? { content: src.content } : {}),
      ...(options.skipEmpty === false ? { skipEmpty: false } : {}),
    });
    const c = contentBox(plan.pageMm);
    const wMm = px.width * k;
    const hMm = px.height * k;
    const many = plan.tiles.length > 1;
    if (many && options.overview !== false) {
      const g = OVERVIEW_GUTTER_MM;
      const fit = fitInto(wMm, hMm, {
        x: c.x + g,
        y: c.y + g,
        width: c.width - g,
        height: c.height - g,
      });
      const rect = { x: fit.x, y: fit.y, w: fit.w, h: fit.h };
      const grid = overviewGrid(plan, fit, overlap);
      pages.push({
        kind: 'overview',
        source,
        pageMm: plan.pageMm,
        orientation: plan.orientation,
        draw: rect,
        clip: rect,
        visiblePx: px,
        marks: grid,
      });
      lefts.push(left);
      const skipped = plan.skipped.length ? `, ${plan.skipped.length} empty left out` : '';
      rights.push(`Overview · ${plan.rows} × ${plan.cols} pages${skipped}`);
    }
    for (const t of plan.tiles) {
      const label = tileLabel(t.row, t.col);
      pages.push({
        kind: 'tile',
        source,
        pageMm: plan.pageMm,
        orientation: plan.orientation,
        draw: { x: c.x - t.x, y: c.y - t.y, w: wMm, h: hMm },
        clip: { x: c.x, y: c.y, w: t.w, h: t.h },
        visiblePx: { x: px.x + t.x / k, y: px.y + t.y / k, width: t.w / k, height: t.h / k },
        ...(many ? { label } : {}),
        marks: marks && many ? tileMarks(plan, t, overlap) : [],
      });
      lefts.push(left);
      rights.push(many && marks ? `${label} (row ${rowLabel(t.row)}, column ${t.col + 1})` : '');
    }
  });

  if (pages.length > MAX_PDF_PAGES) throw new PdfPageLimitError(pages.length);
  const total = pages.length;
  return pages.map((p, i) => ({
    ...p,
    header: {
      left: lefts[i]!,
      right: [rights[i], total > 1 ? `${i + 1}/${total}` : '', 'relvista']
        .filter((s) => !!s)
        .join(' · '),
    },
  }));
}

// ---------------------------------------------------------------------------------------------
// Text and fonts

/** Characters of Windows-1252 (WinAnsiEncoding) outside Latin-1, which the standard fonts draw. */
const CP1252_EXTRA: ReadonlySet<number> = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152,
  0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a,
  0x0153, 0x017e, 0x0178,
]);

/** Whether jsPDF's standard fonts (Helvetica, Courier, Times) can draw every character. */
export function isWinAnsi(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp === 9 || cp === 10 || cp === 13) continue;
    if (cp >= 0x20 && cp <= 0x7e) continue;
    if (cp >= 0xa0 && cp <= 0xff) continue;
    if (CP1252_EXTRA.has(cp)) continue;
    return false;
  }
  return true;
}

/** Code point → WinAnsi look-alike for typographic characters relvista draws. */
const SUBSTITUTES: ReadonlyMap<number, string> = new Map([
  [0x2212, '\u2013'], // minus sign (diff badges '\u22121') → en dash
  [0x2010, '-'], // hyphen
  [0x2011, '-'], // non-breaking hyphen
  [0x2007, ' '], // figure space
  [0x2009, ' '], // thin space
  [0x200a, ' '], // hair space
  [0x202f, ' '], // narrow no-break space
]);
const SUBSTITUTE_RE = /[\u2212\u2010\u2011\u2007\u2009\u200a\u202f]/g;

/** Replaces typographic characters relvista draws (minus sign, thin spaces) with WinAnsi look-alikes. */
export function pdfSafeText(text: string): string {
  return text.replace(SUBSTITUTE_RE, (ch) => SUBSTITUTES.get(ch.codePointAt(0)!) ?? ch);
}

export type StandardFont = 'helvetica' | 'courier' | 'times';

/**
 * The standard PDF font for a CSS font stack: the first family it recognises decides ('courier'
 * for monospace, 'times' for serif, 'helvetica' for sans-serif), else `fallback`. Palette fonts
 * are honoured as far as the standard fonts go.
 */
export function standardFontFor(stack: string | undefined, fallback: StandardFont): StandardFont {
  for (const raw of (stack ?? '').toLowerCase().split(',')) {
    const f = raw.trim().replace(/^["']|["']$/g, '');
    if (f === 'monospace' || /mono|courier|consol|menlo|monaco/.test(f)) return 'courier';
    if (f === 'serif' || /times|georgia|garamond|cambria/.test(f)) return 'times';
    if (f === 'sans-serif' || /sans|helvetica|arial|inter|system-ui|segoe|roboto/.test(f))
      return 'helvetica';
  }
  return fallback;
}
