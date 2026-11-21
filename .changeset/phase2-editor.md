---
'@relvista/renderer': minor
'@relvista/docusaurus-plugin': minor
---

Phase 2, the editor. `@relvista/renderer` adds `DiagramCanvas` (an editable canvas: drag tables,
notes and groups, multi-select, keyboard moves, per-view layouts, pin and collapse, auto-layout),
pure layout-edit helpers (`effectivePositions`, `setNodePositions`, `setNodeSettings`), and a
compressed share-link codec (`encodeShareHash`, `decodeShareHash`, `createEditorLink`,
`DEFAULT_EDITOR_URL`); `DbmlViewer` is built on the new canvas, and its "Open in editor" link now
carries the layout and view (phase-1 `#dbml=` links still open). The package also exports a
`default` condition for CommonJS-style bundler builds. `@relvista/docusaurus-plugin`:
`themeConfig.dbml.editorUrl` now defaults to the hosted relvista editor; set it to `false` to hide
"Open in editor".
