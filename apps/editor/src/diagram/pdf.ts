/**
 * PDF export from the editor (design phase3 §6.12): the open view as drawn (drags, focus, compare
 * decorations), every other view laid out here from its saved layout (the sync layout places the
 * nodes without a position; ELK is not awaited).
 */
import {
  DEFAULT_VIEW,
  mergeViewDefaults,
  neighborhood,
  selectView,
  subsetModel,
  type DetailLevel,
  type DiagramGeometry,
  type DiagramModel,
  type Layout,
  type ViewLayout,
} from '@relvista/core';
import {
  isViewEmpty,
  layoutSync,
  contentBoxes,
  paddedBounds,
  planTiles,
  type Decorations,
  type DiagramCanvasHandle,
  type PdfOptions,
  type PdfPageSource,
  type TilePlan,
} from '@relvista/renderer';

/**
 * Views a PDF can contain: all tables, then the DiagramViews in model order. Views that draw
 * nothing are marked `empty` (the dialog leaves them out and says so).
 */
export function pdfViews(model: DiagramModel): { name: string; label: string; empty?: boolean }[] {
  return [
    { name: DEFAULT_VIEW, label: 'All tables' },
    ...model.views.map((v) => ({ name: v.name, label: v.name })),
  ].map((v) => (isViewEmpty(model, v.name) ? { ...v, empty: true } : v));
}

export function viewLabel(name: string): string {
  return name === DEFAULT_VIEW ? 'All tables' : name;
}

/** `model` reduced to a focus (as the canvas draws it), or `model` itself. */
export function focusedModel(
  model: DiagramModel,
  focus: { id: string; hops: number } | null,
): DiagramModel {
  if (!focus || !model.tables.some((t) => t.id === focus.id)) return model;
  const { tableIds } = neighborhood(model, [focus.id], focus.hops);
  return subsetModel(model, { tableIds, noteIds: model.stickyNotes.map((n) => n.id) });
}

export interface PdfContext {
  /** The open document's model (not view-filtered). */
  model: DiagramModel;
  layout: Layout | null;
  /** The view the canvas shows. */
  activeView: string;
  /** What the canvas draws for the active view (view-filtered; merged in compare mode; focused). */
  drawn: DiagramModel;
  canvas: DiagramCanvasHandle | null;
  detail: DetailLevel;
  /** Compare decorations of the active view. */
  decorations: Decorations | null;
}

/**
 * Page sources by view name, cached: the active view from the canvas, the others laid out once
 * per context.
 */
export function pdfSources(ctx: PdfContext): (name: string) => PdfPageSource | null {
  const cache = new Map<string, { model: DiagramModel; geometry: DiagramGeometry }>();
  return (name) => {
    if (name === ctx.activeView) {
      const geometry = ctx.canvas?.getGeometry();
      if (!geometry) return null;
      return {
        title: viewLabel(name),
        model: ctx.drawn,
        geometry,
        decorations: ctx.decorations,
      };
    }
    let hit = cache.get(name);
    if (!hit) {
      const m = name === DEFAULT_VIEW ? ctx.model : (selectView(ctx.model, name) ?? ctx.model);
      const saved = ctx.layout
        ? (mergeViewDefaults(ctx.layout, name) as Partial<ViewLayout>)
        : null;
      const geometry = layoutSync(m, { detailLevel: ctx.detail, ...(saved ? { saved } : {}) });
      hit = { model: m, geometry };
      cache.set(name, hit);
    }
    return { title: viewLabel(name), ...hit };
  };
}

/** The tile grid of a view, as the PDF writer computes it. */
export function planFor(
  source: (name: string) => PdfPageSource | null,
  activeView: string,
): (o: PdfOptions, view?: string) => TilePlan {
  return (o, view) => {
    const src = source(view ?? activeView);
    const b = src ? src.geometry.bounds : { x: 0, y: 0, width: 1, height: 1 };
    // The renderer's own padding and content: the dialog's page count matches the pages written.
    return planTiles(paddedBounds(b), {
      ...o,
      ...(src ? { content: contentBoxes(src.geometry) } : {}),
    });
  };
}
