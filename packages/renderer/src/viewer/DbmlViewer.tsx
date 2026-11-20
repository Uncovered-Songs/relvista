import {
  DEFAULT_VIEW,
  compileDbml,
  mergeViewDefaults,
  selectView,
  type CompileInput,
  type DetailLevel,
  type DiagramGeometry,
  type DiagramModel,
  type Diagnostic,
  type Layout,
  type LayoutOptions,
  type ViewLayout,
  type ViewLayoutOverride,
} from '@relvista/core';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type NodeMouseHandler,
  type OnNodesChange,
} from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react';
import { layoutAsync, layoutSync, moveNodes } from '../geometry.js';
import { ColorContext } from '../svg/context.js';
import { highlightSets, nodeDetail, routeAll, rowIndexOf, type EdgeStyle } from '../svg/routing.js';
import { colorResolver, safeColor, type ColorMode } from '../theme.js';
import { ViewerContext, handleId, type ViewerState } from './context.js';
import { editorLink } from './editorLink.js';
import { AlertIcon } from './icons.js';
import { nodeTypes, type FlowNode, type GroupFlowNode } from './nodes.js';
import { fitViewport, initialViewport, type Padding } from './initialView.js';
import { edgeTypes, type RefFlowEdge } from './RefEdge.js';
import { SideCard } from './SideCard.js';
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
   * Show the minimap. Default 'auto': shown for diagrams of 8 or more tables in viewers at least
   * 600px wide.
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

/**
 * Interactive diagram viewer (browser only; React Flow inside). Nothing here touches `window` at
 * import time, so the module can be imported during SSR; render it on the client only.
 */
export function DbmlViewer(props: DbmlViewerProps): ReactElement {
  return (
    <ReactFlowProvider>
      <ViewerInner {...props} />
    </ReactFlowProvider>
  );
}

/** Room for the title and toolbar overlays at the top, a small margin elsewhere. */
const PAD = { top: 64, right: 28, bottom: 28, left: 28 } as const;
/** Minimap size (px) and its distance from the viewer's bottom-right corner. */
const MINIMAP = { width: 120, height: 80, margin: 12 } as const;
/** Below this width the viewer counts as narrow (phones): no minimap, compact chrome. */
const NARROW = 600;
/** Fewest tables for the 'auto' minimap. */
const MINIMAP_MIN_TABLES = 8;
/**
 * The first view never zooms out further than this (column text at 12.5 × 0.85 ≈ 10.6px); bigger
 * diagrams open readable on their densest corner and pan. Phones get a little more overview.
 */
const MIN_INITIAL_ZOOM = 0.85;
const MIN_INITIAL_ZOOM_NARROW = 0.75;
const MAX_FIT_ZOOM = 1.25;

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

function hasAllPositions(model: DiagramModel, saved: ViewLayoutOverride | null): boolean {
  if (!saved) return false;
  const ok = (id: string) => {
    const n = saved.nodes[id];
    return !!n && typeof n.x === 'number' && typeof n.y === 'number';
  };
  return model.tables.every((t) => ok(t.id)) && model.stickyNotes.every((n) => ok(n.id));
}

