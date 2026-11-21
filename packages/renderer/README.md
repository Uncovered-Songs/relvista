# @relvista/renderer

React components that draw **relvista** DBML diagrams: a pure SVG renderer (SSR-safe), an
interactive viewer and an editable canvas built on [React Flow](https://reactflow.dev), and export
to SVG, PNG, PDF and print. The models and layouts come from
[`@relvista/core`](https://www.npmjs.com/package/@relvista/core).

Documentation: <https://relvista.github.io/relvista/> · API reference:
<https://relvista.github.io/relvista/docs/api/>

## Install

```sh
npm install @relvista/renderer
```

Peer dependencies: `react` and `react-dom` 18 or 19 (`^18.0.0 || ^19.0.0`, both tested). ESM only; TypeScript types are included.
`@relvista/core` comes with it.

## Interactive viewer

```tsx
import { DbmlViewer } from '@relvista/renderer';
import '@relvista/renderer/styles.css'; // relvista's styles, imports React Flow's CSS

const dbml = `
Table users {
  id integer [pk]
}
Table posts {
  id integer [pk]
  user_id integer [ref: > users.id]
}
`;

export function Schema() {
  return <DbmlViewer source={dbml} height={520} colorMode="dark" />;
}
```

`DbmlViewer` keeps the last valid diagram while the DBML has errors, lays tables out (dagre first,
then ELK in a worker), honours saved positions from a `layout` file, switches DiagramViews and has
a toolbar for zoom, fit, fullscreen, export, print and "Open in editor". It needs a browser: on the
server, render `DiagramSvg` instead.

## Static SVG (server-side rendering)

```tsx
import { compileDbml, layoutDiagramSync } from '@relvista/core';
import { DiagramSvg, renderDiagramSvgString } from '@relvista/renderer';

const { model } = compileDbml(dbml);
if (model) {
  const geometry = layoutDiagramSync(model);
  const element = <DiagramSvg model={model} geometry={geometry} title="Schema" />;
  const svgFile = renderDiagramSvgString(model, geometry); // standalone .svg text
}
```

## What is in it

- `DiagramSvg` and its parts (`TableSvg`, `RefSvg`, `GroupSvg`, `NoteSvg`, …): pure SVG, no
  browser APIs, sized with core's `METRICS` so pictures match `measureTable` and the layout.
- `DbmlViewer` and `DiagramCanvas`: the interactive viewer and the canvas inside it, which is also
  editable (the relvista editor uses it): controlled `layout` + `onLayoutChange`, auto-layout,
  pin and collapse, per-view layouts, highlight, an imperative handle (fit, focus, export).
- Export: `renderDiagramSvgString`, `exportPng`, `exportPdf` (tiled multi-page PDF; jsPDF loads
  only when called), `printDiagram`, `downloadBlob`.
- Links: `encodeShareHash` / `decodeShareHash` (compressed `#dbml=` share links),
  `createEditorLink`, deep-link targets (`#table=`, `#view=`).
- Layout edits: `setNodePositions`, `setNodeSettings`, `effectivePositions`, `nodeEntry`.

## Styles and colours

`@relvista/renderer/styles.css` is one import for everything; it pulls in React Flow's stylesheet,
which is also published on its own as `@relvista/renderer/xyflow.css`. Colours are `--rv-*` CSS
variables declared with zero specificity, so any rule of yours overrides them; dark mode is
`data-rv-color-mode="dark"`. Inline fallbacks keep a bare SVG (an exported file) correct without
the stylesheet. The variables are listed in the
[colours guide](https://relvista.github.io/relvista/docs/colours).

## Credits and licence

MIT. The interactive viewer is built on [React Flow](https://reactflow.dev) (MIT, by xyflow); its
attribution badge is hidden in the canvas and credited here instead. PDF export uses
[jsPDF](https://github.com/parallax/jsPDF) and [svg2pdf.js](https://github.com/yWorks/svg2pdf.js)
(both MIT).
