import {
  DEFAULT_VIEW,
  mergeViewDefaults,
  selectView,
  type Box,
  type DetailLevel,
  type DiagramGeometry,
  type DiagramModel,
  type Layout,
  type LayoutOptions,
  type NodeOverride,
  type SourceSpan,
  type ViewLayout,
  type Viewport,
} from '@relvista/core';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewportStore,
  type NodeMouseHandler,
  type OnNodeDrag,
  type OnNodesChange,
} from '@xyflow/react';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';
import { renderDiagramSvgString } from '../export/svgString.js';
import { layoutAsync, layoutSync, moveNodes } from '../geometry.js';
import { ColorContext } from '../svg/context.js';
import { highlightSets, nodeDetail, routeAll, rowIndexOf, type EdgeStyle } from '../svg/routing.js';
import { colorResolver, safeColor, type ColorMode, type PaletteOverrides } from '../theme.js';
import { resolvePalette } from '../themeDom.js';
import { ViewerContext, handleId, type ViewerState } from '../viewer/context.js';
import { fitViewport, initialViewport, type Padding } from '../viewer/initialView.js';
import { nodeTypes, type FlowNode, type GroupFlowNode } from '../viewer/nodes.js';
import { edgeTypes, type RefFlowEdge } from '../viewer/RefEdge.js';
import { SideCard } from '../viewer/SideCard.js';
import {
  NudgeBatch,
  groupDragPositions,
  movedPositions,
  nudgeDelta,
  startGroupDrag,
  visibleMembers,
  type GroupDrag,
  type Pos,
} from './drag.js';
import { setNodePositions, setNodeSettings as setLayoutNodeSettings } from './layoutEdit.js';
import type {
  AutoLayoutScope,
  CanvasExportOptions,
  CanvasNodeEvent,
  CanvasNodeKind,
  LayoutChange,
  NodeSettings,
} from './types.js';
import { unplacedIds, useCanvasGeometry } from './useCanvasGeometry.js';

export type {
  AutoLayoutScope,
  CanvasExportOptions,
  CanvasNodeEvent,
  CanvasNodeKind,
  LayoutChange,
  NodeSettings,
} from './types.js';

export interface DiagramCanvasProps {
  /** Full model (not view-filtered); `null` shows nothing (the app shows its own empty state). */
  model: DiagramModel | null;
  /** DiagramView name; default '*' (all). Unknown names render '*' and call `onUnknownView`. */
  view?: string;
  onUnknownView?: (name: string) => void;
  /** Controlled layout. The canvas never keeps positions of its own once a change is reported. */
  layout: Layout | null;
  /** Called with the complete next layout (immutable update) and what changed. */
  onLayoutChange?: (next: Layout, change: LayoutChange) => void;
  /**
   * Editable mode: drags, auto-placement and settings are reported through `onLayoutChange`,
   * groups are draggable by their header, multi-select is on, the side card is off by default.
   * Default false (read-only viewer behaviour: drags are local and forgotten).
   */
  editable?: boolean;
  /** Read-only mode only: nodes can be dragged locally. Default true (as DbmlViewer today). */
  draggable?: boolean;
  /** Default 'light'. */
  colorMode?: ColorMode;
  /** Default layout.settings.detailLevel ?? 'all'. */
  detailLevel?: DetailLevel;
  /** Default layout.settings.theme.edgeStyle ?? 'orthogonal'. */
  edgeStyle?: EdgeStyle;
  /** Default 'auto': shown for 8 or more tables in canvases at least 600px wide. */
  minimap?: boolean | 'auto';
  /** ELK worker script (`elkjs/lib/elk-worker.min.js`); without it ELK runs in-process. */
  workerUrl?: string | URL;
  /** Node drawn with the highlight ring and its refs lit (cursor-in-block in the editor). */
  highlightedNodeId?: string | null;
  onNodeClick?: (e: CanvasNodeEvent) => void;
  onNodeDoubleClick?: (e: CanvasNodeEvent) => void;
  /** When set, the canvas calls preventDefault on the native contextmenu event. */
  onNodeContextMenu?: (e: CanvasNodeEvent) => void;
  onPaneClick?: () => void;
  /** Called when a pan or zoom ends (user or programmatic) with the viewport it ended at. */
  onViewportChange?: (viewport: Viewport) => void;
  /** Table details card on click. Default `!editable`. */
  sideCard?: boolean;
  /**
   * Identity of the document. The initial view (fit / saved viewport) is applied on mount, when
   * this changes, and when `view` changes — never because `model` or `layout` changed.
   */
  resetKey?: string;
  /**
   * Viewport for the first view of this `resetKey` instead of the computed one (a restored editor
   * session). Read when the document's first layout is drawn; later changes are ignored.
   */
  initialViewport?: Viewport | null;
  /**
   * 'pending' while the ELK result is outstanding, then 'done' (mirrors data-rv-layout). Reported
   * again whenever `resetKey` changes, even when the value stayed the same.
   */
  onLayoutStatus?: (status: 'pending' | 'done') => void;
  /** Padding the initial view and Fit keep free for overlays (px). Default DbmlViewer's PAD. */
  padding?: Partial<Record<'top' | 'right' | 'bottom' | 'left', number>>;
  /** Default 'Entity-relationship diagram'. */
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  /** Overlays (toolbars, chips) rendered inside the canvas root, after the React Flow pane. */
  children?: ReactNode;
  /** React 19 ref-as-prop. */
  ref?: Ref<DiagramCanvasHandle>;
}

