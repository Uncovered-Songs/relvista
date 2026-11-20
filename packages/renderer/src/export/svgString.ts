import { METRICS, type DetailLevel, type DiagramGeometry, type DiagramModel } from '@relvista/core';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DiagramSvg } from '../svg/DiagramSvg.js';
import type { EdgeStyle } from '../svg/routing.js';
import { paletteCss, type ColorMode } from '../theme.js';

export interface SvgExportOptions {
  colorMode?: ColorMode;
  /** Space around the diagram, in px. Default 24. */
  padding?: number;
  /** true (default) fills with the palette's canvas colour, false is transparent, a string is a colour. */
  background?: boolean | string;
  /** Written as the SVG `<title>`. */
  title?: string;
  detailLevel?: DetailLevel;
  edgeStyle?: EdgeStyle;
  highlight?: readonly string[];
  /** Scale of the `width`/`height` attributes (the viewBox is unchanged). Default 1. */
  scale?: number;
}

/** The `<style>` embedded in exported SVGs: palette variables for the mode and the font stacks. */
export function exportStyle(mode: ColorMode): string {
  return (
    `svg.rv-diagram{${paletteCss(mode)} font-family:${METRICS.fontFamily};}` +
    `svg.rv-diagram text{font-family:${METRICS.fontFamily};}` +
    `svg.rv-diagram .rv-column text[text-anchor="end"]{font-family:${METRICS.monoFontFamily};}`
  );
}

function escapeXmlText(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * The diagram as a standalone SVG document: literal colours for the chosen mode (works in tools
 * without CSS variable support), plus an embedded `<style>` with the `--rv-*` variables and fonts.
 * Pure: works in Node and in browsers.
 */
export function renderDiagramSvgString(
  model: DiagramModel,
  geometry: DiagramGeometry,
  opts: SvgExportOptions = {},
): string {
  const mode = opts.colorMode ?? 'light';
  const padding = opts.padding ?? 24;
  const scale = opts.scale ?? 1;
  const b = geometry.bounds;
  const w = Math.max(1, (Number.isFinite(b.width) ? b.width : 0) + padding * 2);
  const h = Math.max(1, (Number.isFinite(b.height) ? b.height : 0) + padding * 2);
  const markup = renderToStaticMarkup(
    createElement(DiagramSvg, {
      model,
      geometry,
      colorMode: mode,
      padding,
      background: opts.background ?? true,
      ...(opts.title !== undefined ? { title: opts.title } : {}),
      ...(opts.detailLevel ? { detailLevel: opts.detailLevel } : {}),
      ...(opts.edgeStyle ? { edgeStyle: opts.edgeStyle } : {}),
      ...(opts.highlight ? { highlight: opts.highlight } : {}),
      width: Math.round(w * scale * 100) / 100,
      height: Math.round(h * scale * 100) / 100,
      literalColors: true,
      idPrefix: 'rv-export',
    }),
  );
  const open = markup.indexOf('>') + 1;
  const style = `<style>${escapeXmlText(exportStyle(mode))}</style>`;
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' + markup.slice(0, open) + style + markup.slice(open)
  );
}
