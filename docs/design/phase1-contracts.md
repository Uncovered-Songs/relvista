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
/>
```

- Styles: `@relvista/renderer/styles.css`, all colours as `--rv-*` CSS variables, dark mode via
  `[data-rv-color-mode="dark"]` on the viewer root.
- Fullscreen: `requestFullscreen()` on the viewer root; fallback fixed overlay closed with Esc.
- Parse errors: last good diagram stays; an error banner lists diagnostics with line:column.

## @relvista/docusaurus-theme

- Wraps `@theme-init/CodeBlock`: `language-dbml` → `<DbmlDiagram value=… {...meta} />`;
  meta keys `title`, `height`, `view`, `layout` (JSON path in static/), `source` (show code tab).
- `@theme/DbmlDiagram` props: `value` | `src`, `layout`, `view`, `height`, `title`. Renders
  `DbmlViewer` inside `BrowserOnly` + error boundary, colour mode from `useColorMode`.
- `configureWebpack`: `.dbml` → `asset/source`; `getPathsToWatch`; `validateThemeConfig` for `themeConfig.dbml`.
