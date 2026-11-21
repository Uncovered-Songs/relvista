# @relvista/renderer

React renderer for **relvista** DBML diagrams: pure SVG drawing, standalone export, and an
interactive viewer built on React Flow. See [phase 1 contracts](../../docs/design/phase1-contracts.md).

```tsx
import { DbmlViewer, DiagramSvg, renderDiagramSvgString } from '@relvista/renderer';
import '@relvista/renderer/styles.css'; // includes React Flow's CSS

<DbmlViewer source={dbml} layout={layout} view="core" height={520} colorMode="dark" />;
```

- `DiagramSvg` — SSR-safe SVG (`model`, `geometry`, `colorMode`, `detailLevel`, `highlight`).
  Draws with core's `METRICS`, so sizes match `measureTable` / the layout.
- `renderDiagramSvgString`, `exportPng`, `printDiagram`, `downloadBlob` — export.
- `DbmlViewer` — browser-only viewer: keeps the last valid diagram on parse errors, view switcher,
  dagre layout first then ELK, saved positions from the layout file, hover highlight, table
  details card, toolbar (zoom, fit, fullscreen, SVG/PNG export, print, open in editor).
- `DiagramCanvas` — the canvas inside `DbmlViewer`, also editable (the editor): controlled
  `layout` + `onLayoutChange(next, change)` for drags (tables, notes, groups), auto-placement,
  auto-layout and pin/collapse, per-view layouts, highlight, node events and an imperative handle
  (fit, focus, auto-layout, export). See [phase 2 design](../../docs/design/phase2-editor.md) §3.
- `setNodePositions`, `setNodeSettings`, `effectivePositions`, `nodeEntry` — pure layout edits.
- `encodeShareHash`, `decodeShareHash`, `createEditorLink` — compressed `#dbml=` share links.

The interactive viewer is built on [React Flow](https://reactflow.dev) (MIT, by xyflow); its
attribution badge is hidden in the canvas and credited here instead.

Colours are `--rv-*` CSS variables (light and dark palettes in `styles.css`; dark mode via
`data-rv-color-mode="dark"`), with inline fallbacks so a bare SVG renders correctly.
