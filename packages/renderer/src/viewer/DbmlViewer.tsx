import {
  DEFAULT_VIEW,
  compileDbml,
  selectView,
  type Box,
  type CompileInput,
  type DetailLevel,
  type DiagramGeometry,
  type DiagramModel,
  type Diagnostic,
  type Layout,
} from '@relvista/core';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import {
  DiagramCanvasInternal,
  MAX_FIT_ZOOM,
  FIT_FLOOR_NARROW,
  MINIMAP_NARROW,
  NARROW,
  PAD,
  type DiagramCanvasHandle,
} from '../canvas/DiagramCanvas.js';
import { createEditorLink, entrySource } from '../share/editorLink.js';
import type { EdgeStyle } from '../svg/routing.js';
import type { ColorMode } from '../theme.js';
import { AlertIcon } from './icons.js';
import { DEFAULT_TOOLBAR, Toolbar, type ExportKind, type ToolbarItem } from './Toolbar.js';

export interface DbmlViewerProps {
  /** DBML source, or `{ files, entry }` for a multi-file project. */
  source: CompileInput;
  /** Parsed layout file; saved positions of the active view are honoured. */
  layout?: Layout | null;
  /** DiagramView name; default all tables. */
  view?: string;
  /** Height of the viewer (number = px). Default 480. */
  height?: number | string;
  colorMode?: ColorMode;
  title?: string;
  toolbar?: ToolbarItem[];
  /** Base URL of the editor for "open in editor" (the DBML goes into `#dbml=`). */
  editorUrl?: string;
  onDiagnostics?: (diagnostics: Diagnostic[]) => void;
  /** Nodes can be dragged (positions are not persisted). Default true. */
  draggable?: boolean;
  /** Overrides `layout.settings.detailLevel`. */
  detailLevel?: DetailLevel;
  /** Overrides `layout.settings.theme.edgeStyle`. Default orthogonal. */
  edgeStyle?: EdgeStyle;
  /**
   * Show the minimap. Default 'auto': shown whenever part of the diagram is off-screen, and
   * always for diagrams of 8 or more tables in viewers at least 600px wide (smaller below that).
   */
  minimap?: boolean | 'auto';
  /**
   * URL of `elkjs/lib/elk-worker.min.js`; when set (and `Worker` exists) auto-layout runs in a Web
   * Worker. Without it ELK runs in-process.
   */
  workerUrl?: string | URL;
  className?: string;
  style?: CSSProperties;
}

/** A title such as `schema.dbml` without its file extension, for export file names. */
export function exportBaseName(name: string): string {
  return name.replace(/\.dbml(\.layout\.json)?$/i, '') || name;
}

/** Errors in source order (file, line, column). */
export function sortDiagnostics(list: readonly Diagnostic[]): Diagnostic[] {
  return [...list].sort(
    (a, b) =>
      (a.file ?? '').localeCompare(b.file ?? '') ||
      a.start.line - b.start.line ||
      a.start.column - b.start.column,
  );
}

function sourceKey(source: CompileInput): string {
  return typeof source === 'string' ? source : JSON.stringify([source.entry, source.files]);
}

function diagnosticLabel(d: Diagnostic, multiFile: boolean): string {
  return `${multiFile ? `${d.file}:` : ''}${d.start.line}:${d.start.column}`;
}

/**
 * Interactive diagram viewer (browser only; React Flow inside): compiles the source and shows it
 * on a read-only `DiagramCanvas` with a toolbar, title, error banner and empty states. Nothing
 * here touches `window` at import time, so the module can be imported during SSR; render it on
 * the client only.
 */
