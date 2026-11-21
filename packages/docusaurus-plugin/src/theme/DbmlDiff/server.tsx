// Node only (build time): the static schema diff (docs/design/phase3-v1.md §5.3), as markup. Part
// of the server side of `relvista-ssr-files` (src/ssr/server.tsx `createSsrBackend` exposes it
// as `renderDiff`), so react-dom/server, the DBML parser and the renderer never reach the
// browser's main bundle.
import { renderToStaticMarkup } from 'react-dom/server';
import { MAX_STATIC_BYTES, type SsrBackend, type SsrPayload } from '../../ssr/types.js';
import { DiffBox, buildDiff, type DiffBackend, type DiffRequest } from './build.js';
import type { DiffChanges } from './changes.js';

/** The JSON script of a static diff: the positions for the viewer and the change list. */
export type DiffPayload = SsrPayload & { changes: DiffChanges };

export type DiffResult =
  | { kind: 'ok'; html: string; payload: DiffPayload }
  | { kind: 'error'; message: string }
  | { kind: 'skip'; reason: string | null };

/** Draws one diff for the page's HTML. Never rejects. */
export async function renderDiff(backend: DiffBackend, request: DiffRequest): Promise<DiffResult> {
  const built = await buildDiff(backend, request);
  if (built.kind !== 'ok') return built;
  try {
    const html = renderToStaticMarkup(
      <DiffBox
        value={built.value}
        title={request.title}
        height={request.height}
        palette={request.palette}
        minimap={request.minimap}
        idPrefix={`rvs-${request.key}`}
      />,
    );
    if (html.length > MAX_STATIC_BYTES)
      return {
        kind: 'skip',
        reason: `its static SVG would be ${(html.length / 1024 / 1024).toFixed(1)} MB (the limit is 1.5 MB)`,
      };
    return { kind: 'ok', html, payload: { ...built.value.payload, changes: built.value.changes } };
  } catch (err) {
    return {
      kind: 'error',
      message: `This diff could not be rendered: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * `backend` with `renderDiff`, the way `createSsrBackend` (src/ssr/server.tsx) offers it to
 * `@theme/DbmlDiff`.
 */
export function withDiff<B extends SsrBackend>(
  backend: B & Pick<DiffBackend, 'layoutDiagram'>,
): B & { renderDiff(request: DiffRequest): Promise<DiffResult> } {
  return { ...backend, renderDiff: (request: DiffRequest) => renderDiff(backend, request) };
}
