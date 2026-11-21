import type { DiagramGeometry, DiagramModel } from '@relvista/core';
import { renderDiagramSvgString, type SvgExportOptions } from './svgString.js';

/** Options of `exportPng`. */
export interface PngExportOptions extends Omit<SvgExportOptions, 'scale'> {
  /** Device pixels per diagram px. Default 2. */
  scale?: number;
  /** Largest canvas side in px. Default 16384. */
  maxCanvasSide?: number;
  /** Largest canvas area in px (iOS Safari caps at 16,777,216). Default 16,777,216. */
  maxCanvasPixels?: number;
}

/** Effective scale so the canvas stays within the size limits. */
export function clampScale(
  width: number,
  height: number,
  scale: number,
  maxSide = 16384,
  maxPixels = 16_777_216,
): number {
  let s = scale;
  s = Math.min(s, maxSide / width, maxSide / height);
  s = Math.min(s, Math.sqrt(maxPixels / (width * height)));
  return Math.max(0.05, s);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('relvista: could not load the diagram SVG as an image'));
    img.src = src;
  });
}

/** Renders the diagram to a PNG Blob (browser only). */
export async function exportPng(
  model: DiagramModel,
  geometry: DiagramGeometry,
  opts: PngExportOptions = {},
): Promise<Blob> {
  const padding = opts.padding ?? 24;
  const w = Math.max(1, geometry.bounds.width + padding * 2);
  const h = Math.max(1, geometry.bounds.height + padding * 2);
  const scale = clampScale(w, h, opts.scale ?? 2, opts.maxCanvasSide, opts.maxCanvasPixels);
  const svg = renderDiagramSvgString(model, geometry, { ...opts, padding, scale: 1 });
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('relvista: canvas 2D context unavailable');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('relvista: PNG encoding failed'))),
      'image/png',
    ),
  );
}