export function DbmlViewer({
  source,
  layout = null,
  view,
  height = 480,
  colorMode = 'light',
  title,
  toolbar = DEFAULT_TOOLBAR,
  editorUrl,
  onDiagnostics,
  draggable = true,
  detailLevel,
  edgeStyle,
  minimap = 'auto',
  workerUrl,
  className,
  style,
}: DbmlViewerProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvas = useRef<DiagramCanvasHandle>(null);

  // --- compile, keeping the last good model -------------------------------------------------
  const key = sourceKey(source);
  const compiled = useMemo(() => compileDbml(source), [key]);
  const [good, setGood] = useState<DiagramModel | null>(compiled.model);
  if (compiled.model && compiled.model !== good) setGood(compiled.model);
  const model = compiled.model ?? good;
  const errors = useMemo(
    () => sortDiagnostics(compiled.diagnostics.filter((d) => d.severity === 'error')),
    [compiled],
  );

  const diagRef = useRef(onDiagnostics);
  diagRef.current = onDiagnostics;
  useEffect(() => {
    diagRef.current?.(compiled.diagnostics);
  }, [compiled]);

  // --- size (narrow chrome, height on phones) ------------------------------------------------
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0)
        setSize((s) =>
          s && Math.abs(s.width - r.width) < 1 && Math.abs(s.height - r.height) < 1
            ? s
            : { width: r.width, height: r.height },
        );
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = !!size && size.width < NARROW;

  // --- view ----------------------------------------------------------------------------------
  const [viewName, setViewName] = useState(view ?? DEFAULT_VIEW);
  useEffect(() => setViewName(view ?? DEFAULT_VIEW), [view]);
  const onUnknownView = useCallback((name: string) => {
    console.warn(`relvista: unknown view "${name}"; showing all tables`);
    setViewName(DEFAULT_VIEW);
  }, []);
  const known = !model || viewName === DEFAULT_VIEW || model.views.some((v) => v.name === viewName);
  const activeView = known ? viewName : DEFAULT_VIEW;
  const viewModel = useMemo(
    () => (model && activeView !== DEFAULT_VIEW ? (selectView(model, activeView) ?? model) : model),
    [model, activeView],
  );
  const viewNames = useMemo(() => model?.views.map((v) => v.name) ?? [], [model]);
  const emptyView =
    !!viewModel && viewModel.tables.length === 0 && viewModel.stickyNotes.length === 0;

  // --- canvas status and geometry ------------------------------------------------------------
  const [status, setStatus] = useState<'pending' | 'done'>('pending');
  const [bounds, setBounds] = useState<Box | null>(null);
  const onGeometry = useCallback((g: DiagramGeometry | null) => setBounds(g ? g.bounds : null), []);
  // The title chip sits at the bottom on narrow screens.
  const padding = useMemo(
    () => (narrow && title ? { bottom: PAD.bottom + 36 } : undefined),
    [narrow, title],
  );

  // --- fullscreen ----------------------------------------------------------------------------
  const [nativeFs, setNativeFs] = useState(false);
  const [overlay, setOverlay] = useState(false);
  useEffect(() => {
    const on = () =>
      setNativeFs(!!rootRef.current && document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  useEffect(() => {
    if (!overlay) return;
    const onKey = (e: KeyboardEvent) => {
      // An open menu or card handles Esc first (it calls preventDefault): one layer per press.
      if (e.key === 'Escape' && !e.defaultPrevented) setOverlay(false);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [overlay]);
  const fullscreen = nativeFs || overlay;
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
      return;
    }
    if (overlay) {
      setOverlay(false);
      return;
    }
    const el = rootRef.current;
    if (el && typeof el.requestFullscreen === 'function') {
      el.requestFullscreen().catch(() => setOverlay(true));
    } else setOverlay(true);
  }, [overlay]);
  const firstFs = useRef(true);
  useEffect(() => {
    if (firstFs.current) {
      firstFs.current = false;
      return;
    }
    const t = setTimeout(() => canvas.current?.fitView({ duration: 200 }), 60);
    return () => clearTimeout(t);
  }, [fullscreen]);

  // --- export / print ------------------------------------------------------------------------
  const fileName = exportBaseName((title ?? model?.project?.name ?? 'diagram').trim()) || 'diagram';
  const onExport = useCallback(
    async (kind: ExportKind) => {
      const c = canvas.current;
      if (!c) return;
      try {
        const ex = await import('../export/download.js');
        const name = ex.fileSlug(fileName);
        const opts = title ? { title } : {};
        if (kind === 'svg') {
          const svg = c.exportSvg(opts);
          if (svg) ex.downloadSvg(svg, `${name}.svg`);
        } else {
          const blob = await c.exportPng({ ...opts, scale: 2 });
          if (blob) ex.downloadBlob(blob, `${name}.png`);
        }
      } catch (err) {
        console.error('relvista: export failed', err);
      }
    },
    [fileName, title],
  );
  const onPrint = useCallback(() => canvas.current?.print(title ? { title } : {}), [title]);

  // --- editor link ---------------------------------------------------------------------------
  const multiFile = typeof source !== 'string';
  // The editor link carries one DBML text; a multi-file project (`use` imports) cannot travel in
  // it yet, so the button is hidden for those. Encoding is async (compression).
  const [editorHref, setEditorHref] = useState<{ for: string; href: string } | null>(null);
  const linkKey =
    editorUrl && !multiFile ? JSON.stringify([editorUrl, key, activeView, layout]) : null;
  useEffect(() => {
    if (!linkKey || !editorUrl) return;
    let alive = true;
    createEditorLink(editorUrl, {
      dbml: entrySource(source),
      layout,
      view: activeView === DEFAULT_VIEW ? null : activeView,
    }).then(
      (href) => alive && setEditorHref({ for: linkKey, href }),
      (err: unknown) => console.error('relvista: could not build the editor link', err),
    );
    return () => {
      alive = false;
    };
  }, [linkKey]);
  const href = linkKey && editorHref?.for === linkKey ? editorHref.href : null;

  // On narrow screens a wide diagram would sit in a tall, mostly empty box: shrink the viewer to
  // what the diagram needs at its initial zoom (never taller than asked).
  let cssHeight: string = typeof height === 'number' ? `${height}px` : height;
  if (narrow && typeof height === 'number' && size && bounds && !fullscreen) {
    const b = bounds;
    const base = { ...PAD, ...padding };
    const aw = size.width - base.left - base.right;
    if (b.width > 0 && b.height > 0) {
      const z = Math.max(FIT_FLOOR_NARROW, Math.min(aw / b.width, MAX_FIT_ZOOM));
      // A diagram wider than the viewer gets the 'auto' minimap (the off-screen cue): room for it.
      const showMinimap = minimap === true || (minimap === 'auto' && b.width * z > aw + 1);
      const pad = showMinimap
        ? { ...base, bottom: base.bottom + MINIMAP_NARROW.height + MINIMAP_NARROW.margin }
        : base;
      const need = Math.ceil(b.height * z + pad.top + pad.bottom);
      cssHeight = `${Math.min(height, Math.max(280, need))}px`;
    }
  }
  const rootStyle: CSSProperties = { ...style, height: fullscreen ? '100%' : cssHeight };

  return (
    <div
      ref={rootRef}
      className={[
        'rv-viewer',
        overlay ? 'rv-viewer--overlay' : '',
        nativeFs ? 'rv-viewer--fullscreen' : '',
        narrow ? 'rv-viewer--narrow' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-rv-color-mode={colorMode}
      data-rv-layout={status}
      style={rootStyle}
    >
      <DiagramCanvasInternal
        handleRef={canvas}
        model={model}
        view={viewName}
        onUnknownView={onUnknownView}
        layout={layout}
        draggable={draggable}
        colorMode={colorMode}
        {...(detailLevel ? { detailLevel } : {})}
        {...(edgeStyle ? { edgeStyle } : {})}
        minimap={minimap}
        {...(workerUrl ? { workerUrl } : {})}
        resetKey={key}
        onLayoutStatus={setStatus}
        onGeometry={onGeometry}
        {...(padding ? { padding } : {})}
        ariaLabel={title ?? 'Entity-relationship diagram'}
      />

      {title ? (
        <div className="rv-title" title={title}>
          {title}
        </div>
      ) : null}

      {toolbar.length ? (
        <Toolbar
          items={toolbar}
          onZoomIn={() => canvas.current?.zoomIn()}
          onZoomOut={() => canvas.current?.zoomOut()}
          onFit={() => canvas.current?.fitView({ duration: 250 })}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
          onExport={(k) => void onExport(k)}
          onPrint={onPrint}
          views={viewNames}
          view={activeView}
          onViewChange={setViewName}
          editorHref={href}
        />
      ) : null}

      {errors.length ? (
        <div className="rv-banner" role="alert">
          <AlertIcon />
          <div className="rv-banner-body">
            <strong>
              {model
                ? 'The DBML has errors. Showing the last valid diagram.'
                : 'The DBML has errors.'}
            </strong>
            <ul>
              {errors.slice(0, 5).map((d, i) => (
                <li key={i}>
                  <code>{diagnosticLabel(d, multiFile)}</code> {d.message}
                </li>
              ))}
              {errors.length > 5 ? <li>and {errors.length - 5} more</li> : null}
            </ul>
          </div>
        </div>
      ) : null}

      {!model ? (
        <div className="rv-empty">No diagram to show</div>
      ) : emptyView ? (
        <div className="rv-empty">
          {activeView !== DEFAULT_VIEW
            ? `The view “${activeView}” has no tables.`
            : 'No tables yet.'}
        </div>
      ) : null}
    </div>
  );
}