export interface DiagramCanvasHandle {
  fitView(options?: { duration?: number }): void;
  zoomIn(): void;
  zoomOut(): void;
  /** Pans (keeps zoom) so the node is centred. `onlyIfHidden`: no-op when ≥ 60% of it is visible. */
  focusNode(id: string, options?: { onlyIfHidden?: boolean; duration?: number }): void;
  /** Runs ELK for the active view and reports one 'auto-layout' change. Resolves to the new layout. */
  runAutoLayout(scope?: AutoLayoutScope): Promise<Layout | null>;
  /** Pin / collapse through the layout (reports a 'settings' change). */
  setNodeSettings(ids: string[], settings: NodeSettings): void;
  /** Ids of the nodes selected in the canvas (editable mode). */
  getSelection(): string[];
  /** Replaces the canvas selection (`[]` clears it), e.g. when the editor's cursor moves on. */
  setSelection(ids: string[]): void;
  /** Geometry as drawn now (after drags), active view. */
  getGeometry(): DiagramGeometry | null;
  getViewport(): Viewport;
  setViewport(viewport: Viewport, options?: { duration?: number }): void;
  /** null without a model. */
  exportSvg(options?: CanvasExportOptions): string | null;
  /** scale default 2; null without a model. */
  exportPng(options?: CanvasExportOptions & { scale?: number }): Promise<Blob | null>;
  print(options?: CanvasExportOptions): void;
}

/** Props DbmlViewer uses on top of the public contract (not exported from the package). */
export interface CanvasInternalProps extends DiagramCanvasProps {
  /** Called with the laid-out geometry (before drags) whenever it changes. */
  onGeometry?: (geometry: DiagramGeometry | null) => void;
  /** The handle under another name: React 18 strips a `ref` prop from function components. */
  handleRef?: Ref<DiagramCanvasHandle>;
}

/** Room for the title and toolbar overlays at the top, a small margin elsewhere. */
export const PAD = { top: 64, right: 28, bottom: 28, left: 28 } as const;
/** Minimap size (px) and its distance from the canvas's bottom-right corner. */
export const MINIMAP = { width: 120, height: 80, margin: 12 } as const;
/** The smaller minimap of narrow canvases (phones, a pane narrowed by a splitter). */
export const MINIMAP_NARROW = { width: 84, height: 56, margin: 10 } as const;
/** Below this width the canvas counts as narrow (phones): small minimap, more overview. */
export const NARROW = 600;
/**
 * The 'auto' minimap is always on for diagrams of this many tables in wide canvases; otherwise it
 * appears whenever part of the diagram is off-screen (the cue that there is more to see).
 */
const MINIMAP_MIN_TABLES = 8;
/** Screen px a diagram may stick out of the canvas before it counts as off-screen. */
const OFFSCREEN_SLACK = 4;
/**
 * The first view never zooms out further than this (column text at 12.5 × 0.85 ≈ 10.6px); bigger
 * diagrams open readable on their densest corner and pan. Phones get a little more overview.
 */
export const MIN_INITIAL_ZOOM = 0.85;
export const MIN_INITIAL_ZOOM_NARROW = 0.75;
/**
 * The first view still fits (or fills one axis) down to this zoom rather than hide tables at the
 * readable one: small diagrams open whole, as most editors open them.
 */
export const FIT_FLOOR = 0.55;
/** Fit floor of diagrams of at most `SMALL_DIAGRAM_TABLES` tables. */
export const FIT_FLOOR_SMALL = 0.45;
/** Fit floor of narrow canvases (phones). */
export const FIT_FLOOR_NARROW = 0.5;
export const SMALL_DIAGRAM_TABLES = 12;
/** Largest zoom of the first view and Fit: a small diagram opens a little above 1:1, centred. */
export const MAX_FIT_ZOOM = 1.15;
/** Part of a node that must be on screen for `focusNode(…, { onlyIfHidden })` to leave it. */
const FOCUS_VISIBLE = 0.6;

const EMPTY_SET: ReadonlySet<string> = new Set();

/**
 * Whether a restored viewport shows the whole diagram, and at clearly less than the fit's zoom:
 * nothing the user arranged is lost by framing the diagram for the current canvas instead.
 */
export function shrunkenRestore(
  vp: Viewport,
  b: Box,
  size: { width: number; height: number },
  padding: Padding,
): boolean {
  const fit = fitViewport({ bounds: b, ...size, padding, maxZoom: MAX_FIT_ZOOM });
  if (!fit || fit.zoom <= vp.zoom * 1.05) return false;
  const x0 = vp.x + b.x * vp.zoom;
  const y0 = vp.y + b.y * vp.zoom;
  return (
    x0 >= -1 &&
    y0 >= -1 &&
    x0 + b.width * vp.zoom <= size.width + 1 &&
    y0 + b.height * vp.zoom <= size.height + 1
  );
}

function setOwn<T>(obj: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
}

function buildNodes(
  model: DiagramModel,
  geometry: DiagramGeometry,
  draggable: boolean,
  editable: boolean,
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
      selectable: editable,
      connectable: false,
      deletable: false,
      focusable: editable,
      ...(editable ? { ariaLabel: `Sticky note ${n.name}` } : {}),
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
      selectable: editable,
      connectable: false,
      deletable: false,
      focusable: true,
      ariaLabel: editable ? `Table ${t.name}` : `Table ${t.name}. Press Enter for details.`,
    });
  }
  return out;
}

const KIND: Record<FlowNode['type'] & string, CanvasNodeKind> = {
  rvTable: 'table',
  rvNote: 'note',
  rvGroup: 'group',
};

/** The model element behind a node id, for its kind and span. */
function nodeInfo(
  model: DiagramModel | null,
  id: string,
): { kind: CanvasNodeKind; span: SourceSpan | null } | null {
  if (!model) return null;
  const t = model.tables.find((x) => x.id === id);
  if (t) return { kind: 'table', span: t.span ?? null };
  const n = model.stickyNotes.find((x) => x.id === id);
  if (n) return { kind: 'note', span: n.span ?? null };
  const g = model.groups.find((x) => x.id === id);
  if (g) return { kind: 'group', span: g.span ?? null };
  return null;
}

/**
 * The diagram as an interactive React Flow canvas, read-only (the docs viewer) or editable (the
 * editor: drags, auto-layout and node settings are reported as layout changes). Browser only;
 * importing the module touches no browser API.
 */
