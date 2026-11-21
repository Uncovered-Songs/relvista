import type { DiagramGeometry, DiagramModel } from '@relvista/core';
import { renderDiagramSvgString, type SvgExportOptions } from './svgString.js';

/** Options of `printDiagram`. */
export interface PrintOptions extends Omit<SvgExportOptions, 'scale' | 'colorMode'> {
  /** Page orientation. Default 'landscape'; 'auto' picks from the diagram's aspect ratio. */
  orientation?: 'landscape' | 'portrait' | 'auto';
  /** Page margin (CSS length). Default '10mm'. */
  margin?: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The HTML document printed by `printDiagram` (exported for tests). */
export function printDocument(
  model: DiagramModel,
  geometry: DiagramGeometry,
  opts: PrintOptions = {},
): string {
  const svg = renderDiagramSvgString(model, geometry, {
    ...opts,
    colorMode: 'light',
    background: opts.background ?? false,
  }).replace(/^<\?xml[^>]*>\s*/, '');
  const b = geometry.bounds;
  const orientation =
    opts.orientation === 'auto'
      ? b.width >= b.height
        ? 'landscape'
        : 'portrait'
      : (opts.orientation ?? 'landscape');
  const title = opts.title ? `<h1>${escapeHtml(opts.title)}</h1>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(opts.title ?? 'Diagram')}</title>
<style>
@page { size: ${orientation}; margin: ${opts.margin ?? '10mm'}; }
html, body { margin: 0; padding: 0; height: 100%; background: #fff; }
body { display: flex; flex-direction: column; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
h1 { font: 600 14px Inter, ui-sans-serif, system-ui, sans-serif; margin: 0 0 6px; color: #1f2633; }
.rv-print { flex: 1 1 auto; min-height: 0; display: flex; align-items: center; justify-content: center; }
.rv-print svg { width: 100%; height: 100%; max-width: 100%; max-height: 100%; }
</style></head><body>${title}<div class="rv-print">${svg.replace(
    /<svg([^>]*?) width="[^"]*" height="[^"]*"/,
    '<svg$1 preserveAspectRatio="xMidYMid meet"',
  )}</div></body></html>`;
}

/** Prints the diagram through a hidden iframe, fitted to one page (browser only). */
export function printDiagram(
  model: DiagramModel,
  geometry: DiagramGeometry,
  opts: PrintOptions = {},
): void {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
    opacity: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(iframe);
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument ?? win?.document;
  if (!win || !doc) {
    iframe.remove();
    return;
  }
  let removed = false;
  const cleanup = () => {
    if (removed) return;
    removed = true;
    iframe.remove();
  };
  doc.open();
  doc.write(printDocument(model, geometry, opts));
  doc.close();
  const go = () => {
    try {
      win.focus();
      win.addEventListener('afterprint', () => setTimeout(cleanup, 100), { once: true });
      win.print();
    } finally {
      // Browsers without afterprint (or with a non-blocking print) still get cleaned up.
      setTimeout(cleanup, 60_000);
    }
  };
  const fonts = (doc as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  if (fonts?.ready) fonts.ready.then(() => setTimeout(go, 50), go);
  else setTimeout(go, 50);
}