/** Sync (dagre) geometry first, then the async (ELK) result when it arrives. */
function useGeometry(
  model: DiagramModel | null,
  saved: ViewLayoutOverride | null,
  detailLevel: DetailLevel,
  aspectRatio: number | undefined,
  workerUrl?: string | URL,
): { geometry: DiagramGeometry | null; final: boolean } {
  const options = useMemo<LayoutOptions>(
    () => ({
      detailLevel,
      saved: saved as Partial<ViewLayout> | null,
      ...(aspectRatio ? { aspectRatio } : {}),
    }),
    [detailLevel, saved, aspectRatio],
  );
  const runs = useRef(0);
  const sync = useMemo(() => (model ? layoutSync(model, options) : null), [model, options]);
  const [late, setLate] = useState<{
    for: DiagramGeometry;
    geometry: DiagramGeometry | null;
  } | null>(null);
  useEffect(() => {
    if (!model || !sync || hasAllPositions(model, saved)) return;
    let alive = true;
    const run = () => {
      let p: Promise<DiagramGeometry> | null = null;
      try {
        p = layoutAsync(model, { ...options, engine: 'elk', ...(workerUrl ? { workerUrl } : {}) });
      } catch {
        p = null;
      }
      p?.then(
        (geometry) => {
          if (alive) setLate({ for: sync, geometry });
        },
        () => {
          // keep the sync layout
          if (alive) setLate({ for: sync, geometry: null });
        },
      );
      if (!p) setLate({ for: sync, geometry: null });
    };
    // The first layout starts at once; later ones (typing in an editor, switching views quickly)
    // wait a moment so superseded ELK runs are never started.
    const t = runs.current++ === 0 ? null : setTimeout(run, 150);
    if (!t) run();
    return () => {
      alive = false;
      if (t) clearTimeout(t);
    };
  }, [model, sync, saved, options, workerUrl]);
  const done = !!late && late.for === sync;
  const final = !sync || !model || hasAllPositions(model, saved) || done;
  return { geometry: (done ? late.geometry : null) ?? sync, final };
}

function buildNodes(
  model: DiagramModel,
  geometry: DiagramGeometry,
  draggable: boolean,
): FlowNode[] {
  const out: FlowNode[] = [];
  for (const n of model.stickyNotes) {
    const g = geometry.nodes[n.id];
    if (!g) continue;
    out.push({
      id: n.id,
      type: 'rvNote',
      position: { x: g.x, y: g.y },
      width: g.width,
      height: g.height,
      data: { note: n, w: g.width, h: g.height },
      draggable,
      selectable: false,
      connectable: false,
      deletable: false,
      focusable: false,
    });
  }
  for (const t of model.tables) {
    const g = geometry.nodes[t.id];
    if (!g) continue;
    out.push({
      id: t.id,
      type: 'rvTable',
      position: { x: g.x, y: g.y },
      width: g.width,
      height: g.height,
      data: {
        table: t,
        w: g.width,
        h: g.height,
        ...(g.detailLevel ? { detail: g.detailLevel } : {}),
      },
      draggable,
      selectable: false,
      connectable: false,
      deletable: false,
      focusable: true,
      ariaLabel: `Table ${t.name}. Press Enter for details.`,
    });
  }
  return out;
}

function diagnosticLabel(d: Diagnostic, multiFile: boolean): string {
  return `${multiFile ? `${d.file}:` : ''}${d.start.line}:${d.start.column}`;
}

