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
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import { layoutAsync, layoutSync, moveNodes } from '../geometry.js';
import { ColorContext } from '../svg/context.js';
import { highlightSets, routeAll, rowIndexOf, type EdgeStyle } from '../svg/routing.js';
import { colorResolver, safeColor, type ColorMode } from '../theme.js';
import { ViewerContext, handleId, type ViewerState } from './context.js';
import { editorLink } from './editorLink.js';
import { AlertIcon } from './icons.js';
import { nodeTypes, type FlowNode, type GroupFlowNode } from './nodes.js';
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
  /** Show the minimap. Default true. */
  minimap?: boolean;
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
  workerUrl?: string | URL,
): DiagramGeometry | null {
  const options = useMemo<LayoutOptions>(
    () => ({ detailLevel, saved: saved as Partial<ViewLayout> | null }),
    [detailLevel, saved],
  );
  const sync = useMemo(() => (model ? layoutSync(model, options) : null), [model, options]);
  const [late, setLate] = useState<{ for: DiagramGeometry; geometry: DiagramGeometry } | null>(
    null,
  );
  useEffect(() => {
    if (!model || !sync || hasAllPositions(model, saved)) return;
    let alive = true;
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
      },
    );
    return () => {
      alive = false;
    };
  }, [model, sync, saved, options, workerUrl]);
  return late && late.for === sync ? late.geometry : sync;
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
      data: { table: t, w: g.width, h: g.height },
      draggable,
      selectable: false,
      connectable: false,
      deletable: false,
      ariaLabel: `Table ${t.name}`,
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
  minimap = true,
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
  const errors = compiled.diagnostics.filter((d) => d.severity === 'error');

  const diagRef = useRef(onDiagnostics);
  diagRef.current = onDiagnostics;
  useEffect(() => {
    diagRef.current?.(compiled.diagnostics);
  }, [compiled]);

  // --- view ----------------------------------------------------------------------------------
  const [viewName, setViewName] = useState(view ?? DEFAULT_VIEW);
  useEffect(() => setViewName(view ?? DEFAULT_VIEW), [view]);
  const viewModel = useMemo(
    () => (model && viewName !== DEFAULT_VIEW ? (selectView(model, viewName) ?? model) : model),
    [model, viewName],
  );
  const viewNames = useMemo(() => model?.views.map((v) => v.name) ?? [], [model]);

  // --- layout --------------------------------------------------------------------------------
  const detail: DetailLevel = detailLevel ?? layout?.settings?.detailLevel ?? 'all';
  const edges_: EdgeStyle = edgeStyle ?? layout?.settings?.theme?.edgeStyle ?? 'orthogonal';
  const saved = useMemo(
    () => (layout ? mergeViewDefaults(layout, viewName) : null),
    [layout, viewName],
  );
  const geometry = useGeometry(viewModel, saved, detail, workerUrl);

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
    if (!viewModel) return out;
    const tables = new Map(viewModel.tables.map((t) => [t.id, t]));
    const add = (tableId: string, column: string | undefined) => {
      const t = tables.get(tableId);
      if (!t) return;
      const row = rowIndexOf(t, column, detail);
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
  }, [viewModel, detail]);

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

  // --- viewport ------------------------------------------------------------------------------
  const fitted = useRef(false);
  const fit = useCallback(
    (duration = 200) => void rf.fitView({ padding: 0.12, maxZoom: 1.25, duration }),
    [rf],
  );
  useEffect(() => {
    if (!geometry) return;
    const first = !fitted.current;
    fitted.current = true;
    const t = setTimeout(() => {
      if (first && saved?.viewport) void rf.setViewport(saved.viewport);
      else fit(first ? 0 : 250);
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
      if (e.key === 'Escape') setOverlay(false);
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
  const fileName = (title ?? model?.project?.name ?? 'diagram').trim() || 'diagram';
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

  const editorHref = useMemo(
    () => (editorUrl ? editorLink(editorUrl, source) : null),
    [editorUrl, key],
  );

  const multiFile = typeof source !== 'string';
  const rootStyle: CSSProperties = {
    ...style,
    height: fullscreen ? '100%' : typeof height === 'number' ? `${height}px` : height,
  };

  return (
    <div
      ref={rootRef}
      className={[
        'rv-viewer',
        overlay ? 'rv-viewer--overlay' : '',
        nativeFs ? 'rv-viewer--fullscreen' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-rv-color-mode={colorMode}
      style={rootStyle}
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
            nodesFocusable={false}
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
            fitViewOptions={{ padding: 0.12, maxZoom: 1.25 }}
            forceColorMode={colorMode}
            attributionPosition="bottom-left"
            aria-label={title ?? 'Entity-relationship diagram'}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.2}
              color="var(--rv-grid-dot)"
              bgColor="var(--rv-canvas-bg)"
            />
            {minimap ? (
              <MiniMap<FlowNode>
                pannable
                zoomable
                className="rv-minimap"
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

      {title ? <div className="rv-title">{title}</div> : null}

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

      {!model ? <div className="rv-empty">No diagram to show</div> : null}
    </div>
  );
}
