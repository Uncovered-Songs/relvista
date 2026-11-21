// Node only: the build-time static diagrams (docs/design/phase3-v1.md §5.1). Bundled into the
// Docusaurus server bundle only, through the `relvista-ssr-files` alias (src/index.ts); the browser
// bundle gets ssr/client.ts instead, so react-dom/server and fs never reach it.
import { renderToStaticMarkup } from 'react-dom/server';
import {
  layoutDiagram,
  parseLayout,
  type CompileInput,
  type Layout,
  type ViewLayout,
} from '@relvista/core';
import {
  StaticBox,
  payloadOf,
  placedGeometry,
  positionsOf,
  prepareStatic,
  type PreparedStatic,
} from './build.js';
import { renderDiff } from '../theme/DbmlDiff/server.js';
import { createSiteFileReader, isRemote, type SiteFilesConfig } from './files.js';
import {
  MAX_STATIC_BYTES,
  type SsrBackend,
  type StaticRequest,
  type StaticResult,
} from './types.js';

export type { SiteFilesConfig } from './files.js';

export interface SsrBackendConfig extends SiteFilesConfig {
  /**
   * ELK layout (default `@relvista/core`'s `layoutDiagram`). The Docusaurus server bundle passes
   * one Node loads outside the bundle (ssr/layout-node.cts).
   */
  layoutDiagram?: typeof layoutDiagram;
}

const problem = (message: string): StaticResult => ({ kind: 'error', message });
const skip = (reason: string | null): StaticResult => ({ kind: 'skip', reason });

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The build-time renderer for one site. */
export function createSsrBackend(config: SsrBackendConfig): SsrBackend {
  const readSiteFile = createSiteFileReader(config);
  const runLayout = config.layoutDiagram ?? layoutDiagram;

  const loadLayout = (
    layout: StaticRequest['layout'],
  ): { ok: true; layout: Layout | null } | { ok: false; result: StaticResult } => {
    if (layout === undefined || layout === null) return { ok: true, layout: null };
    let input: unknown = layout;
    if (typeof layout === 'string') {
      if (isRemote(layout)) return { ok: false, result: skip(null) };
      const file = readSiteFile(layout);
      if (!file.ok)
        return { ok: false, result: problem(`Could not load ${layout}: ${file.message}`) };
      try {
        input = JSON.parse(file.text);
      } catch (err) {
        return { ok: false, result: problem(`Invalid layout file ${layout}: ${messageOf(err)}`) };
      }
    }
    const parsed = parseLayout(input);
    if (!parsed.ok)
      return {
        ok: false,
        result: problem(
          `Invalid layout file: ${parsed.errors.map((e) => `${e.path || '/'} ${e.message}`).join('; ')}`,
        ),
      };
    return { ok: true, layout: parsed.layout };
  };

  const draw = async (request: StaticRequest, p: PreparedStatic): Promise<StaticResult> => {
    let positions = {};
    if (p.model.tables.length || p.model.stickyNotes.length) {
      // ELK in-process: build-time quality costs nothing. Saved positions are kept.
      const elk = await runLayout(p.model, {
        engine: 'elk',
        detailLevel: p.detailLevel,
        saved: p.saved as Partial<ViewLayout> | null,
      });
      positions = positionsOf(elk);
    }
    const geometry = placedGeometry(p, positions);
    const html = renderToStaticMarkup(
      <StaticBox
        prepared={p}
        geometry={geometry}
        title={request.title}
        height={request.height}
        palette={request.palette}
        minimap={request.minimap}
        idPrefix={`rvs-${request.key}`}
      />,
    );
    if (html.length > MAX_STATIC_BYTES)
      return skip(
        `its static SVG would be ${(html.length / 1024 / 1024).toFixed(1)} MB (the limit is 1.5 MB)`,
      );
    return { kind: 'ok', html, payload: payloadOf(p.view, geometry) };
  };

  const renderStatic = async (request: StaticRequest): Promise<StaticResult> => {
    try {
      let source: CompileInput;
      if (request.value !== undefined) source = request.value;
      else if (request.src) {
        if (isRemote(request.src)) return skip(null);
        const file = readSiteFile(request.src);
        if (!file.ok) return problem(`Could not load ${request.src}: ${file.message}`);
        source = file.text;
      } else return problem('DbmlDiagram needs a `value` or a `src`.');

      const layout = loadLayout(request.layout);
      if (!layout.ok) return layout.result;
      const prepared = prepareStatic({
        source,
        layout: layout.layout,
        ...(request.view !== undefined ? { view: request.view } : {}),
        ...(request.detailLevel ? { detailLevel: request.detailLevel } : {}),
        defaultDetailLevel: request.defaultDetailLevel,
      });
      if (!prepared.ok) return problem(prepared.message);
      return await draw(request, prepared.value);
    } catch (err) {
      return problem(`This diagram could not be rendered: ${messageOf(err)}`);
    }
  };

  return {
    readSiteFile,
    renderStatic,
    // ELK quality for build-time diffs too (§5.3).
    renderDiff: (request) => renderDiff({ readSiteFile, layoutDiagram: runLayout }, request),
  };
}
