# Phase 1 contracts

Fixed interfaces so core, renderer and the Docusaurus theme can be built in parallel.

## @relvista/core — geometry (src/geometry/)

- `types.ts` — `DiagramGeometry`, `NodeGeometry`, `GroupGeometry`, `EdgeGeometry`, `LayoutOptions`, `TextMeasure` (`DetailLevel` comes from layout/types) (already written; authoritative).
- `metrics.ts` — `METRICS` constants (header height, row height, paddings, min/max table width,
  note width, group padding, font sizes and font family) and `estimateTextWidth(text, role)`.
  **The renderer must draw with exactly these metrics**, so layout sizes match what is drawn.
- `measure.ts` — `measureTable(table, detailLevel, measure?)`, `measureNote(note, measure?)` →
  `{ width, height }`. `detailLevel`: `all` = every column, `keys` = pk/fk/unique only, `names` = header only.
- `layout.ts` — `layoutDiagram(model, options?) : Promise<DiagramGeometry>` (ELK layered, column ports,
  groups as compound nodes, runs in a worker in browsers when available, otherwise inline) and
  `layoutDiagramSync(model, options?) : DiagramGeometry` (dagre or grid). Both honour `options.saved`
  positions, keep pinned nodes fixed, compute group boxes and bounds, and are deterministic.
- `model` passed in is already view-filtered (`selectView`).
- `EdgeGeometry.points` run from the `ref.from` table to the `ref.to` table, whatever direction the
  engine used (ELK lays refs out parent → child). The renderer puts `ref.from`'s marker on
  `points[0]`.
- `NodeGeometry.detailLevel` is set when a table was measured at another level than the layout's
  (a saved `collapsed: true` node is `names`); the renderer draws that table, and attaches its refs,
  at that level.
- `LayoutOptions.aspectRatio` (width / height of the viewport, default 1.6): disconnected parts and
  sticky notes are packed to that shape.
- `columnTypeLabel(column)` is the type text that is measured and drawn; `columnBadges(column)` /
  `badgesWidth()` give the NN / U / note badges and the room `measureTable` reserves for them
  (`METRICS.badge`), and `METRICS.headerNoteIconWidth` the header note icon. Column types are drawn
  in `monoFontFamily`, and `estimateTextWidth(text, 'columnType')` estimates them as monospace.
- Self refs loop out of the left edge of their table by `METRICS.selfLoopReach`; layout counts the
  loop in `bounds`.

## @relvista/renderer

```ts
// pure, SSR-safe SVG; no browser APIs
<DiagramSvg model geometry colorMode?="light"|"dark" detailLevel? highlight?: string[] />
renderDiagramSvgString(model, geometry, opts) : string        // standalone SVG with inline styles
exportPng(model, geometry, opts) : Promise<Blob>              // browser only
printDiagram(model, geometry, opts) : void                    // browser only, hidden iframe + @page CSS

// interactive viewer (browser only; React Flow inside)
<DbmlViewer
  source: CompileInput            // string or { files, entry }
  layout?: Layout | null          // parsed layout file
  view?: string                   // DiagramView name; default all
  height?: number | string        // default 480
  colorMode?: 'light' | 'dark'
  title?: string
  toolbar?: Array<'zoom' | 'fit' | 'fullscreen' | 'export' | 'print' | 'view' | 'open-in-editor'>
  editorUrl?: string
  onDiagnostics?: (d: Diagnostic[]) => void
  minimap?: boolean | 'auto'      // default 'auto': ≥ 8 tables and viewer ≥ 600px wide, or
                                  // whenever part of the diagram is off-screen (smaller < 600px)
  workerUrl?: string | URL        // elk-worker.min.js; ELK then runs in a Web Worker
/>
```

- Styles: `@relvista/renderer/styles.css`, all colours as `--rv-*` CSS variables, dark mode via
  `[data-rv-color-mode="dark"]` on the viewer root.
- Fullscreen: `requestFullscreen()` on the viewer root; fallback fixed overlay closed with Esc.
- Parse errors: last good diagram stays; an error banner lists diagnostics with line:column, in
  source order.
- Initial view: fit when the fit zoom is at least the fit floor (0.45 for up to 12 tables, 0.55
  above, 0.5 below 600px wide), so small diagrams open whole. Otherwise the zoom that fills one
  axis when it lies between the floor and the readable zoom (0.85; 0.75 below 600px wide), else
  the readable zoom, on the window showing the most whole tables: the first declared table is
  whole when it fits, tables hidden just left of / above the window cost more than they gain (a
  first view never skips the first column for one more table), tables at the viewer edges are
  whole, not sliced, nothing starts under the title / toolbar band, a table under the minimap
  counts as not shown, and ties go to the top-left. The 'auto' minimap then shows that there is
  more; when the chosen window still leaves a table under it, the minimap waits for the first pan
  or zoom (it is opaque, never drawn over a table in the first view). The Fit button shows
  everything.
- Refs whose ends meet at the same port (table, row, side) are fanned out vertically within the row
  (12px apart for two), so every end keeps its own cardinality marker. A saved `viewport` is kept when the ELK layout replaces
  the first (dagre) one.
- Below 600px wide the title moves to the bottom-left, zoom and print buttons are hidden (pinch
  zoom), and the viewer shrinks to the height the diagram needs.
- An unknown `view` logs a warning and shows all tables; an empty view says so. "Open in editor" is
  hidden for multi-file sources (the `#dbml=` link carries one file).

## @relvista/docusaurus-theme

- Wraps `@theme-init/CodeBlock`: `language-dbml` → `<DbmlDiagram value=… {...meta} />`;
  meta keys `title`, `height`, `view`, `layout` (JSON path in static/), `source` (show code tab).
- `@theme/DbmlDiagram` props: `value` | `src`, `layout`, `view`, `height`, `title`. Renders
  `DbmlViewer` inside `BrowserOnly` + error boundary, colour mode from `useColorMode`, and passes
  the URL of ELK's worker script (emitted by the theme's webpack rule for
  `elkjs/lib/elk-worker.min.js?relvista-worker`) so auto-layout runs off the main thread.
- `configureWebpack`: `.dbml` → `asset/source`, `?relvista-worker` → `asset/resource`;
  `getPathsToWatch`; `validateThemeConfig` for `themeConfig.dbml`.
