# Phase 2 — editor MVP: design and contracts

Authoritative for phase 2. Two builders work in parallel:

| Builder | Owns (may edit)                                                                                                                                               | Must not edit                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| **A**   | `packages/renderer/**` (src, test, styles), `packages/docusaurus-theme/src/{defaults,options}.ts` + its tests                                                 | `apps/**`, `packages/core/**` |
| **B**   | `apps/editor/**`, `apps/docs/**` (navbar, landing CTA, copy step, docs page), root `package.json` scripts, `.github/workflows/*.yml`, `README.md` status line | `packages/**`                 |

Nobody edits `packages/core/**`, `examples/**`, `schemas/**` or adds dependencies: everything
needed is installed (see [Dependencies](#dependencies)). If a contract below turns out wrong, the
builder who finds it writes the smallest fix into this file and tells the other; renderer
interfaces change only with both sides updated.

Decisions behind this design: [0004](../decisions/0004-editor.md) (Monaco bundling, deploy path,
share format, save semantics). Phase gate (decision 0001): dbdiagram files round-trip unchanged
through the editor.

Quality bar: dbdiagram.io's editor, open source and file-based. Every interaction below has a
keyboard path, a visible focus state, light and dark themes, and works at 390 px wide.

---

## 1. What ships

```text
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ ◆ relvista  schema.dbml ●   New ▾  Open ▾  Save  Save as   Share  Export ▾  Auto-layout ▾ │
│                                                  View: [All tables ▾]   ◐   ?             │
├─────────────────────────────────────────┬─┬───────────────────────────────────────────────┤
│ main.dbml  common/users.dbml            │ │                                  [+][−][⤢]   │
│  1  Project shop {                      │ │   ┌────────┐        ┌──────────┐ [↶][↷]      │
│  2    database_type: 'PostgreSQL'       │║│   │ users  │───────<│ orders   │              │
│  3  }                                   │ │   └────────┘        └──────────┘              │
│  4  Table users {   ← cursor            │ │      (highlighted)                            │
│ …   Monaco DBML editor                  │ │      live diagram (DiagramCanvas, editable)   │
├─────────────────────────────────────────┴─┴───────────────────────────────────────────────┤
│ ⨯ 1 error  ⚠ 0   ·   12 tables · 14 refs   ·   Ln 4, Col 13   ·   UTF-8 · LF   ·   Saved    │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

Below 768 px: top bar keeps logo, file name, Save, Share and an overflow menu (⋯) for the rest; the
split becomes two tabs **Code** / **Diagram** (one pane visible, both mounted); status bar shows
diagnostics and save state only.

In scope (phase 2):

- Monaco DBML editing: highlighting, live diagnostics, completion, hover, go to definition, find
  references, quick fixes, multi-file tabs for `use` / `reuse` projects.
- Live diagram: drag tables, sticky notes and groups (moves members); multi-select (Shift+click,
  Shift+drag box); auto-layout (all unpinned / only unplaced); pin and collapse per node; per-view
  layouts; layout undo/redo; click a node → reveal its code; cursor in a block → highlight its
  node.
- Files: open file / folder / URL / drop; save / save as with byte-exact semantics; sidecar
  layout; download fallback; autosave + restore; unsaved-changes guard; new (empty, example, SQL).
- Share link (`#dbml=` compressed, with layout and view), copy button; `?url=` remote files.
- Export: SVG, PNG, print/PDF, DBML, layout JSON, SQL (PostgreSQL, MySQL, SQL Server, Oracle);
  import from SQL. SQL is lazy (`@dbml/core` in a worker).
- Docs integration: navbar "Editor", landing CTA, theme `editorUrl` default, `/editor/` docs page.

Out of scope (phase 3+): editing refs/edges by drawing, waypoint editing, single-file layout
mode (trailing comment), collaboration, multi-file share links, formatter (never), Git
integration, trimming Monaco's feature set, compile in a worker (only if §6.5 measurements fail).

---

## 2. Dependencies

Already added with `pnpm add` and installed (`pnpm-lock.yaml` updated). Builders add nothing.

`apps/editor/package.json` (`relvista-editor`, private; `scripts` is empty — builder B adds them,
see §7.1, so root `pnpm build` / `pnpm test` keep working until the app exists):

| Package                                | Spec          | Resolved | Use                                                     |
| -------------------------------------- | ------------- | -------- | ------------------------------------------------------- |
| `react`, `react-dom`                   | `19.3.1`      | 19.3.1   | UI (same version as the rest of the workspace)          |
| `monaco-editor`                        | `0.57.0`      | 0.57.0   | code editor, bundled by Vite (no CDN)                   |
| `@dbml/parse`                          | `12.1.0`      | 12.1.0   | Monarch grammar + language services (same copy as core) |
| `@dbml/core`                           | `12.1.0`      | 12.1.0   | SQL import/export, lazy in a worker                     |
| `elkjs`                                | `0.12.1`      | 0.12.1   | `elkjs/lib/elk-worker.min.js?url` for `workerUrl`       |
| `@relvista/core`                       | `workspace:*` | —        | compile, layout file API                                |
| `@relvista/renderer`                   | `workspace:*` | —        | `DiagramCanvas`, export, share codec                    |
| dev `vite`                             | `7.3.8`       | 7.3.8    | build (same Vite that vitest 3.2.7 uses)                |
| dev `@vitejs/plugin-react`             | `5.2.0`       | 5.2.0    | JSX/fast refresh                                        |
| dev `@playwright/test`                 | `1.65.1`      | 1.65.1   | e2e (same as docs)                                      |
| dev `@axe-core/playwright`             | `4.14.0`      | 4.14.0   | accessibility checks in e2e                             |
| dev `vitest`                           | `^3.2.4`      | 3.2.7    | unit tests                                              |
| dev `jsdom`                            | `^27`         | 27.4.0   | unit test DOM                                           |
| dev `@testing-library/react`           | `^16`         | 16.3.3   | component tests                                         |
| dev `typescript`                       | `~5.9.3`      | 5.9.3    |                                                         |
| dev `@types/react`, `@types/react-dom` | `^19`         | 19.3.0   |                                                         |
| dev `@types/node`                      | `^24`         | 24.19.2  | config files                                            |

`packages/renderer`: no new dependencies (CompressionStream, `btoa`/`atob` are platform APIs;
Node 24 has `CompressionStream('deflate-raw')` for tests).

Builder B also adds `"relvista-editor": "workspace:*"` to `apps/docs` devDependencies (§7.2) — a
workspace link, no download; run `pnpm install` afterwards (offline, lockfile-only change).

---

## 3. Renderer additions (builder A)

### 3.1 Module layout

```text
packages/renderer/src/
  canvas/
    DiagramCanvas.tsx     NEW  controlled, optionally editable canvas (React Flow inside)
    layoutEdit.ts         NEW  pure Layout edit helpers (positions, settings, rounding)
    useCanvasGeometry.ts  NEW  sync→ELK geometry hook, moved out of DbmlViewer (+ stability rules)
    drag.ts               NEW  pure drag/group-drag bookkeeping (testable without React Flow)
    index.ts              NEW
  share/
    codec.ts              NEW  base64url + deflate-raw, SharePayload encode/decode
    editorLink.ts         MOVED from viewer/ and rewritten (async createEditorLink)
    index.ts              NEW
  viewer/
    DbmlViewer.tsx        REFACTOR: compile + <DiagramCanvas> + Toolbar + banner + SideCard
    editorLink.ts         DELETED (re-exported from share/ for one import path: see index)
  index.ts                + export * from './canvas/index.js', './share/index.js'
  styles.css              + .rv-canvas, highlight ring, selection, group drag handle
```

`DbmlViewer`'s public props and behaviour stay exactly as in `phase1-contracts.md` (all existing
tests and the docs e2e keep passing; only the editor-link tests change to the new hash format).

### 3.2 `DiagramCanvas`

```ts
// packages/renderer/src/canvas/DiagramCanvas.tsx
import type {
  DetailLevel,
  DiagramGeometry,
  DiagramModel,
  Layout,
  NodeLayout,
  SourceSpan,
  Viewport,
} from '@relvista/core';
import type { CSSProperties, ReactNode, Ref } from 'react';
import type { ColorMode } from '../theme.js';
import type { EdgeStyle } from '../svg/routing.js';

export type CanvasNodeKind = 'table' | 'note' | 'group';

/** 'unpinned': re-place every node without `pinned: true`. 'unplaced': place only nodes with no position. */
export type AutoLayoutScope = 'unpinned' | 'unplaced';

export type LayoutChange =
  /** User dragged nodes (tables, notes, or a group = its member tables). One undo step. */
  | { kind: 'move'; view: string; ids: string[] }
  /** Canvas placed nodes that had no saved position (new file, new table). NOT a user edit. */
  | { kind: 'place'; view: string; ids: string[] }
  /** `runAutoLayout` finished. One undo step. */
  | { kind: 'auto-layout'; view: string; scope: AutoLayoutScope; ids: string[] }
  /** `setNodeSettings` through the handle (pin / collapse). One undo step. */
  | { kind: 'settings'; view: string; ids: string[]; settings: NodeSettings };

export type NodeSettings = Partial<Pick<NodeLayout, 'pinned' | 'collapsed'>>;

export interface CanvasNodeEvent {
  id: string; // "schema.table" | "note:<name>" | "group:<name>"
  kind: CanvasNodeKind;
  span: SourceSpan | null; // declaration in the source (model span), for reveal
  clientX: number;
  clientY: number;
  /** Modifier state, so the app can ignore Shift/Cmd clicks used for selection. */
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

export interface CanvasExportOptions {
  title?: string;
  colorMode?: ColorMode; // default: the canvas's colorMode
}

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
  colorMode?: ColorMode; // default 'light'
  detailLevel?: DetailLevel; // default layout.settings.detailLevel ?? 'all'
  edgeStyle?: EdgeStyle; // default layout.settings.theme.edgeStyle ?? 'orthogonal'
  minimap?: boolean | 'auto'; // default 'auto' (as DbmlViewer)
  workerUrl?: string | URL; // ELK worker script
  /** Node drawn with the highlight ring and its refs lit (cursor-in-block in the editor). */
  highlightedNodeId?: string | null;
  onNodeClick?: (e: CanvasNodeEvent) => void;
  onNodeDoubleClick?: (e: CanvasNodeEvent) => void;
  /** When set, the canvas calls preventDefault on the native contextmenu event. */
  onNodeContextMenu?: (e: CanvasNodeEvent) => void;
  onPaneClick?: () => void;
  /** Table details card on click. Default `!editable`. */
  sideCard?: boolean;
  /**
   * Identity of the document. The initial view (fit / saved viewport) is applied on mount, when
   * this changes, and when `view` changes — never because `model` or `layout` changed.
   * DbmlViewer passes a key derived from the source (today's refit-on-source-change behaviour).
   */
  resetKey?: string;
  /** First view of this resetKey instead of the computed one (a restored editor session). */
  initialViewport?: Viewport | null;
  /**
   * 'pending' while the ELK result is outstanding, then 'done' (mirrors data-rv-layout); reported
   * again whenever resetKey changes.
   */
  onLayoutStatus?: (status: 'pending' | 'done') => void;
  /** A pan or zoom ended (the editor autosaves the viewport into its session). */
  onViewportChange?: (viewport: Viewport) => void;
  /** Padding the initial view and Fit keep free for overlays (px). Default DbmlViewer's PAD. */
  padding?: Partial<Record<'top' | 'right' | 'bottom' | 'left', number>>;
  ariaLabel?: string; // default 'Entity-relationship diagram'
  className?: string;
  style?: CSSProperties;
  /** Overlays (toolbars, chips) rendered inside the canvas root, after the React Flow pane. */
  children?: ReactNode;
  ref?: Ref<DiagramCanvasHandle>; // React 19 ref-as-prop
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
  /** Replaces the canvas selection (`[]` clears it): the editor clears it when its cursor moves. */
  setSelection(ids: string[]): void;
  /** Geometry as drawn now (after drags), active view. */
  getGeometry(): DiagramGeometry | null;
  getViewport(): Viewport;
  setViewport(viewport: Viewport, options?: { duration?: number }): void;
  exportSvg(options?: CanvasExportOptions): string | null; // null without a model
  exportPng(options?: CanvasExportOptions & { scale?: number }): Promise<Blob | null>; // scale default 2
  print(options?: CanvasExportOptions): void;
}

export function DiagramCanvas(props: DiagramCanvasProps): ReactElement;
```

Rules (normative):

1. **Root and test hooks.** Root `div.rv-canvas` with `data-rv-color-mode`, `data-rv-layout=
"pending"|"done"`, `data-rv-editable="true"|"false"`. Nodes are React Flow nodes with
   `data-id` = node id (`.react-flow__node-rvTable`, `-rvNote`, `-rvGroup`). Highlighted node:
   class `rv-highlighted` on `.rv-node`; selected (editable): `rv-selected`. `DbmlViewer` keeps
   its `.rv-viewer` root (with `data-rv-layout` as today) around the canvas.
2. **Geometry.** Same pipeline as DbmlViewer today: `selectView` → `mergeViewDefaults(layout,
view)` → sync dagre geometry → ELK when some visible node has no saved x/y (debounced 150 ms
   after the first run). Saved positions always win.
3. **Stability (editable).** Once ELK placed nodes, the canvas reports them as one `'place'`
   change for the active view (only ids that had no effective position, positions rounded to
   integers). From then on they are saved positions, so typing never reshuffles the diagram.
   Read-only mode never reports `'place'` (and never calls `onLayoutChange` at all).
4. **Where changes go.** View `'*'` writes `layout.views['*'].nodes[id]`. A named view writes an
   override into `layout.views[view].nodes[id]` (creating the view entry), leaving the default
   view untouched — per-view layouts. Existing fields of an entry (`pinned`, `collapsed`, `w`,
   `h`) are kept. `layout === null` starts from `emptyLayout()`. Positions are rounded to whole
   px on commit. Use `layoutEdit.ts` for all of this.
5. **Drag.** During a drag React Flow moves nodes locally; on drag stop the canvas reports one
   `'move'` with every moved id (multi-select moves several). Dragging a group (by its header
   band, `dragHandle: '.rv-group-drag'`) moves all its visible member tables by the same delta,
   live, and reports their ids (the group box itself is never stored; it is computed). A drag of
   less than 1 px reports nothing. Keyboard: arrow keys move selected nodes 10 px (Shift: 1 px),
   committed as one `'move'` 300 ms after the last key press.
6. **Auto-layout.** `runAutoLayout('unpinned')` lays out the active view with `saved` = only the
   pinned nodes' positions; `'unplaced'` with every saved position. Every visible node's new
   position is written (scope `'unplaced'`: only the newly placed ones). ELK in the worker when
   `workerUrl` is set. Viewport fits afterwards (250 ms).
7. **Viewport.** Initial view per `resetKey`/`view` as in phase 1 (saved `viewport` of the view,
   else readable-floor fit). Layout or model changes never move the viewport. The canvas never
   writes `viewport` into the layout (panning must not dirty the file); the app may read
   `getViewport()` for its session and pass it back as `initialViewport`. The editor opens on
   the canvas's first view (phase-1 contract: fit down to the fit floor, else the readable zoom);
   Fit is a command.
8. **Highlight.** `highlightedNodeId` gets the ring (`--rv-selection`, 2 px, outside the border)
   and its refs drawn lit, like hover. Hover still works on top. Unknown ids are ignored.
9. **Clicks.** `onNodeClick` for tables, notes and groups (group: click on its header band).
   Editable mode: a click selects (Shift adds); the side card shows only when `sideCard` is true.
10. **Export.** Handle exports use the geometry as drawn (after drags), the active view, the
    detail level and edge style, through the existing export module (lazy `import()` as today).
11. **No compile.** The canvas never calls `compileDbml`; errors are the app's business.
    `DbmlViewer` compiles and renders the banner, toolbar, title, side card and empty states
    around the canvas.
12. **SSR.** Importing the module touches no browser API (as DbmlViewer).

### 3.3 `layoutEdit.ts` (pure, exported)

```ts
import type { Layout, NodeLayout, NodeOverride } from '@relvista/core';
import type { NodeSettings } from './DiagramCanvas.js';

/** Positions the active view shows: mergeViewDefaults + only entries with finite x and y. */
export function effectivePositions(
  layout: Layout | null,
  view: string,
): Record<string, { x: number; y: number }>;

/**
 * Writes positions (rounded to integers) into `view` ('*' → default view, else the named view's
 * overrides), keeping the other fields of each entry. Returns a new Layout; `null` → emptyLayout().
 */
export function setNodePositions(
  layout: Layout | null,
  view: string,
  positions: Record<string, { x: number; y: number }>,
): Layout;

/**
 * Sets or clears (`false` → field removed) `pinned` / `collapsed` in `view`. In a named view a
 * node with no position anywhere gets only the setting (no x/y), as the schema allows.
 */
export function setNodeSettings(
  layout: Layout | null,
  view: string,
  ids: readonly string[],
  settings: NodeSettings,
): Layout;

/** The effective entry of one node in a view (merged), or undefined. */
export function nodeEntry(
  layout: Layout | null,
  view: string,
  id: string,
): NodeOverride | undefined;
```

All results pass `parseLayout` and are stable under `serializeLayout` (tests check both).

### 3.4 Share codec (`share/codec.ts`, exported)

```ts
import type { Layout } from '@relvista/core';

/** What a share link carries. */
export interface SharePayload {
  dbml: string; // without BOM
  layout?: Layout | null;
  view?: string | null; // DiagramView name; omitted / '*' / null → default view
}

export const DEFAULT_EDITOR_URL = 'https://uncovered-songs.github.io/relvista/editor/';

/** Hash body without '#': "dbml=<b64u>[&layout=<b64u>][&view=<enc>]", keys in this order. */
export function encodeShareHash(payload: SharePayload): Promise<string>;

/**
 * Accepts "#…" or "…". Returns null when there is no `dbml` key. A `dbml` value that is not
 * base64url or does not inflate is read as legacy `encodeURIComponent` text (phase-1 links).
 * A `layout` that fails to inflate or `parseLayout` is dropped (`layoutError` says why).
 * Inflating stops past `maxBytes` (default 5 MB): ShareTooLargeError (decompression bombs).
 */
export function decodeShareHash(
  hash: string,
  options?: { maxBytes?: number },
): Promise<(SharePayload & { layoutError?: string; legacy?: boolean }) | null>;

/** `editorUrl` without its hash + '#' + encodeShareHash(payload). */
export function createEditorLink(editorUrl: string, payload: SharePayload): Promise<string>;

/** Exposed for tests and the editor's size warning. */
export function deflateToBase64Url(text: string): Promise<string>;
export function inflateFromBase64Url(b64u: string): Promise<string>; // throws on bad input
```

- base64url: RFC 4648 §5 alphabet (`A–Z a–z 0–9 - _`), no `=` padding; encode bytes in 32 KiB
  chunks through `btoa(String.fromCharCode(...chunk))` (no `Uint8Array#toBase64`, not universal).
- deflate-raw via `new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))`
  and `new Response(stream).arrayBuffer()`; inflate likewise with `DecompressionStream`. UTF-8
  with `TextEncoder` / `TextDecoder('utf-8', { fatal: true })`.
- `layout` encodes `serializeLayout(layout)`; decode runs `parseLayout`.
- `view` uses `encodeURIComponent`; `URLSearchParams` decodes it.
- `entrySource(source)` stays exported (moved to `share/editorLink.ts`).

`DbmlViewer` "Open in editor": `createEditorLink(editorUrl, { dbml: entrySource(source), layout,
view: viewName === '*' ? null : viewName })` in an effect; the button renders once the href
exists (and is hidden for multi-file sources, as today). `DbmlViewer` keeps no default
`editorUrl` (read-only behaviour unchanged); the Docusaurus theme defaults to
`DEFAULT_EDITOR_URL` (§3.6).

### 3.5 Styles

Add to `styles.css` (and `PALETTES` if a new colour is needed; `test/theme.test.ts` keeps them in
sync): `.rv-canvas` (fills its parent: `position: relative; width: 100%; height: 100%`),
`.rv-node.rv-highlighted` (2 px `--rv-selection` ring + soft glow), `.rv-node.rv-selected`
(ring), `.rv-group-drag` (header band of a group node, `cursor: grab`; `grabbing` while
dragging), `[data-rv-editable='true'] .react-flow__node { cursor: grab }`, and a
`.react-flow__selection` box in `--rv-selection` at 8% fill. Styles that today hang off
`.rv-viewer` but belong to the canvas move to `.rv-canvas` (the viewer contains a canvas, so
existing docs pages look identical).

### 3.6 Docusaurus theme (builder A)

- `defaults.ts`: `editorUrl` defaults to `DEFAULT_EDITOR_URL` (import from `@relvista/renderer`);
  `editorUrl: false` hides the button. Type: `editorUrl?: string | false`.
- `options.ts`: `editorUrl: Joi.alternatives(Joi.string().uri({ allowRelative: true }),
Joi.boolean().valid(false))`.
- `DbmlDiagram` passes `editorUrl || undefined` and also `layout` + `view` reach the link through
  DbmlViewer (already passed).
- Theme tests: default present, `false` hides, relative URL accepted.

### 3.7 Renderer tests (builder A, vitest)

- `test/layoutEdit.test.ts`: default vs named view writes; field preservation; rounding; `null`
  input; `__proto__` / quoted ids; every result `parseLayout`-valid; `serializeLayout` stable.
- `test/share.test.ts`: round trip for every example (single-file text), unicode/emoji, CRLF
  text, 1 MB text; layout + view round trip; legacy `encodeURIComponent` link decodes with
  `legacy: true`; garbage layout dropped with `layoutError`; output alphabet is base64url only;
  keys order; `createEditorLink` replaces an existing hash.
- `test/canvas.test.tsx` (jsdom, React Flow as in `viewer.test.tsx`): controlled positions are
  drawn; read-only never calls `onLayoutChange`; editable reports one `'place'` after ELK
  (mock `layoutAsync` or use `workerUrl` undefined + fake timers) with integer positions and only
  unplaced ids; `highlightedNodeId` sets `rv-highlighted`; `onNodeClick` payload (id, kind, span);
  handle: `exportSvg` contains table names, `runAutoLayout('unpinned')` keeps pinned positions and
  reports `'auto-layout'`, `setNodeSettings` reports `'settings'`; named view writes overrides;
  viewport unchanged after a layout prop change (spy `setViewport`).
- `test/drag.test.ts`: `drag.ts` pure helpers — group delta applied to visible members only,
  sub-pixel drags ignored, multi-select ids, keyboard nudge batching.
- Existing suites pass unchanged except editor-link expectations (new format).

---

## 4. Editor app (builder B)

### 4.1 Module structure

```text
apps/editor/
  index.html                  <title>relvista editor</title>, theme bootstrap inline script (no flash)
  vite.config.ts              base, worker format 'es', server.fs.allow repo root, react plugin
  tsconfig.json               extends ../../tsconfig.base.json; moduleResolution Bundler, jsx, types vite/client
  vitest.config.ts            environment jsdom for *.test.tsx, node for *.test.ts
  playwright.config.ts        vite preview on a free port, base /relvista/editor/
  public/favicon.svg          copy of apps/docs/static/img/favicon.svg
  README.md                   dev/build/test commands
  src/
    main.tsx                  createRoot, imports styles, monaco/setup (side effects)
    App.tsx                   shell: TopBar, SplitPane(Code, Diagram), StatusBar, dialogs, toasts
    styles/
      tokens.css              --rv-ui-* reuse + editor tokens, light/dark ([data-theme])
      app.css                 layout, top bar, menus, split, status bar, mobile tabs
    state/
      types.ts                EditorFile, TextEnvelope, Workspace, SessionV1 (§4.3)
      store.ts                useSyncExternalStore store + actions (no state library)
      history.ts              layout undo/redo stack
      session.ts              IndexedDB autosave / restore (own 60-line idb helper)
      compile.ts              debounced compileDbml, last good model, rename detection hook
      renames.ts              detectRenames(prev, next) (pure)
    monaco/
      setup.ts                MonacoEnvironment.getWorker, register 'dbml', themes
      MonacoEditor.tsx        React wrapper (one editor, one model per file, view state per file)
      dbmlLanguage.ts         Monarch + language configuration (official, §4.6)
      languageService.ts      @dbml/parse Compiler over MemoryProjectLayout; provider registration
      hover.ts                hover provider from the DiagramModel
      markers.ts              Diagnostic[] → IMarkerData (pure)
      themes.ts               relvista-light / relvista-dark token colours
      positions.ts            SourceSpan ↔ Monaco IRange, cursor → node id (pure)
    files/
      text.ts                 decodeDbml / encodeDbml / restoreLineEndings / saveBytes (pure)
      lineDiff.ts             Myers line diff used by restoreLineEndings (pure)
      fsAccess.ts             File System Access API: open file(s), open folder, save, save as, permissions
      fallback.ts             <input type=file> (also webkitdirectory) + downloads
      folder.ts               walk a directory (handles or File list) → files, choose entry
      sidecar.ts              find / parse / write <entry>.layout.json
      drop.ts                 drag-and-drop of files/folders (getAsFileSystemHandle when available)
      remote.ts               ?url= fetch, GitHub blob → raw rewrite, sidecar probe
      limits.ts               size and count limits (§4.4)
    share/
      shareLink.ts            build link (renderer codec), read #hash on load, size warnings
    sql/
      sql.worker.ts           dynamic import('@dbml/core'); export/import messages
      sql.ts                  promise API over the worker
    examples.ts               import.meta.glob of ../../../examples/** (lazy, ?raw)
    keyboard.ts               shortcut table + dispatcher (focus-aware undo routing)
    theme.ts                  light/dark/system, localStorage 'theme' shared with Docusaurus
    components/
      TopBar.tsx  FileMenu.tsx  NewMenu.tsx  ExportMenu.tsx  AutoLayoutMenu.tsx  ViewSelect.tsx
      ShareDialog.tsx  ExamplesDialog.tsx  SqlImportDialog.tsx  EntryPickerDialog.tsx
      HelpDialog.tsx  ConfirmDialog.tsx  NodeMenu.tsx  FileTabs.tsx  SplitPane.tsx
      StatusBar.tsx  MobileTabs.tsx  Toasts.tsx  EmptyState.tsx  Menu.tsx (roving-focus menu)
    diagram/
      DiagramPane.tsx         <DiagramCanvas editable> + overlay (zoom, fit, undo/redo, errors chip)
      sync.ts                 node click → reveal, cursor → highlight, focusNode policy
  test/                       vitest unit tests (§6.1)
  e2e/                        Playwright specs + fixtures (§6.2)
```

### 4.2 Data flow

```text
 Monaco models ──onDidChangeContent──▶ store.texts[key] ──debounce 150 ms──▶ compileDbml({files, entry})
      ▲                                     │                                        │
      │ open/new only (createModel)         │ LS layout.setSource (sync)             ▼
      │                                     ▼                              model (last good), diagnostics
   file open ◀── files/*            languageService (completion, …)         │            │
                                                                            ▼            ▼
                                     DiagramCanvas ◀── layout (store) ◀─ renames   markers, status bar
                                          │ onLayoutChange(next, change)
                                          ▼
                                 store.layout + history (+ layoutDirty unless 'place')
```

- One `DiagramModel` source of truth: `compileDbml` on the Monaco texts **without BOM**, so
  every `SourceSpan` line/column is directly a Monaco position (columns are UTF-16 in both).
- Compile is synchronous in the main thread, debounced 150 ms (0 ms for the first compile after
  open). If the model is `null` (errors), the canvas keeps the last good model and the pane shows
  a chip "Showing the last valid diagram · N errors" (click → next error).
- Rename detection runs on each new good model before the layout reaches the canvas:
  `detectRenames(prevGood, nextGood)` returns `[oldId, newId]` pairs; each is applied with core
  `renameNode` when the layout has `oldId` and no `newId`, merged into the previous history entry
  (not its own undo step). Pairing rule: per kind (table / note / group), the ids that disappeared
  and appeared in the same compile; pair when exactly one candidate shares `span.file` and
  `span.start.line`, else when exactly one shares the same column-name list (tables). Otherwise no
  rename (the new node is placed, the old entry pruned at save).
- Layout dirtiness: `layoutDirty = userTouched && serializeLayout(layout) !== savedLayoutText`;
  `userTouched` is set by `'move' | 'auto-layout' | 'settings'` changes and undo/redo, never by
  `'place'`. A rename sets it only when a layout file exists (`savedLayoutText !== null`): the
  file names the old id, so Save must write it or the renamed node loses its position on the next
  open. Without a layout file a rename alone stays clean (nothing on disk refers to the id).

### 4.3 State types

```ts
// apps/editor/src/state/types.ts
import type { DiagramModel, Diagnostic, Layout } from '@relvista/core';

export type Eol = '\n' | '\r\n' | '\r';

/** How a file looked on disk. */
export interface TextEnvelope {
  bom: boolean; // UTF-8 BOM (EF BB BF) present
  eol: Eol; // dominant terminator; '\n' when the file has none
  mixed: boolean; // more than one terminator kind
}

export interface EditorFile {
  /** Project-relative path with '/' (single file: its name, e.g. 'schema.dbml'). Monaco URI file:///<key>. */
  key: string;
  envelope: TextEnvelope;
  /** As opened / last saved: exact bytes and their decoded text (BOM stripped, original EOLs). */
  disk: { bytes: Uint8Array; text: string } | null; // null: untitled, shared, example, SQL import
  handle: FileSystemFileHandle | null;
  /** Monaco alternative version id at open/save (dirty = differs). Runtime only. */
  savedVersionId: number;
}

export type DocumentOrigin = 'untitled' | 'file' | 'folder' | 'url' | 'share' | 'example' | 'sql';

export interface Workspace {
  id: string; // crypto.randomUUID(); canvas resetKey
  origin: DocumentOrigin;
  name: string; // display name (entry file name, or 'Untitled.dbml')
  entry: string; // key of the entry file
  files: EditorFile[]; // entry first, then sorted by key
  dir: FileSystemDirectoryHandle | null;
  layout: Layout | null;
  savedLayoutText: string | null; // sidecar text as on disk / last saved; null = none
  layoutHandle: FileSystemFileHandle | null;
  layoutInvalid: string | null; // parse error of an existing sidecar (never overwrite silently)
  view: string; // '*' or DiagramView name
}

export interface CompileState {
  model: DiagramModel | null; // last good
  diagnostics: Diagnostic[]; // of the latest compile
  stale: boolean; // latest compile had errors (showing last good)
}

/** IndexedDB 'relvista-editor' / store 'sessions' / key 'current' (and 'previous'). */
export interface SessionV1 {
  v: 1;
  savedAt: number;
  workspace: Omit<Workspace, 'files' | 'layout'> & {
    files: Array<Omit<EditorFile, 'savedVersionId'> & { text: string; dirty: boolean }>;
    layoutText: string | null; // serializeLayout(layout)
    layoutDirty: boolean;
  };
  ui: {
    split: number;
    tab: 'code' | 'diagram';
    activeFile: string;
    viewport?: { x: number; y: number; zoom: number };
  };
}
```

File System Access handles are structured-cloneable, so they are stored in the session; after a
reload the first save calls `handle.requestPermission({ mode: 'readwrite' })` inside the click.

### 4.4 Files

**Opening.** All entry points end in `openWorkspace(files, options)`:

| Action             | API (Chromium)                                                  | Fallback (Firefox, Safari)                        |
| ------------------ | --------------------------------------------------------------- | ------------------------------------------------- |
| Open file… (Mod+O) | `showOpenFilePicker({ multiple: true, types: [.dbml, .json] })` | `<input type=file multiple accept=".dbml,.json">` |
| Open folder…       | `showDirectoryPicker({ mode: 'readwrite' })`                    | `<input type=file webkitdirectory>`               |
| Open from URL…     | dialog → `?url=` logic (`remote.ts`)                            | same                                              |
| Drop on window     | `DataTransferItem.getAsFileSystemHandle()`                      | `item.webkitGetAsEntry()` / `files`               |
| Recent (Chromium)  | last 8 handles from IndexedDB, permission on click              | hidden                                            |

- Picking a `.dbml` plus its `.dbml.layout.json` (multi-select or drop) pairs them. A single
  `.dbml` opened alone has no sidecar handle; the first save with `layoutDirty` asks once with
  `showSaveFilePicker({ suggestedName: '<name>.dbml.layout.json' })` and remembers the handle.
  Opening a folder reads and writes the sidecar silently — the recommended path, said in the
  help dialog.
- Folder walk (`folder.ts`): `*.dbml` and `*.dbml.layout.json`, depth ≤ 4, skips dot-folders and
  `node_modules`, at most 200 files and 10 MB total (`limits.ts`; beyond → error toast). Entry:
  `main.dbml` at the root if present; else the only root `*.dbml`; else `EntryPickerDialog`. The
  file tabs show `model.files` (files the entry reaches) first, then other `.dbml` files dimmed
  ("not used by main.dbml").
- Decoding (`text.ts`): `TextDecoder('utf-8', { fatal: true, ignoreBOM: true })`; a leading
  U+FEFF is removed and recorded; UTF-16 BOMs or invalid UTF-8 → "relvista only opens UTF-8
  files" (no document change). Files over 5 MB are refused.
- Layout sidecar: `parseLayout(text)`; invalid → warning toast with the first error path,
  `layoutInvalid` set, diagram opens auto-laid-out; saving later asks "Replace the invalid layout
  file?" (cancel = save DBML only).

**Saving** (`saveBytes`, normative; gate in §6.2):

```ts
// apps/editor/src/files/text.ts
export interface DecodedText {
  text: string;
  envelope: TextEnvelope;
}
export class NotUtf8Error extends Error {}
export function decodeDbml(bytes: Uint8Array): DecodedText; // throws NotUtf8Error
export function detectEnvelope(textWithoutBom: string, bom: boolean): TextEnvelope;
/**
 * `edited` uses '\n' only (Monaco getValue(EndOfLinePreference.LF)). Lines unchanged relative to
 * `original` keep their original terminator; inserted/changed lines get `eol`. Whether the text
 * ends with a terminator follows `edited`.
 */
export function restoreLineEndings(original: string, edited: string, eol: Eol): string;
export function encodeDbml(text: string, bom: boolean): Uint8Array; // BOM + UTF-8
/** Bytes to write for a file whose current Monaco text (LF) is `editedLf`. */
export function saveBytes(
  file: Pick<EditorFile, 'disk' | 'envelope'>,
  editedLf: string,
): Uint8Array;
```

1. If `file.disk` exists and `editedLf === normalizeToLf(file.disk.text)` → return
   `file.disk.bytes` unchanged (covers "opened and saved", and "edited then undone").
2. Else if `!envelope.mixed` → `encodeDbml(editedLf.replaceAll('\n', envelope.eol), bom)`.
3. Else → `encodeDbml(restoreLineEndings(file.disk.text, editedLf, envelope.eol), bom)`;
   `lineDiff.ts` is Myers O(ND) on lines, falling back to common prefix/suffix when N·D > 10⁷.
4. After a successful write: `disk = { bytes, text: decoded }`, `savedVersionId =
model.getAlternativeVersionId()`.

Monaco model creation: `monaco.editor.createModel(text, 'dbml', uri)` then
`model.setEOL(envelope.eol === '\r\n' ? CRLF : LF)` so new lines match the file; options
`unusualLineTerminators: 'off'`. No code path calls `model.setValue` or `pushEditOperations`
except quick fixes and the user's own commands.

**Save actions.**

- **Save (Mod+S):** for each dirty file with a writable handle → `createWritable()`, write,
  close; files without handle → Save as. Then the sidecar if `layoutDirty`: prune first
  (`pruneLayout(layout, ids of the full model)` only when the latest compile had no errors), then
  `serializeLayout`. Directory workspaces write `<entry>.layout.json` in the entry's folder. The
  dirty dot clears per file as each write succeeds; a failed write keeps it and shows a toast.
  Before writing, each file (and the sidecar) is read back: when its bytes differ from what was
  opened or last saved (an IDE, `git pull`), a confirm dialog "<name> changed on disk" asks
  before replacing it (Cancel saves nothing).
- **Save as (Mod+Shift+S):** single file: `showSaveFilePicker({ suggestedName })`; then the
  sidecar picker if `layoutDirty`. A multi-file (folder) workspace moves as a whole: Save as
  picks a folder and writes every file at its relative path plus the layout file (as Save of a
  folder without a place on disk does), so relative `use` imports keep resolving. Fallback: download `<name>.dbml` (and
  `<name>.dbml.layout.json` if `layoutDirty`) with `downloadBlob`.
- **No FSA:** Save = Save as = downloads (bytes from `saveBytes`, `application/octet-stream` so
  browsers do not re-encode). The status bar says "Downloaded".
- Untitled documents: Save = Save as; suggested name `<Project name or 'schema'>.dbml`.

**Autosave and guard.** Every change (text, layout, view, UI) writes `SessionV1` to IndexedDB,
debounced 500 ms and on `visibilitychange: hidden`. On load without `#dbml=` / `?url=`: restore
`current` (texts, layout, handles, view, split, viewport). Loading a share link, URL, example or
new document moves `current` to `previous` first; File menu → "Restore previous session". A
`BroadcastChannel('relvista-editor')` ping detects a second tab: the later tab shows a banner
"Open in another tab — autosave paused here" and stops writing. `beforeunload` prompts while any
file or the layout is dirty relative to disk (untitled with content counts as dirty).
A restored session re-reads its files where read access is still granted (no prompt at
startup): files unchanged in the session open as they are on disk now (toast "Reloaded from
disk"); files with unsaved edits keep the edits (toast) and Save asks before replacing them.

### 4.5 Share and URL loading (`share/shareLink.ts`, `files/remote.ts`)

- Share dialog: "Include layout" (default on when a layout exists), "Open in current view"
  (default on when view ≠ '*'), read-only link field, **Copy link** (`navigator.clipboard.
writeText`, falls back to selecting the field), size line: `1.2 KB link`. Warnings: > 8 000
  characters "Long link — some chat apps cut links this long"; > 2 MB disabled "Too large to
  share as a link; save the file instead". Multi-file workspaces: the dialog explains the link
  carries the entry file only.
- On load with `#dbml=`: `decodeShareHash` → new untitled workspace (origin `share`, name from
  `Project` name or `shared.dbml`), layout from the link, view if present; then
  `history.replaceState` removes the hash so reload resumes the session, not the link.
  Decode failure → toast "This link is damaged" and the normal session.
- `?url=<url>`: only `https:` (and `http://localhost` for dev); GitHub
  `https://github.com/o/r/blob/<ref>/<path>` → `https://raw.githubusercontent.com/o/r/<ref>/<path>`;
  `fetch(url, { mode: 'cors', credentials: 'omit' })`, 5 MB cap, bytes through `decodeDbml`;
  sidecar probe `<url>.layout.json` (404 ignored). Origin `url`, name = last path segment, Save =
  Save as. Errors (CORS, 404) → dialog with the reason and the URL. The `url` param is removed
  with `replaceState` after loading.

### 4.6 Monaco DBML

- **Setup** (`monaco/setup.ts`):

  ```ts
  import * as monaco from 'monaco-editor/editor/editor.api';
  import 'monaco-editor/features/register.all';
  import EditorWorker from 'monaco-editor/editor/editor.worker?worker';
  self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
  ```

  Verified to build with Vite 7.3.8 and base `/relvista/editor/` (decision 0004 has the sizes).

- **Language:** `monaco.languages.register({ id: 'dbml', extensions: ['.dbml'] })`,
  `setMonarchTokensProvider('dbml', dbmlMonarchTokensProvider)`,
  `setLanguageConfiguration('dbml', dbmlLanguageConfig)` from `@dbml/parse` (the grammar
  dbdiagram uses: all element keywords incl. `Project`, `Table`, `Ref`, `Enum`, `TableGroup`,
  `TablePartial`, `Note`, `Records`, `DiagramView`, `Metadata`, `use`/`reuse`; settings; `//` and
  `/* */` comments; `'''` multi-line strings; backtick expressions; numbers and `#hex`). If an e2e
  token test finds a gap, `dbmlLanguage.ts` extends a structured clone of the official grammar —
  never forks it wholesale. Token types used by the themes: `keyword`, `identifier`, `string`,
  `string.escape`, `comment`, `number`, `number.hex`, `operators`, `delimiter`,
  `keyword.wildcard`, `@bracket` (all with the `.dbml` postfix).
- **Themes** (`themes.ts`): `relvista-light` (base `vs`) and `relvista-dark` (base `vs-dark`),
  background = `--rv-ui-solid` value, keyword `#2f6fed` / `#6f9bff`, string `#0f7b6c` /
  `#3cc7ae`, comment `#7b8598` / `#8d98ab` italic, number + hex `#b45309` / `#e6b836`, operators
  `#c2410c` / `#ff9e64`, identifier = row text colour. Contrast ≥ 4.5:1 on the background (unit
  test computes it).
- **Editor options:** `automaticLayout: true`, `minimap: { enabled: false }`, `fontFamily:
var(--rv-mono) value`, `fontSize: 13`, `lineHeight: 20`, `tabSize: 2`, `insertSpaces: true`,
  `detectIndentation: true`, `unusualLineTerminators: 'off'`, `formatOnPaste: false`,
  `formatOnType: false`, `wordBasedSuggestions: 'off'`, `stickyScroll: { enabled: true }`,
  `bracketPairColorization: { enabled: true }`, `scrollBeyondLastLine: false`,
  `fixedOverflowWidgets: true`, `padding: { top: 8 }`, `renderWhitespace: 'selection'`,
  `ariaLabel: 'DBML source'`.
- **Language service** (`languageService.ts`):

  ```ts
  export interface DbmlLanguageService {
    /** Replace all files (open). Keys as EditorFile.key. */
    setFiles(files: Record<string, string>): void;
    /** Called synchronously from onDidChangeContent (cheap: setSource only, compile is lazy). */
    updateFile(key: string, text: string): void;
    removeFile(key: string): void;
    /** Info diagnostics (with quick fixes) for one file, as Monaco markers. Run at 600 ms idle. */
    infoMarkers(key: string): monaco.editor.IMarkerData[];
    dispose(): void;
  }
  export function createDbmlLanguageService(
    m: typeof monaco,
    deps: { getModel(): DiagramModel | null; openFile(key: string, range?: monaco.IRange): void },
  ): DbmlLanguageService;
  ```

  One `Compiler(new MemoryProjectLayout())`, files at `'/' + key`; `initMonacoServices({
autocompletion: { triggerCharacters: ['.', ',', '[', ':', '~', '>', '<', '-', '"', '/'] } })`.
  Registered once for `dbml`: completion, definition, references, code actions (all wrapped in
  try/catch → empty result; a parser exception must never break typing). Definition/reference
  results: `uri` → `m.Uri.parse(String(loc.uri))`. Cross-file navigation via
  `m.editor.registerEditorOpener` → `deps.openFile`.

- **Markers** (`markers.ts`): owner `relvista` from the compile diagnostics of each file (error →
  `MarkerSeverity.Error`, warning → `Warning`; zero-width ranges widened to the word or one
  character; `code` as string; `source: 'dbml'`). Owner `dbml-info` from `infoMarkers`.
- **Hover** (`hover.ts`): word at position → `definitionProvider` → declaration range → the model
  element whose span starts there (same file). Tables: `**schema.table**`, alias, then up to 30
  columns as a Markdown table (`name`, `type`, `PK/FK/NN/U`), note (plain text, escaped), ref
  count. Enums: values. Columns (`table.column` in refs/settings): the column line and note.
  `MarkdownString` with `isTrusted: false`, `supportHtml: false`; all user text escaped.
- **Positions** (`positions.ts`): `spanToRange(span)`, `nodeAtPosition(model, fileKey,
position)` → innermost table, sticky note or group whose span contains the position (tables
  win over groups; `fromPartial` columns ignored).

### 4.7 Editor ↔ diagram sync (`diagram/sync.ts`)

- **Node click → code.** `onNodeClick` (no Shift/Meta/Ctrl): open the span's file tab, set the
  cursor at `span.start`, `revealRangeInCenterIfOutsideViewport`, and flash the block lines with a
  decoration for 800 ms (`.rv-flash`). Does not move focus into Monaco (so Delete/arrows keep
  acting on the canvas); Enter on a focused node does the same and focuses Monaco.
- **Cursor → highlight.** `onDidChangeCursorPosition`, debounced 100 ms: `highlightedNodeId =
nodeAtPosition(...)`; if it changed and the node is mostly hidden, `focusNode(id, {
onlyIfHidden: true, duration: 250 })`. Only while Monaco has focus (no feedback loop with clicks).
- **Context menu** (`NodeMenu.tsx`, also Shift+F10 / ContextMenu key on a node): Reveal in code ·
  Pin position / Unpin · Collapse / Expand (layout `collapsed`), applied to every selected node
  when the node is part of the selection (`handle.setNodeSettings`).
- **Undo/redo routing** (`keyboard.ts`): Mod+Z / Mod+Shift+Z / Mod+Y go to Monaco when focus is
  inside `.monaco-editor`, otherwise to the layout history. The diagram overlay has ↶ ↷ buttons
  (titles "Undo layout change (Mod+Z)"). History (`history.ts`): snapshots of `Layout`, cap 200,
  `'move'`/`'auto-layout'`/`'settings'` push, `'place'` and renames amend the current entry,
  opening a document clears it.

### 4.8 Top bar, menus, dialogs

| Control        | Behaviour                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Logo           | links to the docs site (`/relvista/`), opens in the same tab (guard applies)                              |
| File name      | entry name + ● when dirty (any file or layout); tooltip = full path / origin; `document.title` mirrors it |
| New ▾          | Empty · From example ▸ (14 examples, grouped; `12-modules` opens as a folder workspace) · From SQL…       |
| Open ▾         | Open file… · Open folder… · Open from URL… · Recent ▸ (Chromium) · Restore previous session               |
| Save / Save as | §4.4; Save disabled when nothing is dirty and a handle exists                                             |
| Share          | §4.5 dialog                                                                                               |
| Export ▾       | SVG · PNG · Print / PDF · DBML file · Layout JSON · SQL ▸ PostgreSQL / MySQL / SQL Server / Oracle        |
| Auto-layout ▾  | Arrange (keeps pinned) — Mod+Alt+L · Place new tables only                                                |
| View           | `<select>`: All tables + each `DiagramView`; changes `workspace.view` (per-view layout)                   |
| Theme ◐        | cycles system → light → dark; writes `localStorage.theme` ('light'/'dark', removed for system)            |
| Help ?         | shortcuts table, DBML docs link, layout-file docs link, how saving works, version, GitHub                 |

Menus: one `Menu.tsx` (button `aria-haspopup="menu"`, `role="menu"`, roving tabindex, arrows,
Home/End, type-ahead, Esc returns focus). Dialogs: native `<dialog>` with `showModal()` (focus
trap, Esc), labelled by their heading. Toasts: `role="status"`, 5 s, pausable on hover/focus.

Empty state (no text): centred card over the code pane "Start typing DBML, or open an example" with
buttons New from example / Open file; the diagram pane says "No tables yet".

**SQL** (`sql/`): module worker `new Worker(new URL('./sql.worker.ts', import.meta.url), { type:
'module' })`; messages `{ id, op: 'export', dbml, format: 'postgres'|'mysql'|'mssql'|'oracle' }`
→ `{ id, ok, text | error }` and `{ id, op: 'import', sql, format: 'postgres'|'mysql'|'mssql'|
'snowflake'|'oracle' }`. Export uses `exporter.export(dbml, format)` on the entry text (disabled
with a tooltip for multi-file workspaces and while there are errors); result downloads as
`<name>.sql`. Import opens a **new** untitled workspace with the generated DBML (never touches the
current one). First use shows "Loading SQL support (2.6 MB)…".

**Examples** (`examples.ts`): `import.meta.glob('../../../examples/**/*.dbml', { query: '?raw',
import: 'default' })` (lazy); folder examples become folder workspaces with `main.dbml` entry.

### 4.9 Layout, split, responsive, accessibility

- Split: `SplitPane` with a 6 px separator (`role="separator"`, `aria-orientation="vertical"`,
  `aria-valuenow` in %, arrows ±2%, Home/End, double-click resets to 40%); min 280 px per pane;
  persisted in the session.
- < 768 px: `MobileTabs` (`role="tablist"`, Code / Diagram; Alt+1 / Alt+2 on desktop focus the
  panes), overflow menu for New/Open/Save as/Export/Auto-layout/View/Theme/Help.
- Status bar (`role="status"` region with polite live updates of the diagnostics count only):
  `⨯ n` / `⚠ n` (click → `editor.action.marker.next`), `12 tables · 14 refs` (in a view: `5 of 61
tables`), `Ln, Col`, envelope `UTF-8[ with BOM] · LF|CRLF|CR|Mixed`, save state `Saved ·
Unsaved · Autosaved locally · Downloaded`.
- Axe (wcag2a, wcag2aa) clean on the main screen, dialogs open, both themes (Monaco's own
  internals excluded via `.exclude('.monaco-editor')`).

### 4.10 Keyboard shortcuts (`keyboard.ts`)

| Keys (Mod = Cmd on macOS, Ctrl elsewhere) | Action                                      | Where          |
| ----------------------------------------- | ------------------------------------------- | -------------- |
| Mod+S                                     | Save                                        | everywhere¹    |
| Mod+Shift+S                               | Save as                                     | everywhere¹    |
| Mod+O                                     | Open file                                   | everywhere¹    |
| Mod+Z / Mod+Shift+Z, Mod+Y                | Undo / redo (text in Monaco, else layout)   | everywhere     |
| Mod+Alt+L                                 | Auto-layout (keeps pinned)                  | everywhere     |
| Shift+1                                   | Fit diagram                                 | diagram focus  |
| + / −                                     | Zoom in / out                               | diagram focus  |
| Arrows (Shift: fine)                      | Move selected nodes                         | diagram focus  |
| Enter                                     | Reveal focused node in code                 | diagram focus  |
| Alt+1 / Alt+2                             | Focus code / diagram (switch tab on mobile) | everywhere     |
| ?                                         | Help                                        | outside Monaco |
| F1, Mod+F, Mod+Shift+K …                  | Monaco's own (command palette, find, …)     | Monaco         |

¹ Inside Monaco registered with `editor.addCommand` so Monaco does not swallow them. No
"format document" binding exists — relvista never rewrites text. Mod+N is not used (browsers
reserve it).

---

## 5. Docs-site integration (builder B)

- `docusaurus.config.ts` navbar: `{ to: 'pathname:///editor/', label: 'Editor', position: 'left' }`
  (rendered href must be exactly `/relvista/editor/`; docs e2e asserts it). `themeConfig.dbml.
editorUrl: '/relvista/editor/'` so local builds link to the local copy (the theme default is
  the deployed URL).
- Landing page hero: primary CTA **Open the editor** (`pathname:///editor/`), secondary
  **Get started**; under the fence demo a link "Edit this example in the editor" built with
  `createEditorLink` at runtime.
- New docs page `docs/editor.md` (sidebar after Getting started): what the editor does, files and
  the sidecar, why "Open folder" is best, saving guarantees (byte-exact), share links, shortcuts,
  browser support table (FSA vs download fallback).
- Gallery pages already get "Open in editor" through the theme default.
- `README.md` status line: phase 2.

---

## 6. Tests

### 6.1 Unit (vitest)

Renderer: §3.7. Editor (`apps/editor/test/`):

| File                | Covers                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text.test.ts`      | decode/encode; BOM; UTF-16 BOM and invalid UTF-8 rejected; envelope detection (LF, CRLF, CR, mixed, none); `saveBytes` identity for every example × {as is, CRLF, BOM, BOM+CRLF, mixed, CR, no final newline}; edit one line of a mixed file changes only that line; 500 random mixed files with random edits (seeded) keep every untouched line's terminator |
| `lineDiff.test.ts`  | Myers correctness vs brute-force LCS on small random inputs; fallback path                                                                                                                                                                                                                                                                                    |
| `renames.test.ts`   | table/note/group rename pairing; ambiguous → none; typing a name char by char                                                                                                                                                                                                                                                                                 |
| `positions.test.ts` | span ↔ range; nodeAtPosition (nested group/table, partial columns, multi-file)                                                                                                                                                                                                                                                                                |
| `markers.test.ts`   | severity mapping; zero-width widening; per-file filtering                                                                                                                                                                                                                                                                                                     |
| `history.test.ts`   | push/undo/redo/cap; 'place' amends; clear on open                                                                                                                                                                                                                                                                                                             |
| `session.test.ts`   | SessionV1 round trip (fake-indexeddb not installed: test the (de)serialiser and the idb helper against a minimal in-memory IDB shim written in the test)                                                                                                                                                                                                      |
| `shareLink.test.ts` | hash read on load (good, legacy, damaged), size thresholds, multi-file note                                                                                                                                                                                                                                                                                   |
| `remote.test.ts`    | GitHub blob rewrite; rejected schemes; size cap (mock fetch)                                                                                                                                                                                                                                                                                                  |
| `folder.test.ts`    | entry choice, limits, skip rules (fake handle tree)                                                                                                                                                                                                                                                                                                           |
| `keyboard.test.ts`  | undo routing by focus; Mod mapping per platform                                                                                                                                                                                                                                                                                                               |
| `themes.test.ts`    | token colour contrast ≥ 4.5:1 on both backgrounds                                                                                                                                                                                                                                                                                                             |

Monaco itself is not loaded in jsdom; everything that touches it is covered by e2e.

### 6.2 End-to-end (Playwright, `apps/editor/e2e/`)

Served by `vite preview --base /relvista/editor/` on a free port (same pattern as
`apps/docs/playwright.config.ts`), Chromium, 1360×900 plus a 390×844 project for `mobile.spec`.
`e2e/fsMock.ts` is injected with `page.addInitScript`: an in-memory file system implementing
`showOpenFilePicker`, `showSaveFilePicker`, `showDirectoryPicker`, handles with `getFile` /
`createWritable` / `requestPermission`, seeded and read back by tests via `page.evaluate`
(test-only; the app ships no hooks). A second mode deletes those globals to exercise the
fallback (input + downloads, `page.waitForEvent('download')`).

| Spec                   | Asserts                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `roundtrip.spec.ts`    | **Gate.** Every `examples/*.dbml` × {as is, CRLF, BOM, BOM+CRLF, mixed, CR, no final newline} and the `12-modules` folder: open → Save → bytes identical, no sidecar written; same through the fallback for as is / CRLF / BOM; type a char + undo → Save → identical; edit one line → only that line differs |
| `open-example.spec.ts` | New ▸ From example ▸ 02 → table count = model count, `data-rv-layout="done"`, no console errors                                                                                                                                                                                                               |
| `live-edit.spec.ts`    | type a new `Table` → node appears < 1 s; break the syntax → error squiggle, status `1 error`, chip shown, diagram keeps last good; fix → chip gone                                                                                                                                                            |
| `drag.spec.ts`         | drag a table → Save → sidecar JSON has the node id with the new x/y (integers); Mod+Z on canvas restores and file dirty state follows; drag a group → member positions change; named view drag writes an override only                                                                                        |
| `autolayout.spec.ts`   | pin a table, Auto-layout → pinned position unchanged, others changed                                                                                                                                                                                                                                          |
| `sync.spec.ts`         | click table → cursor on its `Table` line; cursor into another block → `rv-highlighted` on that node                                                                                                                                                                                                           |
| `language.spec.ts`     | completion after `ref: > ` lists tables; F12 on a ref target jumps to the table; hover shows columns; tokens of `Table`, `'''…'''`, backtick, `// c` get the theme colours (computed style)                                                                                                                   |
| `share.spec.ts`        | Share → copy (clipboard permission) → open link in a new page → same text, same positions, same view; a phase-1 `#dbml=<uri-encoded>` link opens; a link made by renderer `createEditorLink` opens                                                                                                            |
| `url.spec.ts`          | `?url=` (route-mocked, CORS headers) loads text + sidecar; GitHub blob URL rewritten; 404 dialog                                                                                                                                                                                                              |
| `session.spec.ts`      | edit → reload → text, layout, view restored; `beforeunload` dialog appears when dirty                                                                                                                                                                                                                         |
| `export.spec.ts`       | SVG download contains table names; PNG is a PNG; DBML export bytes = save bytes; layout JSON parses; SQL PostgreSQL export contains `CREATE TABLE`                                                                                                                                                            |
| `mobile.spec.ts`       | 390×844: tabs switch panes, overflow menu reachable, no horizontal scroll                                                                                                                                                                                                                                     |
| `a11y.spec.ts`         | axe clean (light, dark, Share dialog open, Help open); full keyboard path: Tab to Open, Enter, Esc                                                                                                                                                                                                            |

Root scripts: `test:e2e:editor` → `pnpm --filter relvista-editor test:e2e` (after
`pnpm --filter relvista-editor... build`). CI (`ci.yml`): after the docs e2e step, install is
shared; add "Phase-2 gate (editor round trip)" running it. Docs e2e: navbar "Editor" href and the
built `build/editor/index.html` exists.

### 6.3 Performance budget (measured in e2e, logged; asserted loosely)

- `14-large`: keystroke → markers + diagram update ≤ 250 ms (debounce included) on CI Chromium;
  compile itself ≤ 40 ms (if over, move compile to a worker in phase 3 — the model is
  serialisable by design).
- First load to interactive editor ≤ 3 s on CI (`vite preview`, no throttling).
- Drag of a table in `14-large` stays at ≥ 50 fps (no main-thread task > 50 ms during drag).

---

## 7. Build and deploy (builder B)

### 7.1 `apps/editor` scripts

```json
"scripts": {
  "dev": "vite",
  "build": "tsc -p tsconfig.json --noEmit && vite build",
  "preview": "vite preview",
  "typecheck": "tsc -p tsconfig.json --noEmit",
  "test": "vitest run",
  "test:e2e": "playwright test"
}
```

`vite.config.ts`: `base: process.env.RELVISTA_EDITOR_BASE ?? '/relvista/editor/'`, `plugins:
[react()]`, `worker: { format: 'es' }`, `build: { target: 'es2022', sourcemap: true,
chunkSizeWarningLimit: 5000 }`, `server: { fs: { allow: [repoRoot] } }`. ELK:
`import elkWorkerUrl from 'elkjs/lib/elk-worker.min.js?url'` passed as `workerUrl`. Renderer CSS:
`import '@relvista/renderer/styles.css'`.

Root `package.json` additions: `"editor:dev": "pnpm --filter \"relvista-editor^...\" build &&
pnpm --filter relvista-editor dev"`, `"test:e2e:editor"` (above).

### 7.2 One Pages artifact

- `apps/docs/package.json`: devDependency `"relvista-editor": "workspace:*"`; `build` becomes
  `node scripts/sync-assets.mjs && docusaurus build && node scripts/copy-editor.mjs`.
- `apps/docs/scripts/copy-editor.mjs`: copies `apps/editor/dist/**` to `apps/docs/build/editor/`
  (fails loudly if `dist/index.html` is missing); `--check` not needed (output is git-ignored).
- `pnpm docs:build` (`--filter relvista-docs...`) now builds core → renderer → theme → editor →
  docs. `deploy-docs.yml` is unchanged (uploads `apps/docs/build`). `docusaurus serve` serves
  `/relvista/editor/` too, so docs e2e can check it.
- _Recorded during integration:_ `docusaurus serve` redirects `/relvista/editor/` to
  `/relvista/editor` (it applies `trailingSlash: false` to folders too), which GitHub Pages never
  does. The editor e2e therefore serves `apps/docs/build` with `apps/docs/scripts/serve-site.mjs`
  (Pages semantics: folders get a trailing slash, `x` → `x.html`, `404.html`), so
  `pnpm test:e2e:editor` needs `pnpm docs:build` first and also covers docs → editor links
  (`site.spec.ts`). `RELVISTA_EDITOR_E2E_SERVER=preview` keeps the `vite preview` mode.
  `copy-editor.mjs` leaves source maps out of the artifact. The theme repeats
  `DEFAULT_EDITOR_URL` in `defaults.ts` (a test keeps it equal to the renderer's) so config
  validation in Node never loads the renderer, and the renderer's `exports` gained a `default`
  condition because Docusaurus' server bundle resolves `import()` with `require` conditions.

---

## 8. Work order and hand-off

1. **A, first (unblocks B):** `share/` codec + `DEFAULT_EDITOR_URL` + `layoutEdit.ts` with tests;
   export them. Then `DiagramCanvas` (props and handle exactly as §3.2), then refactor
   `DbmlViewer` onto it, then theme default.
2. **B, in parallel:** scaffold (§7.1), Monaco setup + language service + markers, files/text
   (gate unit tests), file I/O, shell UI, session. Until `DiagramCanvas` lands, B may render the
   diagram pane with `DbmlViewer` behind the same `DiagramPane` props, then switch.
3. **B, then:** sync, drag/undo, share, SQL, docs integration, e2e.
4. Done when: `pnpm format:check && pnpm lint && pnpm build && pnpm typecheck && pnpm test &&
pnpm validate:examples && pnpm test:e2e && pnpm test:e2e:editor` pass, and the gate spec is
   green.

## 9. Open questions (decide during build, record here)

- Whether `register.all` should be trimmed to a feature list (measure after the app exists).
- Whether info markers (`@dbml/parse` lint) are noisy on real dbdiagram files; if so, off by
  default with a toggle in Help.