function ViewerInner({
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
  const rf = useReactFlow<Node, RefFlowEdge>();
  const rootRef = useRef<HTMLDivElement>(null);

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

  // --- size (minimap, initial zoom, packing) ------------------------------------------------
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
  // The viewport shape the layout packs for: taken once (re-packing on every resize would move
  // the tables around under the user), at a coarse step so near-equal sizes share a layout.
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  if (aspect === undefined && size) {
    const avail = {
      w: size.width - PAD.left - PAD.right,
      h: Math.max(1, size.height - PAD.top - PAD.bottom),
    };
    setAspect(Math.round((avail.w / avail.h) * 4) / 4 || 0.25);
  }
  const narrow = !!size && size.width < NARROW;

  // --- view ----------------------------------------------------------------------------------
  const [viewName, setViewName] = useState(view ?? DEFAULT_VIEW);
  useEffect(() => setViewName(view ?? DEFAULT_VIEW), [view]);
  const unknownView =
    !!model && viewName !== DEFAULT_VIEW && !model.views.some((v) => v.name === viewName);
  useEffect(() => {
    if (!unknownView) return;
    console.warn(`relvista: unknown view "${viewName}"; showing all tables`);
    setViewName(DEFAULT_VIEW);
  }, [unknownView, viewName]);
  const viewModel = useMemo(
    () => (model && viewName !== DEFAULT_VIEW ? (selectView(model, viewName) ?? model) : model),
    [model, viewName],
  );
  const viewNames = useMemo(() => model?.views.map((v) => v.name) ?? [], [model]);
  const emptyView =
    !!viewModel && viewModel.tables.length === 0 && viewModel.stickyNotes.length === 0;

  // --- layout --------------------------------------------------------------------------------
  const detail: DetailLevel = detailLevel ?? layout?.settings?.detailLevel ?? 'all';
  const edges_: EdgeStyle = edgeStyle ?? layout?.settings?.theme?.edgeStyle ?? 'orthogonal';
  const saved = useMemo(
    () => (layout ? mergeViewDefaults(layout, viewName) : null),
    [layout, viewName],
  );
  const { geometry, final: layoutFinal } = useGeometry(
    viewModel,
    saved,
    detail,
    // Saved positions keep their own arrangement; packing only matters for auto-layout.
    aspect,
    workerUrl,
  );

  // --- nodes (dragging moves them; never persisted) ------------------------------------------
  const baseNodes = useMemo(
    () => (viewModel && geometry ? buildNodes(viewModel, geometry, draggable) : []),
    [viewModel, geometry, draggable],
  );
  const [nodes, setNodes] = useState<FlowNode[]>(baseNodes);
  const [nodesFor, setNodesFor] = useState(baseNodes);
  if (nodesFor !== baseNodes) {
    setNodesFor(baseNodes);
    setNodes(baseNodes);
  }
  const onNodesChange = useCallback<OnNodesChange<FlowNode>>(
    (changes) => setNodes((ns) => changes.applyTo(ns)),
    [],
  );

  const current = useMemo(() => {
    if (!viewModel || !geometry) return null;
    return moveNodes(viewModel, geometry, new Map(nodes.map((n) => [n.id, n.position])));
  }, [viewModel, geometry, nodes]);

  const routes = useMemo(
    () =>
      viewModel && current
        ? routeAll({ model: viewModel, geometry: current, detailLevel: detail, edgeStyle: edges_ })
        : new Map(),
    [viewModel, current, detail, edges_],
  );

  // Every row a ref attaches to gets handles on both sides and of both types. The set depends
  // only on the model, so it is stable while dragging flips sides (React Flow measures handles
  // when a node mounts).
  const handles = useMemo(() => {
    const out = new Map<string, Set<string>>();
    if (!viewModel || !geometry) return out;
    const tables = new Map(viewModel.tables.map((t) => [t.id, t]));
    const add = (tableId: string, column: string | undefined) => {
      const t = tables.get(tableId);
      if (!t) return;
      const row = rowIndexOf(t, column, nodeDetail(geometry, tableId, detail));
      let s = out.get(tableId);
      if (!s) out.set(tableId, (s = new Set()));
      for (const side of ['left', 'right'] as const)
        for (const type of ['source', 'target'] as const) s.add(handleId(row, side, type));
    };
    for (const r of viewModel.refs) {
      add(r.from.tableId, r.from.columns[0]);
      add(r.to.tableId, r.to.columns[0]);
    }
    return out;
  }, [viewModel, geometry, detail]);

  const edges = useMemo(() => {
    const edges: RefFlowEdge[] = [];
    for (const r of viewModel?.refs ?? []) {
      const route = routes.get(r.id);
      if (!route) continue;
      edges.push({
        id: r.id,
        type: 'rvRef',
        source: r.from.tableId,
        target: r.to.tableId,
        sourceHandle: handleId(route.from.row, route.from.side, 'source'),
        targetHandle: handleId(route.to.row, route.to.side, 'target'),
        data: { refModel: r, route },
        selectable: false,
        focusable: false,
        deletable: false,
      });
    }
    return edges;
  }, [viewModel, routes]);

  const groupNodes = useMemo<GroupFlowNode[]>(() => {
    if (!viewModel || !current) return [];
    const out: GroupFlowNode[] = [];
    for (const g of viewModel.groups) {
      const box = current.groups[g.id];
      if (!box) continue;
      out.push({
        id: g.id,
        type: 'rvGroup',
        position: { x: box.x, y: box.y },
        width: box.width,
        height: box.height,
        data: { group: g, w: box.width, h: box.height },
        draggable: false,
        selectable: false,
        connectable: false,
        focusable: false,
        deletable: false,
        zIndex: -1,
        className: 'rv-group-node',
      });
    }
    return out;
  }, [viewModel, current]);

  const allNodes = useMemo<FlowNode[]>(() => [...groupNodes, ...nodes], [groupNodes, nodes]);

  // --- hover / selection ---------------------------------------------------------------------
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const lit = useMemo(
    () => (viewModel && hovered ? highlightSets(viewModel, [hovered]) : null),
    [viewModel, hovered],
  );
  const onEnter = useCallback<NodeMouseHandler<FlowNode>>((_, n) => {
    if (n.type !== 'rvGroup') setHovered(n.id);
  }, []);
  const onLeave = useCallback<NodeMouseHandler<FlowNode>>(() => setHovered(null), []);
  const onClick = useCallback<NodeMouseHandler<FlowNode>>((_, n) => {
    if (n.type === 'rvTable') setSelected((s) => (s === n.id ? null : n.id));
  }, []);
  // Keyboard: Tab reaches table nodes (React Flow wrappers carry data-id); Enter/Space opens the
  // details card.
  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target as HTMLElement;
      if (!el.classList?.contains('react-flow__node-rvTable')) return;
      const id = el.getAttribute('data-id');
      if (!id || !viewModel?.tables.some((t) => t.id === id)) return;
      e.preventDefault();
      setSelected((s) => (s === id ? null : id));
    },
    [viewModel],
  );
  const selectedTable = selected ? viewModel?.tables.find((t) => t.id === selected) : undefined;

  const viewerState = useMemo<ViewerState>(
    () => ({
      detailLevel: detail,
      lit,
      hoveredId: hovered,
      selectedId: selectedTable ? selected : null,
      handles,
    }),
    [detail, lit, hovered, selected, selectedTable, handles],
  );
  const colors = useMemo(() => colorResolver(colorMode), [colorMode]);

  // --- minimap ---------------------------------------------------------------------------------
  const tableCount = viewModel?.tables.length ?? 0;
  const showMinimap =
    minimap === true ||
    (minimap === 'auto' && !!size && !narrow && tableCount >= MINIMAP_MIN_TABLES);
  const padding = useMemo<Padding>(
    () =>
      showMinimap
        ? { ...PAD, bottom: PAD.bottom + MINIMAP.height + MINIMAP.margin }
        : narrow && title
          ? { ...PAD, bottom: PAD.bottom + 36 } // the title chip sits at the bottom
          : PAD,
    [showMinimap, narrow, title],
  );

  // --- viewport ------------------------------------------------------------------------------
  const minZoom = narrow ? MIN_INITIAL_ZOOM_NARROW : MIN_INITIAL_ZOOM;
  const viewerSize = useCallback(() => {
    const el = rootRef.current;
    return { width: el?.clientWidth ?? 0, height: el?.clientHeight ?? 0 };
  }, []);
  // Read through a ref so `fit` keeps its identity while tables are dragged.
  const currentRef = useRef(current);
  currentRef.current = current;
  /** Shows the whole diagram (the Fit button), centred in the area the overlays leave free. */
  const fit = useCallback(
    (duration = 200, g: DiagramGeometry | null = currentRef.current) => {
      const vp = g
        ? fitViewport({ bounds: g.bounds, ...viewerSize(), padding, maxZoom: MAX_FIT_ZOOM })
        : null;
      if (vp) void rf.setViewport(vp, { duration });
      else void rf.fitView({ maxZoom: MAX_FIT_ZOOM, duration });
    },
    [rf, padding, viewerSize],
  );
  /**
   * Initial view: the fit, but never below the readable floor; a bigger diagram opens at that zoom
   * on the window showing the most whole tables (see `initialViewport`). Fit shows everything.
   */
  const initialView = useCallback(
    (g: DiagramGeometry, duration: number) => {
      const size = viewerSize();
      // The minimap only takes the bottom-right corner: a first view that cannot show everything
      // uses the full height and keeps tables out from under it.
      const minimapBox = {
        x: size.width - MINIMAP.margin - MINIMAP.width,
        y: size.height - MINIMAP.margin - MINIMAP.height,
        width: MINIMAP.width,
        height: MINIMAP.height,
      };
      const vp = initialViewport({
        bounds: g.bounds,
        nodes: Object.values(g.nodes),
        groups: Object.values(g.groups),
        ...size,
        fitPadding: padding,
        padding: showMinimap ? { ...padding, bottom: PAD.bottom } : padding,
        ...(showMinimap ? { obstacles: [minimapBox] } : {}),
        maxZoom: MAX_FIT_ZOOM,
        minZoom,
      });
      if (vp) void rf.setViewport(vp, { duration });
      else fit(duration, g);
    },
    [rf, fit, padding, minZoom, viewerSize, showMinimap],
  );
  const fitted = useRef(false);
  /** The (view model, saved layout) a saved viewport was applied for. */
  const savedViewportFor = useRef<{ model: DiagramModel | null; saved: unknown } | null>(null);
  useEffect(() => {
    if (!geometry) return;
    const first = !fitted.current;
    fitted.current = true;
    const applySaved = first && !!saved?.viewport;
    if (applySaved) savedViewportFor.current = { model: viewModel, saved };
    // The ELK result replacing the first (sync) layout of the same view keeps a saved viewport;
    // switching views or changing the source fits again.
    const keepSaved =
      !first &&
      savedViewportFor.current?.model === viewModel &&
      savedViewportFor.current?.saved === saved;
    const t = setTimeout(() => {
      if (applySaved && saved?.viewport) void rf.setViewport(saved.viewport);
      else if (!keepSaved) initialView(geometry, first ? 0 : 250);
    }, 0);
    return () => clearTimeout(t);
    // Refit when the layout changes (sync → ELK, view switch), not on every drag.
  }, [geometry]);

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
    const t = setTimeout(() => fit(200), 60);
    return () => clearTimeout(t);
  }, [fullscreen, fit]);

  // --- export / print ------------------------------------------------------------------------
  const exportOpts = useCallback(
    () => ({
      detailLevel: detail,
      edgeStyle: edges_,
      ...(title ? { title } : {}),
    }),
    [detail, edges_, title],
  );
  const fileName = exportBaseName((title ?? model?.project?.name ?? 'diagram').trim()) || 'diagram';
  const onExport = useCallback(
    async (kind: ExportKind) => {
      if (!viewModel || !current) return;
      try {
        const ex = await import('../export/index.js');
        const name = ex.fileSlug(fileName);
        if (kind === 'svg') {
          const svg = ex.renderDiagramSvgString(viewModel, current, { ...exportOpts(), colorMode });
          ex.downloadSvg(svg, `${name}.svg`);
        } else {
          const blob = await ex.exportPng(viewModel, current, {
            ...exportOpts(),
            colorMode,
            scale: 2,
          });
          ex.downloadBlob(blob, `${name}.png`);
        }
      } catch (err) {
        console.error('relvista: export failed', err);
      }
    },
    [viewModel, current, exportOpts, colorMode, fileName],
  );
  const onPrint = useCallback(async () => {
    if (!viewModel || !current) return;
    try {
      const ex = await import('../export/index.js');
      ex.printDiagram(viewModel, current, exportOpts());
    } catch (err) {
      console.error('relvista: print failed', err);
    }
  }, [viewModel, current, exportOpts]);

  const multiFile = typeof source !== 'string';
  // The editor link carries one DBML text; a multi-file project (`use` imports) cannot travel in
  // it yet, so the button is hidden for those.
  const editorHref = useMemo(
    () => (editorUrl && !multiFile ? editorLink(editorUrl, source) : null),
    [editorUrl, key, multiFile],
  );

  // On narrow screens a wide diagram would sit in a tall, mostly empty box: shrink the viewer to
  // what the diagram needs at its initial zoom (never taller than asked).
  let cssHeight: string = typeof height === 'number' ? `${height}px` : height;
  if (narrow && typeof height === 'number' && size && current && !fullscreen) {
    const b = current.bounds;
    const aw = size.width - padding.left - padding.right;
    if (b.width > 0 && b.height > 0) {
      const z = Math.max(minZoom, Math.min(aw / b.width, MAX_FIT_ZOOM));
      const need = Math.ceil(b.height * z + padding.top + padding.bottom);
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
      data-rv-layout={layoutFinal ? 'done' : 'pending'}
      style={rootStyle}
      onKeyDown={onKeyDown}
    >
      <ColorContext.Provider value={colors}>
        <ViewerContext.Provider value={viewerState}>
          <ReactFlow<FlowNode, RefFlowEdge>
            nodes={allNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onNodeMouseEnter={onEnter}
            onNodeMouseLeave={onLeave}
            onNodeClick={onClick}
            onPaneClick={() => setSelected(null)}
            nodesDraggable={draggable}
            nodesConnectable={false}
            nodesFocusable
            edgesFocusable={false}
            edgesReconnectable={false}
            elementsSelectable={false}
            deleteKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            zoomOnDoubleClick={false}
            minZoom={0.05}
            maxZoom={3}
            fitView
            fitViewOptions={{ maxZoom: MAX_FIT_ZOOM }}
            forceColorMode={colorMode}
            // MIT-licensed React Flow allows hiding it; it is credited in the README instead.
            proOptions={{ hideAttribution: true }}
            aria-label={title ?? 'Entity-relationship diagram'}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.2}
              color="var(--rv-grid-dot)"
              bgColor="var(--rv-canvas-bg)"
            />
            {showMinimap ? (
              <MiniMap<FlowNode>
                pannable
                zoomable
                className="rv-minimap"
                style={{ width: MINIMAP.width, height: MINIMAP.height }}
                offsetScale={2}
                ariaLabel="Diagram overview"
                nodeBorderRadius={3}
                nodeColor={(n) =>
                  n.type === 'rvTable'
                    ? (safeColor(n.data.table.headerColor) ?? 'var(--rv-header-bg)')
                    : n.type === 'rvNote'
                      ? 'var(--rv-note-border)'
                      : 'transparent'
                }
              />
            ) : null}
          </ReactFlow>
        </ViewerContext.Provider>
      </ColorContext.Provider>

      {title ? (
        <div className="rv-title" title={title}>
          {title}
        </div>
      ) : null}

      {toolbar.length ? (
        <Toolbar
          items={toolbar}
          onZoomIn={() => void rf.zoomIn({ duration: 150 })}
          onZoomOut={() => void rf.zoomOut({ duration: 150 })}
          onFit={() => fit(250)}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
          onExport={(k) => void onExport(k)}
          onPrint={() => void onPrint()}
          views={viewNames}
          view={viewName}
          onViewChange={setViewName}
          editorHref={editorHref}
        />
      ) : null}

      {selectedTable && viewModel ? (
        <SideCard table={selectedTable} model={viewModel} onClose={() => setSelected(null)} />
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
          {viewName !== DEFAULT_VIEW ? `The view “${viewName}” has no tables.` : 'No tables yet.'}
        </div>
      ) : null}
    </div>
  );
}
