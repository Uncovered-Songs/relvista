# Pre-1.0 changesets (archive)

Nothing was published before 1.0.0. While phases 1–3 were built, each integration step wrote a
[changeset](https://github.com/changesets/changesets) describing its increment. They were replaced
by one user-facing 1.0 entry per package (`.changeset/release-1-0-*.md`) so the 1.0.0
`CHANGELOG.md` files describe the release rather than its construction (some increments were undone
by later ones, for example the router default in wave 1). The original text is kept here verbatim.

## `docusaurus-plugin-phase1.md`

Bumps: `@relvista/docusaurus-plugin` minor.

First version: ` ```dbml ` fences and `@theme/DbmlDiagram` render interactive ER diagrams in Docusaurus.

## `phase2-editor.md`

Bumps: `@relvista/renderer` minor, `@relvista/docusaurus-plugin` minor.

Phase 2, the editor. `@relvista/renderer` adds `DiagramCanvas` (an editable canvas: drag tables,
notes and groups, multi-select, keyboard moves, per-view layouts, pin and collapse, auto-layout),
pure layout-edit helpers (`effectivePositions`, `setNodePositions`, `setNodeSettings`), and a
compressed share-link codec (`encodeShareHash`, `decodeShareHash`, `createEditorLink`,
`DEFAULT_EDITOR_URL`); `DbmlViewer` is built on the new canvas, and its "Open in editor" link now
carries the layout and view (phase-1 `#dbml=` links still open). The package also exports a
`default` condition for CommonJS-style bundler builds. `@relvista/docusaurus-plugin`:
`themeConfig.dbml.editorUrl` now defaults to the hosted relvista editor; set it to `false` to hide
"Open in editor".

## `phase3-wave1.md`

Bumps: `@relvista/core` minor, `@relvista/renderer` minor, `@relvista/docusaurus-plugin` patch.

Phase 3, wave 1 (engines). `@relvista/core`: collapsed TableGroups in the layout (a layout entry
`group:<name>` with `collapsed: true` becomes one card; `collapsedGroupIds`, `collapsedGroupLabel`,
`measureCollapsedGroup`), saved note sizes (`w`/`h`, clamped to
`METRICS.noteMinWidth`..`noteMaxWidth`), a new `engine: 'auto'` (dagre for small components, ELK for
the rest; `needsElk`, `AUTO_DAGRE_MAX_NODES`), and graph analysis: `searchModel`, `neighborhood`,
`shortestPath`, `resolveTableRef`, `subsetModel`, and a model diff (`diffModels`, `mergeForDiff`,
`formatDiff`). `@relvista/renderer`: an obstacle-avoiding orthogonal router (`RouteContext.avoid:
'tables'`, incremental `routeAll`; the default stays `'none'` for now),
decorations for search hits, paths and diffs (`Decorations`, also in SVG export), collapsed group
cards with merged refs, notes clipped to their box, inactive refs drawn under active ones at 60 %
opacity, and new palette keys `match`, `path`, `diffAdded`, `diffRemoved`, `diffChanged`.
`@relvista/docusaurus-plugin`: the site palette maps the `match` and `path` tones to the site
primary.

## `phase3-wave2.md`

Bumps: `@relvista/renderer` minor, `@relvista/docusaurus-plugin` minor.

Phase 3, wave 2. `@relvista/renderer`: refs now route around tables by default
(`RouteContext.avoid` defaults to `'tables'`, in the canvas, `DiagramSvg` and every export).
`DiagramCanvas` v1: collapsible TableGroups (double-click a group header or a collapsed card;
saved as `group:<name>` `collapsed` in the layout), resizable notes and tables (`resizable`, a new
`'resize'` layout change), `decorations`, `highlightIds`, `focus` (`{ ids, hops }`),
`displayModel`, edge and pane events (`onEdgeClick`, `onEdgeContextMenu`, `onPaneContextMenu`,
`onPaneDoubleClick`), handle methods `focusNodes`, `getNodeClientRect`, `clientToDiagram` and
`placeNodes`, and the `'auto'` layout engine (ELK only starts when `needsElk` says so). New pure
helpers `setNodeSizes` and `setGroupsCollapsed`, and types `CanvasFocus`, `CanvasEdgeEvent`,
`CanvasPaneEvent`, `CanvasResizable`, `NodeSize`. Multi-page PDF export (`exportPdf`,
`exportPdfWithReport`, `planTiles`, `planDocument`; jsPDF and svg2pdf.js load lazily on the first
export), a deep-link codec (`parseDiagramTarget`, `formatDiagramTarget`, `parseAnchoredTarget`,
`formatAnchoredTarget`) and diff decorations (`diffDecorations`, `diffLegend`, `diffBadge`).
`@relvista/docusaurus-plugin`: diagrams are drawn at build time as static SVG in the page HTML
(visible without JavaScript, in print and to crawlers); the interactive viewer takes over with the
same positions and ELK never runs in the browser for them. New `themeConfig.dbml.ssr` (default
`true`), `ssr` prop and fence meta `ssr=false`. jsPDF's optional dependency aliases now apply only
to jsPDF's own imports, so `@docusaurus/theme-mermaid` keeps DOMPurify.

## `phase3-wave3.md`

Bumps: `@relvista/core` patch, `@relvista/renderer` minor, `@relvista/docusaurus-plugin` minor.

Phase 3, wave 3. `@relvista/renderer`: viewer v1. `DbmlViewer` gains search (toolbar, `/`,
Mod+K; tables, columns, enums, views) and path mode (shortest relationship path between two
tables), a Names · Keys · All detail menu, "Show related" focus with hop controls, "PDF…" export
(tiled or one page per view), a copy-link button (`anchor`, `onLinkCopy`), deep-link state
(`target`, `onTargetChange`), `decorations`, `diffAgainst` (merged model with diff tones and a
legend) and `ssrLayout` (build-time positions that never reach the editor link); the default
toolbar order is view, search, detail, zoom, fit, fullscreen, export, print, link,
open-in-editor. New navigation components for hosts and the editor: `SearchPanel`,
`DetailSwitch`, `FocusControl`, `PdfDialog`, with `pathOrder`, `pathText`, `tiledPageCount`,
`withSsrPositions` and `hitDecorations`. `@relvista/docusaurus-plugin`: `themeConfig.dbml.toolbar`
accepts `search`, `detail` and `link` (default on; `link` shows once the theme passes an anchor).
All three packages: npm packaging for 1.0 (complete metadata, `README.md` and `LICENSE` in each
tarball, no source maps, clean builds, `ajv` pinned exactly; checked by `pnpm packages:check`
with publint and arethetypeswrong).

## `phase3-wave4.md`

Bumps: `@relvista/renderer` minor, `@relvista/docusaurus-plugin` minor.

Phase 3, wave 4. `@relvista/docusaurus-plugin`: every diagram gets an anchor (the `id` prop or
fence meta, else the title's slug, else a stable hash) that Docusaurus' broken-anchor check knows;
a `#anchor&table=…` link scrolls to the diagram and opens it in that state, and the viewer's state
is written back to the URL while the hash names it. New `@theme/DbmlDiff` component and
` ```dbml-diff ` fence (old and new version split by a `---` line): the build-time HTML carries the
merged, toned SVG and a "Changes (+2 −2 ~2)" list; build-time positions reach the viewer as
`ssrLayout`, so "Open in editor" links no longer carry them. `@relvista/renderer`: `paddedBounds`
and `PDF_DIAGRAM_PADDING` are exported; `PdfDialog` selects every view in "One page per view" until
the user picks views; `DbmlViewer` reports a change the user makes right after the first layout or
an applied target (it was dropped during the 600 ms quiet time).
