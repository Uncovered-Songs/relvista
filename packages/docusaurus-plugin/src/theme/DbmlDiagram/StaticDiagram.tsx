import { Component, Suspense, lazy, useMemo, type ReactNode } from 'react';
import { useLocation } from '@docusaurus/router';
import relvistaSsr from 'relvista-ssr-files';
import type { SsrBackend, SsrPayload, StaticRequest, StaticResult } from '../../ssr/types.js';

/**
 * The static layer of a diagram (docs/design/phase3-v1.md §5.1): the SVG drawn at build time, in
 * the page's HTML, so it shows without JavaScript, before it loads, in print and to crawlers.
 *
 * - Server: suspends on a module-level cache of build results by `key` (Docusaurus waits for
 *   `onAllReady`, so the HTML has the SVG) and writes the markup plus a JSON script with the
 *   build-time positions.
 * - Client, hydrating: renders the server's markup back unchanged (read from the DOM), and reads
 *   the positions for the interactive viewer (`ssrPayload`).
 * - Client, after a client-side navigation (no server markup): the static SVG from the sync
 *   layout when no ELK is needed, else the loading placeholder.
 */

type Entry =
  { status: 'pending'; promise: Promise<void> } | { status: 'done'; result: StaticResult };

/** Build results by key, shared by every page of the build. */
const builds = new Map<string, Entry>();

function buildResult(backend: SsrBackend, request: StaticRequest): StaticResult {
  const hit = builds.get(request.key);
  if (hit?.status === 'done') return hit.result;
  if (hit) throw hit.promise;
  const promise = backend.renderStatic(request).then(
    (result) => void builds.set(request.key, { status: 'done', result }),
    (err: unknown) =>
      void builds.set(request.key, {
        status: 'done',
        result: { kind: 'error', message: err instanceof Error ? err.message : String(err) },
      }),
  );
  builds.set(request.key, { status: 'pending', promise });
  throw promise;
}

const warned = new Set<string>();

/** One `[relvista]` build warning per diagram and page. */
export function warnOnce(
  page: string,
  request: Pick<StaticRequest, 'key' | 'title' | 'src'>,
  message: string,
): void {
  const id = `${page}\u0000${request.key}`;
  if (warned.has(id)) return;
  warned.add(id);
  const what = request.title ? `"${request.title}"` : request.src ? request.src : 'a diagram';
  console.warn(`[relvista] ${page}: ${what}: ${message}`);
}

/** Escapes the JSON for a `<script>` element (no `</script>` inside). */
export function scriptJson(payload: SsrPayload): string {
  return JSON.stringify(payload).replace(/</g, '\\u003c');
}

export interface ServerMarkup {
  /** Inner HTML of the static layer. */
  html: string;
  /** Text of its JSON script, if any. */
  json: string | null;
}

const fromServer = new Map<string, ServerMarkup>();
const payloads = new Map<string, SsrPayload>();

function readServerMarkup(key: string): ServerMarkup | null {
  const hit = fromServer.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const host = document.querySelector(`.relvista-static[data-rv-static="${key}"]`);
  if (!host) return null;
  const script = document.querySelector(`script[data-rv-ssr="${key}"]`);
  const markup: ServerMarkup = { html: host.innerHTML, json: script?.textContent ?? null };
  fromServer.set(key, markup);
  if (markup.json) {
    try {
      const payload = JSON.parse(markup.json) as SsrPayload;
      if (payload && payload.v === 1 && payload.positions) payloads.set(key, payload);
    } catch {
      // A broken script only costs the positions: the viewer lays out itself.
    }
  }
  return markup;
}

/**
 * The server's markup of the static diagram `key` in this page's HTML (read once, then cached), or
 * null: on the server, after a client-side navigation, or when SSR was off.
 */
export function serverMarkup(key: string): ServerMarkup | null {
  return readServerMarkup(key);
}

/**
 * Build-time positions of the diagram `key` from the page's HTML, or null (client-side
 * navigation, SSR off, a diagram that failed at build time).
 */
export function ssrPayload(key: string): SsrPayload | null {
  readServerMarkup(key);
  return payloads.get(key) ?? null;
}

const ClientStatic = lazy(
  () => import(/* webpackChunkName: "relvista-viewer" */ './ClientStatic.js'),
);

/** A static picture that cannot be drawn only means the placeholder shows a moment longer. */
class QuietBoundary extends Component<{ fallback: ReactNode; children: ReactNode }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface StaticDiagramProps {
  request: StaticRequest;
  /** The interactive viewer has its final layout: hide the static layer (kept for print). */
  hidden: boolean;
  placeholder: ReactNode;
  problem: (message: string) => ReactNode;
}

export default function StaticDiagram({
  request,
  hidden,
  placeholder,
  problem,
}: StaticDiagramProps): ReactNode {
  const { key } = request;
  const { pathname } = useLocation();
  const server = useMemo(() => readServerMarkup(key), [key]);
  const backend = typeof document === 'undefined' ? (relvistaSsr() as SsrBackend | null) : null;
  const hostProps = {
    className: 'relvista-static',
    'data-rv-static': key,
    'aria-hidden': hidden ? ('true' as const) : ('false' as const),
    ...(hidden ? { hidden: true } : {}),
  };

  if (backend) {
    const result = buildResult(backend, request);
    if (result.kind === 'ok') {
      return (
        <>
          <div {...hostProps} dangerouslySetInnerHTML={{ __html: result.html }} />
          <script
            type="application/json"
            data-rv-ssr={key}
            dangerouslySetInnerHTML={{ __html: scriptJson(result.payload) }}
          />
        </>
      );
    }
    if (result.kind === 'error') warnOnce(pathname, request, result.message);
    else if (result.reason)
      warnOnce(pathname, request, `not drawn at build time: ${result.reason}`);
    return (
      <div {...hostProps}>{result.kind === 'error' ? problem(result.message) : placeholder}</div>
    );
  }

  if (server) {
    // Hydration: exactly the server's markup, so nothing is re-rendered or moves.
    return (
      <>
        <div
          {...hostProps}
          dangerouslySetInnerHTML={{ __html: server.html }}
          suppressHydrationWarning
        />
        {server.json !== null ? (
          <script
            type="application/json"
            data-rv-ssr={key}
            dangerouslySetInnerHTML={{ __html: server.json }}
            suppressHydrationWarning
          />
        ) : null}
      </>
    );
  }

  // Client-side navigation: the page's HTML was not built for this render.
  const drawable =
    request.value !== undefined && (request.layout == null || typeof request.layout === 'object');
  return (
    <div {...hostProps}>
      {drawable ? (
        <QuietBoundary fallback={placeholder}>
          <Suspense fallback={placeholder}>
            <ClientStatic request={request} placeholder={placeholder} />
          </Suspense>
        </QuietBoundary>
      ) : (
        placeholder
      )}
    </div>
  );
}