export function DiagramCanvas(props: DiagramCanvasProps): ReactElement {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

/** DiagramCanvas with the internal extras (DbmlViewer). */
export function DiagramCanvasInternal(props: CanvasInternalProps): ReactElement {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({
  model,
  view = DEFAULT_VIEW,
  onUnknownView,
  layout,
  onLayoutChange,
  editable = false,
  draggable = true,
  colorMode = 'light',
  detailLevel,
  edgeStyle,
  minimap = 'auto',
  workerUrl,
  highlightedNodeId = null,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onPaneClick,
  onViewportChange,
  sideCard = !editable,
  resetKey,
  initialViewport: ownViewport,
  onLayoutStatus,
  padding: paddingProp,
  ariaLabel = 'Entity-relationship diagram',
  className,
  style,
  children,
  ref,
  onGeometry,
  handleRef,
}: CanvasInternalProps): ReactElement {
  const rf = useReactFlow<FlowNode, RefFlowEdge>();
  const rootRef = useRef<HTMLDivElement>(null);

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
  const basePadding = useMemo<Padding>(
    () => ({ ...PAD, ...paddingProp }),
    [paddingProp?.top, paddingProp?.right, paddingProp?.bottom, paddingProp?.left],
  );
  // The viewport shape the layout packs for: taken once (re-packing on every resize would move
  // the tables around under the user), at a coarse step so near-equal sizes share a layout.
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  if (aspect === undefined && size) {
    const avail = {
      w: size.width - basePadding.left - basePadding.right,
      h: Math.max(1, size.height - basePadding.top - basePadding.bottom),
    };
    setAspect(Math.round((avail.w / avail.h) * 4) / 4 || 0.25);
  }
  const narrow = !!size && size.width < NARROW;

  // --- view ----------------------------------------------------------------------------------
  const unknownView = !!model && view !== DEFAULT_VIEW && !model.views.some((v) => v.name === view);
  const viewName = unknownView ? DEFAULT_VIEW : view;
  const unknownRef = useRef(onUnknownView);
  unknownRef.current = onUnknownView;
  useEffect(() => {
    if (!unknownView) return;
    if (unknownRef.current) unknownRef.current(view);
    else console.warn(`relvista: unknown view "${view}"; showing all tables`);
  }, [unknownView, view]);
  const viewModel = useMemo(
    () => (model && viewName !== DEFAULT_VIEW ? (selectView(model, viewName) ?? model) : model),
    [model, viewName],
  );

  // --- layout --------------------------------------------------------------------------------
  const detail: DetailLevel = detailLevel ?? layout?.settings?.detailLevel ?? 'all';
  const edges_: EdgeStyle = edgeStyle ?? layout?.settings?.theme?.edgeStyle ?? 'orthogonal';
  const saved = useMemo(
    () => (layout ? mergeViewDefaults(layout, viewName) : null),
    [layout, viewName],
  );
  const { geometry, final: layoutFinal } = useCanvasGeometry(
    viewModel,
    saved,
    detail,
    aspect,
    workerUrl,
  );

  // --- nodes (dragging moves them locally until the change is reported) ----------------------
  const nodeDrag = editable || draggable;
  const baseNodes = useMemo(
    () => (viewModel && geometry ? buildNodes(viewModel, geometry, nodeDrag, editable) : []),
    [viewModel, geometry, nodeDrag, editable],
  );
  const [nodes, setNodes] = useState<FlowNode[]>(baseNodes);
  const [nodesFor, setNodesFor] = useState(baseNodes);
  if (nodesFor !== baseNodes) {
    setNodesFor(baseNodes);
    setNodes(baseNodes);
  }
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  // Selection (editable): kept apart from the nodes so a new layout does not drop it.
  const [selection, setSelection] = useState<ReadonlySet<string>>(EMPTY_SET);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [selectionFor, setSelectionFor] = useState({ resetKey, viewName });
  if (selectionFor.resetKey !== resetKey || selectionFor.viewName !== viewName) {
    setSelectionFor({ resetKey, viewName });
    setSelection(EMPTY_SET);
  }

  const groupIdsRef = useRef<ReadonlySet<string>>(EMPTY_SET);
  const onNodesChange = useCallback<OnNodesChange<FlowNode>>((changes) => {
    // Group boxes are computed from their members, never moved themselves.
    for (const id of groupIdsRef.current) changes.removeForNode(id);
    let sel: Set<string> | null = null;
    for (const c of changes.getByType('select')) {
      sel ??= new Set(selectionRef.current);
      if (c.selected) sel.add(c.id);
      else sel.delete(c.id);
    }
    if (sel) setSelection(sel);
    setNodes((ns) => changes.applyTo(ns));
  }, []);

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
        draggable: editable,
        ...(editable ? { dragHandle: '.rv-group-drag' } : {}),
        selectable: false,
        connectable: false,
        focusable: false,
        deletable: false,
        zIndex: -1,
        className: 'rv-group-node',
      });
    }
    return out;
  }, [viewModel, current, editable]);
  groupIdsRef.current = useMemo(() => new Set(groupNodes.map((g) => g.id)), [groupNodes]);

  const allNodes = useMemo<FlowNode[]>(
    () => [
      ...groupNodes,
      ...nodes.map((n) => {
        const s = selection.has(n.id);
        return !!n.selected === s ? n : { ...n, selected: s };
      }),
    ],
    [groupNodes, nodes, selection],
  );

  // --- hover / highlight / details card -------------------------------------------------------
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const highlightIds = useMemo(() => {
    if (!viewModel || !highlightedNodeId) return null;
    const g = viewModel.groups.find((x) => x.id === highlightedNodeId);
    if (g) return g.tableIds;
    const known =
      viewModel.tables.some((t) => t.id === highlightedNodeId) ||
      viewModel.stickyNotes.some((n) => n.id === highlightedNodeId);
    return known ? [highlightedNodeId] : null;
  }, [viewModel, highlightedNodeId]);
  const lit = useMemo(
    () =>
      viewModel && hovered
        ? highlightSets(viewModel, [hovered])
        : viewModel && highlightIds
          ? highlightSets(viewModel, highlightIds)
          : null,
    [viewModel, hovered, highlightIds],
  );
  const onEnter = useCallback<NodeMouseHandler<FlowNode>>((_, n) => {
    if (n.type !== 'rvGroup') setHovered(n.id);
  }, []);
  const onLeave = useCallback<NodeMouseHandler<FlowNode>>(() => setHovered(null), []);
  const selectedTable =
    sideCard && selected ? viewModel?.tables.find((t) => t.id === selected) : undefined;

  const viewerState = useMemo<ViewerState>(
    () => ({
      detailLevel: detail,
      lit,
      dim: !!hovered,
      hoveredId: hovered,
      selectedId: selectedTable ? selected : null,
      highlightedId: highlightIds ? highlightedNodeId : null,
      selection,
      groupHandles: editable || !!onNodeClick,
      handles,
    }),
    [
      detail,
      lit,
      hovered,
      selected,
      selectedTable,
      highlightIds,
      highlightedNodeId,
      selection,
      editable,
      onNodeClick,
      handles,
    ],
  );
  // The canvas colour the page actually shows (a host palette or custom CSS may replace relvista's):
  // group colours are adjusted for contrast against it.
  const [shownBg, setShownBg] = useState<{ mode: ColorMode; palette: PaletteOverrides } | null>(
    null,
  );
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const palette = resolvePalette(el, colorMode, ['canvasBg']);
    setShownBg((prev) =>
      prev && prev.mode === colorMode && prev.palette.canvasBg === palette.canvasBg
        ? prev
        : { mode: colorMode, palette },
    );
  }, [colorMode]);
  const colors = useMemo(
    () => colorResolver(colorMode, false, shownBg?.mode === colorMode ? shownBg.palette : null),
    [colorMode, shownBg],
  );
  /** What the page shows, for exports in the current mode (another mode uses its palette). */
  const shownPalette = useCallback((mode: ColorMode): PaletteOverrides | null => {
    const el = rootRef.current;
    return el && mode === live.current.colorMode ? resolvePalette(el, mode) : null;
  }, []);

  // --- node events ---------------------------------------------------------------------------
  const live = useRef({
    viewModel,
    current,
    geometry,
    layout,
    viewName,
    resetKey,
    editable,
    detail,
    edges_,
    colorMode,
    aspect,
    workerUrl,
    onLayoutChange,
    onNodeClick,
    onNodeDoubleClick,
    onNodeContextMenu,
    onPaneClick,
    fit: (_duration?: number, _g?: DiagramGeometry | null) => {},
  });
  live.current = {
    ...live.current,
    viewModel,
    current,
    geometry,
    layout,
    viewName,
    resetKey,
    editable,
    detail,
    edges_,
    colorMode,
    aspect,
    workerUrl,
    onLayoutChange,
    onNodeClick,
    onNodeDoubleClick,
    onNodeContextMenu,
    onPaneClick,
  };

  const nodeEvent = useCallback(
    (
      id: string,
      type: string | undefined,
      at: {
        clientX: number;
        clientY: number;
        shiftKey: boolean;
        metaKey: boolean;
        ctrlKey: boolean;
      },
      source?: 'keyboard',
    ): CanvasNodeEvent => {
      const info = nodeInfo(live.current.viewModel, id);
      return {
        id,
        kind: info?.kind ?? KIND[(type ?? 'rvTable') as keyof typeof KIND] ?? 'table',
        span: info?.span ?? null,
        clientX: at.clientX,
        clientY: at.clientY,
        shiftKey: at.shiftKey,
        metaKey: at.metaKey,
        ctrlKey: at.ctrlKey,
        ...(source ? { source } : {}),
      };
    },
    [],
  );

  const onClick = useCallback<NodeMouseHandler<FlowNode>>(
    (e, n) => {
      const modified = e.shiftKey || e.metaKey || e.ctrlKey;
      if (sideCard && n.type === 'rvTable' && !(editable && modified))
        setSelected((s) => (s === n.id ? null : n.id));
      live.current.onNodeClick?.(nodeEvent(n.id, n.type, e));
    },
    [sideCard, editable, nodeEvent],
  );
  const onDoubleClick = useCallback<NodeMouseHandler<FlowNode>>(
    (e, n) => live.current.onNodeDoubleClick?.(nodeEvent(n.id, n.type, e)),
    [nodeEvent],
  );
  const onContextMenu = useCallback<NodeMouseHandler<FlowNode>>(
    (e, n) => {
      if (!live.current.onNodeContextMenu) return;
      e.preventDefault();
      live.current.onNodeContextMenu(nodeEvent(n.id, n.type, e));
    },
    [nodeEvent],
  );
  const viewportCb = useRef(onViewportChange);
  viewportCb.current = onViewportChange;
  /**
   * First view that leaves a table under the minimap: the minimap waits until the user pans or
   * zooms (a gesture, or a zoom / fit / focus command), never for the first view's own moves.
   */
  const [minimapHeld, setMinimapHeld] = useState(false);
  /**
   * The viewport was moved by the user (a gesture or a command) or restored from a saved one since
   * the first view: until then the first view follows the canvas size (see below).
   */
  const viewMoved = useRef(false);
  const onMoveStart = useCallback((event: unknown) => {
    if (event) viewMoved.current = true;
  }, []);
  const onMoveEnd = useCallback((event: unknown, vp: Viewport) => {
    if (event) setMinimapHeld(false);
    viewportCb.current?.(vp);
  }, []);
  const onPane = useCallback(() => {
    setSelected(null);
    live.current.onPaneClick?.();
  }, []);

  // --- committing moves ---------------------------------------------------------------------
  const commitMove = useCallback((moved: ReadonlyMap<string, Pos>) => {
    const L = live.current;
    if (!L.editable || moved.size === 0) return;
    const positions: Record<string, Pos> = {};
    for (const [id, p] of moved) setOwn(positions, id, p);
    const next = setNodePositions(L.layout, L.viewName, positions);
    L.onLayoutChange?.(next, { kind: 'move', view: L.viewName, ids: Array.from(moved.keys()) });
  }, []);

  const nudge = useMemo(
    () =>
      new NudgeBatch((ids) => {
        const byId = new Map(nodesRef.current.map((n) => [n.id, n.position]));
        const moved = new Map<string, Pos>();
        for (const id of ids) {
          const p = byId.get(id);
          if (p) moved.set(id, p);
        }
        commitMove(moved);
      }),
    [commitMove],
  );
  useEffect(() => () => nudge.flush(), [nudge]);

  const dragRef = useRef<{ start: Map<string, Pos>; group: GroupDrag | null } | null>(null);
  const onDragStart = useCallback<OnNodeDrag<FlowNode>>(
    (_, node, dragged) => {
      nudge.flush();
      const byId = new Map(nodesRef.current.map((n) => [n.id, n.position]));
      if (node.type === 'rvGroup') {
        const members = visibleMembers(node.data.group.tableIds, byId);
        const group = startGroupDrag(node.id, node.position, members, byId);
        dragRef.current = { start: new Map(group.members), group };
        return;
      }
      const start = new Map<string, Pos>();
      for (const n of dragged) {
        if (n.type === 'rvGroup') continue;
        const p = byId.get(n.id) ?? n.position;
        start.set(n.id, { x: p.x, y: p.y });
      }
      dragRef.current = { start, group: null };
    },
    [nudge],
  );
  const onDrag = useCallback<OnNodeDrag<FlowNode>>((_, node) => {
    const d = dragRef.current;
    if (!d?.group || node.id !== d.group.groupId) return;
    const pos = groupDragPositions(d.group, node.position);
    setNodes((ns) => ns.map((n) => (pos.has(n.id) ? { ...n, position: pos.get(n.id)! } : n)));
  }, []);
  const onDragStop = useCallback<OnNodeDrag<FlowNode>>(
    (_, node, dragged) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      let end: Map<string, Pos>;
      if (d.group) {
        end = groupDragPositions(d.group, node.position);
        setNodes((ns) => ns.map((n) => (end.has(n.id) ? { ...n, position: end.get(n.id)! } : n)));
      } else end = new Map(dragged.map((n) => [n.id, n.position]));
      commitMove(movedPositions(d.start, end));
    },
    [commitMove],
  );

  // --- keyboard: Enter (details / reveal), arrows (nudge, editable) ---------------------------
  const nodeIdOf = (el: HTMLElement): string | null =>
    el.classList?.contains('react-flow__node') ? el.getAttribute('data-id') : null;

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const el = e.target as HTMLElement;
      const id = nodeIdOf(el);
      if (!id || !viewModel) return;
      const isTable = viewModel.tables.some((t) => t.id === id);
      if (sideCard && isTable) {
        e.preventDefault();
        setSelected((s) => (s === id ? null : id));
      }
      if (e.key === 'Enter' && live.current.onNodeClick && nodeInfo(viewModel, id)) {
        const r = el.getBoundingClientRect();
        live.current.onNodeClick(
          nodeEvent(
            id,
            undefined,
            {
              clientX: r.left + r.width / 2,
              clientY: r.top + r.height / 2,
              shiftKey: false,
              metaKey: false,
              ctrlKey: false,
            },
            'keyboard',
          ),
        );
      }
    },
    [viewModel, sideCard, nodeEvent],
  );

  const onKeyDownCapture = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!editable || e.altKey || e.metaKey || e.ctrlKey) return;
      const delta = nudgeDelta(e.key, e.shiftKey);
      if (!delta) return;
      const el = e.target as HTMLElement;
      // Only on the diagram itself (not in the side card, toolbars or form fields).
      if (!el.closest?.('.react-flow') || el.closest('input, select, textarea, button')) return;
      const movable = new Set(nodesRef.current.map((n) => n.id));
      let ids = Array.from(selectionRef.current).filter((id) => movable.has(id));
      if (!ids.length) {
        const focused = nodeIdOf(el);
        if (focused && movable.has(focused)) ids = [focused];
      }
      if (!ids.length) return;
      // Ours, not React Flow's built-in arrow move (other step, one change per press).
      e.preventDefault();
      e.stopPropagation();
      const set = new Set(ids);
      setNodes((ns) =>
        ns.map((n) =>
          set.has(n.id)
            ? { ...n, position: { x: n.position.x + delta.x, y: n.position.y + delta.y } }
            : n,
        ),
      );
      nudge.add(ids);
    },
    [editable, nudge],
  );

  // --- minimap / padding ---------------------------------------------------------------------
  const tableCount = viewModel?.tables.length ?? 0;
  const mini = narrow ? MINIMAP_NARROW : MINIMAP;
  /** Shown whatever the viewport (an explicit `minimap`, or a big diagram in a wide canvas). */
  const minimapAlways =
    minimap === true ||
    (minimap === 'auto' && !!size && !narrow && tableCount >= MINIMAP_MIN_TABLES);
  // World box of everything drawn: the laid-out bounds plus dragged nodes.
  const contentBox = useMemo(() => {
    if (!geometry) return null;
    const b = geometry.bounds;
    let [x0, y0, x1, y1] = [b.x, b.y, b.x + b.width, b.y + b.height];
    for (const n of nodes) {
      const w = n.width ?? 0;
      const h = n.height ?? 0;
      x0 = Math.min(x0, n.position.x);
      y0 = Math.min(y0, n.position.y);
      x1 = Math.max(x1, n.position.x + w);
      y1 = Math.max(y1, n.position.y + h);
    }
    return { x0, y0, x1, y1 };
  }, [geometry, nodes]);
  // Counted only once this document's first view is on screen (not React Flow's default one).
  const [viewShownFor, setViewShownFor] = useState<string | null>(null);
  const offscreen = useViewportStore((st) => {
    if (!contentBox || !size) return false;
    const [tx, ty, z] = st.transform;
    const e = OFFSCREEN_SLACK;
    return (
      contentBox.x0 * z + tx < -e ||
      contentBox.y0 * z + ty < -e ||
      contentBox.x1 * z + tx > size.width + e ||
      contentBox.y1 * z + ty > size.height + e
    );
  });
  const showMinimap =
    minimapAlways ||
    (minimap === 'auto' && !!size && tableCount > 0 && offscreen && viewShownFor !== null);
  const padding = useMemo<Padding>(
    () =>
      showMinimap
        ? { ...basePadding, bottom: basePadding.bottom + mini.height + mini.margin }
        : basePadding,
    [showMinimap, basePadding, mini],
  );

  // --- viewport ------------------------------------------------------------------------------
  const minZoom = narrow ? MIN_INITIAL_ZOOM_NARROW : MIN_INITIAL_ZOOM;
  const canvasSize = useCallback(() => {
    const el = rootRef.current;
    return { width: el?.clientWidth ?? 0, height: el?.clientHeight ?? 0 };
  }, []);
  /** Shows the whole diagram (the Fit button), centred in the area the overlays leave free. */
  const fit = useCallback(
    (duration = 200, g: DiagramGeometry | null = live.current.current) => {
      const vp = g
        ? fitViewport({ bounds: g.bounds, ...canvasSize(), padding, maxZoom: MAX_FIT_ZOOM })
        : null;
      setMinimapHeld(false);
      if (vp) void rf.setViewport(vp, { duration });
      else void rf.fitView({ maxZoom: MAX_FIT_ZOOM, duration });
    },
    [rf, padding, canvasSize],
  );
  live.current.fit = fit;
  /**
   * Initial view: the fit, but never below the readable floor; a bigger diagram opens at that zoom
   * on the window showing the most whole tables (see `initialViewport`). Fit shows everything.
   */
  const initialView = useCallback(
    (g: DiagramGeometry, duration: number) => {
      const s = canvasSize();
      const withMinimap = {
        ...basePadding,
        bottom: basePadding.bottom + mini.height + mini.margin,
      };
      // A first view that cannot show everything gets the 'auto' minimap as the cue.
      const fitBare = fitViewport({ bounds: g.bounds, ...s, padding: basePadding, maxZoom: 1 });
      const overflows = !!fitBare && fitBare.zoom < minZoom;
      const minimapPlanned = minimapAlways || (minimap === 'auto' && overflows);
      // The minimap only takes the bottom-right corner: a first view that cannot show everything
      // uses the full height and keeps tables out from under it.
      const minimapBox = {
        x: s.width - mini.margin - mini.width,
        y: s.height - mini.margin - mini.height,
        width: mini.width,
        height: mini.height,
      };
      const first = viewModel?.tables[0];
      const anchor = first ? g.nodes[first.id] : undefined;
      const tables = viewModel?.tables.length ?? 0;
      const vp = initialViewport({
        ...(anchor ? { anchor } : {}),
        bounds: g.bounds,
        nodes: Object.values(g.nodes),
        groups: Object.values(g.groups),
        ...s,
        fitPadding: minimapAlways ? withMinimap : basePadding,
        padding: basePadding,
        ...(minimapPlanned ? { obstacles: [minimapBox] } : {}),
        maxZoom: MAX_FIT_ZOOM,
        minZoom,
        fitFloor: narrow
          ? FIT_FLOOR_NARROW
          : tables <= SMALL_DIAGRAM_TABLES
            ? FIT_FLOOR_SMALL
            : FIT_FLOOR,
      });
      // The minimap never covers a table in the first view: when no window avoids it, it waits.
      const covers =
        !!vp &&
        minimapPlanned &&
        Object.values(g.nodes).some((n) => {
          const x = vp.x + n.x * vp.zoom;
          const y = vp.y + n.y * vp.zoom;
          return (
            x < minimapBox.x + minimapBox.width &&
            x + n.width * vp.zoom > minimapBox.x &&
            y < minimapBox.y + minimapBox.height &&
            y + n.height * vp.zoom > minimapBox.y
          );
        });
      setMinimapHeld(covers);
      if (vp) void rf.setViewport(vp, { duration });
      else fit(duration, g);
    },
    [rf, fit, basePadding, minZoom, canvasSize, minimapAlways, minimap, mini, viewModel, narrow],
  );

  // The initial view is applied per document (`resetKey`) and view. Until the layout is final
  // (ELK still running) each new geometry re-applies it, so the first view frames the real
  // layout; afterwards layout and model changes never move the viewport.
  const viewStage = useRef<{ key: unknown; stage: 'pending' | 'provisional' | 'done' }>({
    key: undefined,
    stage: 'pending',
  });
  const everShown = useRef(false);
  const savedApplied = useRef(false);
  /** resetKey whose `initialViewport` was used (each document's is used once). */
  const initialVpFor = useRef<{ key: string | undefined } | null>(null);
  const stageKey = `${resetKey ?? ''}\u0000${viewName}`;
  if (viewStage.current.key !== stageKey) viewStage.current = { key: stageKey, stage: 'pending' };
  useEffect(() => {
    const st = viewStage.current;
    if (st.stage === 'done' || !geometry || Object.keys(geometry.nodes).length === 0) return;
    const g = geometry;
    const final = layoutFinal;
    let own = ownViewport && initialVpFor.current?.key !== resetKey ? ownViewport : undefined;
    // A restored session viewport that shows the whole diagram smaller than the fit would (saved in
    // a smaller window or pane) is not worth keeping: the first view frames it for this canvas.
    if (own && !saved?.viewport && shrunkenRestore(own, g.bounds, canvasSize(), basePadding)) {
      initialVpFor.current = { key: resetKey };
      own = undefined;
    }
    const savedViewport = own ?? saved?.viewport;
    // Deferred a tick so React Flow has the new nodes; the stage only advances once applied.
    const t = setTimeout(() => {
      if (viewStage.current !== st) return;
      if (st.stage === 'pending') {
        if (own) initialVpFor.current = { key: resetKey };
        savedApplied.current = !!savedViewport;
        viewMoved.current = !!savedViewport;
        if (savedViewport) {
          setMinimapHeld(false);
          void rf.setViewport(savedViewport);
        } else initialView(g, everShown.current ? 250 : 0);
      } else if (!savedApplied.current) {
        // A saved viewport is kept when the ELK result replaces the first (sync) layout.
        initialView(g, 250);
      }
      everShown.current = true;
      setViewShownFor(stageKey);
      st.stage = final ? 'done' : 'provisional';
    }, 0);
    return () => clearTimeout(t);
    // Only a new geometry or document/view drives this; see above.
  }, [geometry, layoutFinal, stageKey]);

  // Until the user moves it, the first view follows the canvas size: a pane resized right after
  // opening (a restored splitter, a window snapped to half the screen, a viewer that shrinks to
  // its diagram on a phone) shows the diagram framed for its real size, not tiny and off-centre.
  const framedSize = useRef<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!size) return;
    const prev = framedSize.current;
    framedSize.current = size;
    const g = live.current.current;
    if (!prev || viewMoved.current || viewStage.current.stage === 'pending' || !g) return;
    if (Math.abs(prev.width - size.width) < 2 && Math.abs(prev.height - size.height) < 2) return;
    const raf = requestAnimationFrame(() => {
      if (!viewMoved.current) initialView(g, 0);
    });
    return () => cancelAnimationFrame(raf);
  }, [size]);

  // --- status, geometry, placement ------------------------------------------------------------
  const statusRef = useRef(onLayoutStatus);
  statusRef.current = onLayoutStatus;
  useEffect(() => {
    statusRef.current?.(layoutFinal ? 'done' : 'pending');
  }, [layoutFinal, resetKey]);
  const geometryCb = useRef(onGeometry);
  geometryCb.current = onGeometry;
  useEffect(() => {
    geometryCb.current?.(geometry);
  }, [geometry]);

  // Editable: ELK's placement of nodes without a saved position becomes saved positions (one
  // 'place' change), so later edits never reshuffle them.
  const placedFor = useRef<DiagramGeometry | null>(null);
  useEffect(() => {
    if (!editable || !layoutFinal || !viewModel || !geometry) return;
    if (placedFor.current === geometry) return;
    placedFor.current = geometry;
    const ids = unplacedIds(viewModel, saved).filter((id) => geometry.nodes[id]);
    if (!ids.length) return;
    const positions: Record<string, Pos> = {};
    for (const id of ids) {
      const n = geometry.nodes[id]!;
      setOwn(positions, id, { x: n.x, y: n.y });
    }
    const L = live.current;
    const next = setNodePositions(L.layout, L.viewName, positions);
    L.onLayoutChange?.(next, { kind: 'place', view: L.viewName, ids });
  }, [editable, layoutFinal, viewModel, geometry, saved]);

  // --- imperative handle -------------------------------------------------------------------------
  useImperativeHandle(
    ref ?? handleRef,
    (): DiagramCanvasHandle => ({
      fitView: (o) => {
        viewMoved.current = true;
        live.current.fit(o?.duration ?? 250);
      },
      zoomIn() {
        viewMoved.current = true;
        setMinimapHeld(false);
        void rf.zoomIn({ duration: 150 });
      },
      zoomOut() {
        viewMoved.current = true;
        setMinimapHeld(false);
        void rf.zoomOut({ duration: 150 });
      },
      focusNode(id, o) {
        const g = live.current.current;
        const n = g ? (g.nodes[id] ?? g.groups[id]) : undefined;
        if (!n) return;
        const vp = rf.getViewport();
        if (o?.onlyIfHidden) {
          const s = canvasSize();
          const x0 = n.x * vp.zoom + vp.x;
          const y0 = n.y * vp.zoom + vp.y;
          const w = n.width * vp.zoom;
          const h = n.height * vp.zoom;
          const ix = Math.max(0, Math.min(s.width, x0 + w) - Math.max(0, x0));
          const iy = Math.max(0, Math.min(s.height, y0 + h) - Math.max(0, y0));
          if (w * h > 0 && (ix * iy) / (w * h) >= FOCUS_VISIBLE) return;
        }
        viewMoved.current = true;
        setMinimapHeld(false);
        void rf.setCenter(n.x + n.width / 2, n.y + n.height / 2, {
          zoom: vp.zoom,
          ...(o?.duration ? { duration: o.duration } : {}),
        });
      },
      async runAutoLayout(scope = 'unpinned') {
        const L = live.current;
        const vm = L.viewModel;
        if (!vm) return null;
        const merged = L.layout ? mergeViewDefaults(L.layout, L.viewName) : { nodes: {} };
        // 'unpinned': only pinned positions stay; sizes and collapse of the others are kept.
        const nodesIn: Record<string, NodeOverride> = {};
        for (const [id, n] of Object.entries(merged.nodes)) {
          if (scope === 'unplaced' || n.pinned) setOwn(nodesIn, id, n);
          else {
            const { x: _x, y: _y, ...rest } = n;
            setOwn(nodesIn, id, rest);
          }
        }
        const options: LayoutOptions = {
          detailLevel: L.detail,
          saved: { nodes: nodesIn } as Partial<ViewLayout>,
          ...(L.aspect ? { aspectRatio: L.aspect } : {}),
        };
        let g: DiagramGeometry;
        try {
          g = await layoutAsync(vm, {
            ...options,
            engine: 'elk',
            ...(L.workerUrl ? { workerUrl: L.workerUrl } : {}),
          });
        } catch {
          g = layoutSync(vm, options);
        }
        const after = live.current;
        // Another document, view or model while ELK ran: these positions belong to the old one.
        if (
          after.viewName !== L.viewName ||
          after.resetKey !== L.resetKey ||
          after.viewModel !== vm
        )
          return null;
        const positions: Record<string, Pos> = {};
        const ids: string[] = [];
        for (const id of unplacedIds(vm, { nodes: nodesIn })) {
          const n = g.nodes[id];
          if (!n) continue;
          setOwn(positions, id, { x: n.x, y: n.y });
          ids.push(id);
        }
        const next = setNodePositions(after.layout, after.viewName, positions);
        if (after.editable) {
          after.onLayoutChange?.(next, { kind: 'auto-layout', view: after.viewName, scope, ids });
        } else {
          setNodes((ns) =>
            ns.map((n) =>
              Object.hasOwn(positions, n.id) ? { ...n, position: positions[n.id]! } : n,
            ),
          );
        }
        setTimeout(() => live.current.fit(250, g), 0);
        return next;
      },
      setNodeSettings(ids, settings) {
        const L = live.current;
        if (!L.editable || !ids.length) return;
        const drawn: Record<string, Pos> = {};
        for (const [id, n] of Object.entries(L.current?.nodes ?? {}))
          setOwn(drawn, id, { x: n.x, y: n.y });
        const next = setLayoutNodeSettings(L.layout, L.viewName, ids, settings, drawn);
        L.onLayoutChange?.(next, {
          kind: 'settings',
          view: L.viewName,
          ids: [...ids],
          settings: { ...settings },
        });
      },
      getSelection() {
        const visible = new Set(nodesRef.current.map((n) => n.id));
        return Array.from(selectionRef.current).filter((id) => visible.has(id));
      },
      // The state setter of the same name (a method does not shadow it).
      setSelection: (ids) => setSelection(ids.length ? new Set(ids) : EMPTY_SET),
      getGeometry: () => live.current.current,
      getViewport: () => rf.getViewport(),
      setViewport(vp, o) {
        viewMoved.current = true;
        setMinimapHeld(false);
        void rf.setViewport(vp, o?.duration ? { duration: o.duration } : undefined);
      },
      exportSvg(o) {
        const L = live.current;
        if (!L.viewModel || !L.current) return null;
        const colorMode = o?.colorMode ?? L.colorMode;
        return renderDiagramSvgString(L.viewModel, L.current, {
          detailLevel: L.detail,
          edgeStyle: L.edges_,
          colorMode,
          palette: shownPalette(colorMode),
          ...(o?.title ? { title: o.title } : {}),
        });
      },
      async exportPng(o) {
        const L = live.current;
        if (!L.viewModel || !L.current) return null;
        const colorMode = o?.colorMode ?? L.colorMode;
        const palette = shownPalette(colorMode);
        const { exportPng } = await import('../export/png.js');
        return exportPng(L.viewModel, L.current, {
          detailLevel: L.detail,
          edgeStyle: L.edges_,
          colorMode,
          palette,
          scale: o?.scale ?? 2,
          ...(o?.title ? { title: o.title } : {}),
        });
      },
      print(o) {
        const L = live.current;
        const vm = L.viewModel;
        const g = L.current;
        if (!vm || !g) return;
        // Prints are light: the page's colours when it shows light mode.
        const palette = shownPalette('light');
        import('../export/print.js')
          .then(({ printDiagram }) =>
            printDiagram(vm, g, {
              detailLevel: L.detail,
              edgeStyle: L.edges_,
              palette,
              ...(o?.title ? { title: o.title } : {}),
            }),
          )
          .catch((err: unknown) => console.error('relvista: print failed', err));
      },
    }),
    [rf, canvasSize, shownPalette],
  );

  return (
    <div
      ref={rootRef}
      className={['rv-canvas', narrow ? 'rv-canvas--narrow' : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      data-rv-color-mode={colorMode}
      data-rv-layout={layoutFinal ? 'done' : 'pending'}
      data-rv-editable={editable ? 'true' : 'false'}
      style={style}
      onKeyDown={onKeyDown}
      onKeyDownCapture={onKeyDownCapture}
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
            onNodeDoubleClick={onDoubleClick}
            onNodeContextMenu={onContextMenu}
            onNodeDragStart={onDragStart}
            onNodeDrag={onDrag}
            onNodeDragStop={onDragStop}
            onPaneClick={onPane}
            onMoveStart={onMoveStart}
            onMoveEnd={onMoveEnd}
            nodesDraggable={nodeDrag}
            nodesConnectable={false}
            nodesFocusable
            edgesFocusable={false}
            edgesReconnectable={false}
            elementsSelectable={editable}
            deleteKeyCode={null}
            selectionKeyCode={editable ? 'Shift' : null}
            multiSelectionKeyCode={editable ? ['Shift', 'Meta', 'Control'] : null}
            zoomOnDoubleClick={false}
            minZoom={0.05}
            maxZoom={3}
            // No `fitView`: React Flow's own fit runs once its nodes are measured, which can be
            // after (and would replace) the initial view applied below or a restored viewport.
            forceColorMode={colorMode}
            // MIT-licensed React Flow allows hiding it; it is credited in the README instead.
            proOptions={{ hideAttribution: true }}
            aria-label={ariaLabel}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1.2}
              color="var(--rv-grid-dot)"
              bgColor="var(--rv-canvas-bg)"
            />
            {showMinimap && !minimapHeld ? (
              <MiniMap<FlowNode>
                pannable
                zoomable
                className="rv-minimap"
                style={{ width: mini.width, height: mini.height }}
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
      {selectedTable && viewModel ? (
        <SideCard table={selectedTable} model={viewModel} onClose={() => setSelected(null)} />
      ) : null}
      {children}
    </div>
  );
}
